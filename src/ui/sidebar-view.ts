import {ItemView, WorkspaceLeaf, setIcon} from "obsidian";
import {AudioManager} from "../audio/audio-manager";
import type RpgAudioPlugin from "../main";
import {
	PlayState,
	SIDEBAR_VIEW_TYPE,
	EVENT_TRACK_CHANGED,
	EVENT_TRACKS_UPDATED,
	EVENT_MASTER_VOLUME,
	EVENT_ALLOW_AUTOPLAY,
	EVENT_ACTIVE_SCOPE_CHANGED,
	EVENT_STICKY_CHANGED,
	AudioTrackState,
} from "../types";
import {updateFadeToggle} from "./player-controls";
import {anyInState, buildSidebarSections, groupByFolder, sidebarFadeDuration} from "./sidebar-sections";
import {SidebarHeader} from "./sidebar-header";
import {SidebarFooter} from "./sidebar-footer";
import {SidebarTrackRow, buildMissingPinRow} from "./sidebar-track-row";

export class RpgAudioSidebarView extends ItemView {
	private plugin: RpgAudioPlugin;
	private manager: AudioManager;
	private header: SidebarHeader | null = null;
	private footer: SidebarFooter | null = null;
	private contentArea: HTMLElement | null = null;
	private trackRows: Map<string, SidebarTrackRow> = new Map();
	private groupFadeBtns: {btn: HTMLElement; ids: string[]}[] = [];
	private collapsedGroups: Set<string> = new Set();

	constructor(leaf: WorkspaceLeaf, plugin: RpgAudioPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.manager = plugin.audioManager;
	}

	getViewType(): string {
		return SIDEBAR_VIEW_TYPE;
	}

	getDisplayText(): string {
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		return "RPG Audio";
	}

	getIcon(): string {
		return "music";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("rpg-audio-sidebar");

		this.header = new SidebarHeader(container, this.plugin);
		this.contentArea = container.createDiv({cls: "rpg-audio-sidebar-content"});
		this.renderAll();
		this.footer = new SidebarFooter(container, this.plugin, () => this.renderAll());

		this.registerEvent(
			this.manager.on(EVENT_TRACKS_UPDATED, () => this.renderAll())
		);
		this.registerEvent(
			this.manager.on(EVENT_TRACK_CHANGED, (id: string) => {
				const state = this.manager.getTrack(id);
				if (state) this.trackRows.get(id)?.update(state);
				this.updateFadeButtons();
			})
		);
		this.registerEvent(
			this.manager.on(EVENT_MASTER_VOLUME, (vol: number) => this.header?.setMasterVolume(vol))
		);
		this.registerEvent(
			this.manager.on(EVENT_ALLOW_AUTOPLAY, () => this.header?.updateAutoplay())
		);
		this.registerEvent(
			this.manager.on(EVENT_ACTIVE_SCOPE_CHANGED, () => this.footer?.updateActiveScope())
		);
		this.registerEvent(
			this.plugin.stickyTracks.on(EVENT_STICKY_CHANGED, () => this.renderAll())
		);
	}

	async onClose(): Promise<void> {
		this.trackRows.clear();
		this.groupFadeBtns = [];
		this.contentArea = null;
		this.header = null;
		this.footer = null;
	}

	private renderAll(): void {
		if (!this.contentArea) return;
		this.contentArea.empty();
		this.trackRows.clear();
		this.groupFadeBtns = [];

		const sections = buildSidebarSections(this.manager, this.plugin.stickyTracks);

		if (sections.length === 0) {
			this.contentArea.createDiv({
				cls: "rpg-audio-empty-state",
				text: "No audio tracks defined. Add rpg-audio code blocks to your notes.",
			});
			return;
		}

		for (const section of sections) {
			const body = this.buildGroup(this.contentArea, {
				collapseKey: section.key,
				label: section.label,
				tracks: section.tracks,
				count: section.tracks.length + section.missingPins.length,
				addHeaderButtons: section.key === "pinned" ? (header) => this.buildUnpinAllButton(header) : undefined,
			});
			if (!body) continue;

			if (section.key === "library") {
				const sticky = this.plugin.stickyTracks;
				for (const group of groupByFolder(section.tracks, id => sticky.libraryFolderOf(id))) {
					const groupBody = this.buildGroup(body, {
						collapseKey: `library/${group.path}`,
						label: group.path || sticky.libraryFolderName,
						tracks: group.tracks,
						count: group.tracks.length,
						isSubgroup: true,
					});
					if (!groupBody) continue;
					for (const track of group.tracks) this.buildTrackRow(groupBody, track);
				}
			} else {
				for (const track of section.tracks) this.buildTrackRow(body, track);
				for (const pin of section.missingPins) buildMissingPinRow(body, pin, this.plugin);
			}
		}
	}

	private buildTrackRow(parent: HTMLElement, track: AudioTrackState): void {
		this.trackRows.set(track.def.id, new SidebarTrackRow(parent, track, this.plugin));
	}

	/** Returns the group body, or null when the group is collapsed. */
	private buildGroup(parent: HTMLElement, opts: {
		collapseKey: string;
		label: string;
		tracks: AudioTrackState[];
		count: number;
		isSubgroup?: boolean;
		addHeaderButtons?: (header: HTMLElement) => void;
	}): HTMLElement | null {
		const section = parent.createDiv({cls: opts.isSubgroup ? "rpg-audio-sidebar-subgroup" : "rpg-audio-sidebar-section"});
		const isCollapsed = this.collapsedGroups.has(opts.collapseKey);

		const header = section.createDiv({
			cls: "rpg-audio-sidebar-section-header" + (isCollapsed ? " is-collapsed" : ""),
		});

		const chevron = header.createSpan({cls: "rpg-audio-section-chevron"});
		setIcon(chevron, "chevron-down");
		header.createSpan({text: opts.label});
		header.createSpan({cls: "rpg-audio-section-count", text: String(opts.count)});

		opts.addHeaderButtons?.(header);

		const ids = opts.tracks.map(t => t.def.id);
		if (ids.length > 0) {
			const fadeToggleBtn = header.createEl("button", {cls: "rpg-audio-btn rpg-audio-section-fade-btn clickable-icon"});
			fadeToggleBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				const duration = sidebarFadeDuration(this.manager);
				if (anyInState(this.manager, ids, PlayState.Playing)) {
					this.manager.fadeOutTracks(ids, duration, `fade out ${opts.label}`);
				} else {
					this.manager.fadeInTracks(ids, duration, `fade in ${opts.label}`);
				}
			});
			this.groupFadeBtns.push({btn: fadeToggleBtn, ids});
			this.updateGroupFade(fadeToggleBtn, ids);
		}

		header.addEventListener("click", () => {
			if (this.collapsedGroups.has(opts.collapseKey)) {
				this.collapsedGroups.delete(opts.collapseKey);
			} else {
				this.collapsedGroups.add(opts.collapseKey);
			}
			this.renderAll();
		});

		if (isCollapsed) return null;
		return section.createDiv({cls: "rpg-audio-sidebar-section-body"});
	}

	private buildUnpinAllButton(header: HTMLElement): void {
		const btn = header.createEl("button", {cls: "rpg-audio-btn clickable-icon"});
		setIcon(btn, "pin-off");
		btn.setAttribute("aria-label", "Unpin all");
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.plugin.stickyTracks.unpinAll();
		});
	}

	private updateFadeButtons(): void {
		this.header?.updateFade();
		for (const {btn, ids} of this.groupFadeBtns) this.updateGroupFade(btn, ids);
	}

	private updateGroupFade(btn: HTMLElement, ids: string[]): void {
		updateFadeToggle(btn, anyInState(this.manager, ids, PlayState.Playing), anyInState(this.manager, ids, PlayState.Paused));
	}
}
