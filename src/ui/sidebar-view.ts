import {ItemView, WorkspaceLeaf, setIcon} from "obsidian";
import {AudioManager} from "../audio-manager";
import {
	PlayState,
	SIDEBAR_VIEW_TYPE,
	EVENT_TRACK_CHANGED,
	EVENT_TRACKS_UPDATED,
	EVENT_MASTER_VOLUME,
	AudioTrackState,
} from "../types";
import {createPlayerControls, updatePlayPauseButton, PlayerControlsElements} from "./player-controls";

export class RpgAudioSidebarView extends ItemView {
	private manager: AudioManager;
	private trackRows: Map<string, {controls: PlayerControlsElements; statusEl: HTMLElement}> = new Map();
	private contentArea: HTMLElement | null = null;
	private masterSlider: HTMLInputElement | null = null;
	private collapsedGroups: Set<string> = new Set();

	constructor(leaf: WorkspaceLeaf, manager: AudioManager) {
		super(leaf);
		this.manager = manager;
	}

	getViewType(): string {
		return SIDEBAR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "RPG Audio";
	}

	getIcon(): string {
		return "music";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("rpg-audio-sidebar");

		this.buildHeader(container);
		this.contentArea = container.createDiv({cls: "rpg-audio-sidebar-content"});
		this.renderAll();

		this.registerEvent(
			this.manager.on(EVENT_TRACKS_UPDATED, () => this.renderAll())
		);
		this.registerEvent(
			this.manager.on(EVENT_TRACK_CHANGED, (id: string) => this.updateTrackRow(id))
		);
		this.registerEvent(
			this.manager.on(EVENT_MASTER_VOLUME, (vol: number) => {
				if (this.masterSlider) this.masterSlider.value = String(vol);
			})
		);
	}

	async onClose(): Promise<void> {
		this.trackRows.clear();
		this.contentArea = null;
		this.masterSlider = null;
	}

	private buildHeader(container: HTMLElement): void {
		const header = container.createDiv({cls: "rpg-audio-sidebar-header"});

		const titleRow = header.createDiv({cls: "rpg-audio-sidebar-title-row"});
		titleRow.createSpan({cls: "rpg-audio-sidebar-title", text: "RPG Audio"});

		const stopAllBtn = titleRow.createEl("button", {cls: "rpg-audio-btn rpg-audio-stop-all-btn"});
		setIcon(stopAllBtn, "square");
		stopAllBtn.setAttribute("aria-label", "Stop all");
		stopAllBtn.addEventListener("click", () => this.manager.stopAll());

		const volumeRow = header.createDiv({cls: "rpg-audio-sidebar-volume-row"});
		const volLabel = volumeRow.createSpan({cls: "rpg-audio-sidebar-vol-label"});
		setIcon(volLabel, "volume-2");

		this.masterSlider = volumeRow.createEl("input", {
			cls: "rpg-audio-volume rpg-audio-master-volume",
			type: "range",
		});
		this.masterSlider.min = "0";
		this.masterSlider.max = "1";
		this.masterSlider.step = "0.01";
		this.masterSlider.value = String(this.manager.masterVolume);
		this.masterSlider.addEventListener("input", () => {
			this.manager.masterVolume = parseFloat(this.masterSlider!.value);
		});
	}

	private renderAll(): void {
		if (!this.contentArea) return;
		this.contentArea.empty();
		this.trackRows.clear();

		const allTracks = this.manager.getAllTracks();

		if (allTracks.length === 0) {
			this.contentArea.createDiv({
				cls: "rpg-audio-empty-state",
				text: "No audio tracks defined. Add rpg-audio code blocks to your notes.",
			});
			return;
		}

		const groupOrder: string[] = [];
		const groupMap: Map<string, AudioTrackState[]> = new Map();
		for (const track of allTracks) {
			const key = track.def.type;
			let group = groupMap.get(key);
			if (!group) {
				group = [];
				groupMap.set(key, group);
				groupOrder.push(key);
			}
			group.push(track);
		}

		for (const type of groupOrder) {
			const tracks = groupMap.get(type);
			if (!tracks || tracks.length === 0) continue;

			const section = this.contentArea.createDiv({cls: "rpg-audio-sidebar-section"});
			const isCollapsed = this.collapsedGroups.has(type);

			const sectionHeader = section.createDiv({
				cls: "rpg-audio-sidebar-section-header" + (isCollapsed ? " is-collapsed" : ""),
			});

			const chevron = sectionHeader.createSpan({cls: "rpg-audio-section-chevron"});
			setIcon(chevron, "chevron-down");

			sectionHeader.createSpan({text: type});

			sectionHeader.createSpan({
				cls: "rpg-audio-section-count",
				text: String(tracks.length),
			});

			sectionHeader.addEventListener("click", () => {
				if (this.collapsedGroups.has(type)) {
					this.collapsedGroups.delete(type);
				} else {
					this.collapsedGroups.add(type);
				}
				this.renderAll();
			});

			if (!isCollapsed) {
				const sectionBody = section.createDiv({cls: "rpg-audio-sidebar-section-body"});
				for (const track of tracks) {
					this.buildTrackRow(sectionBody, track);
				}
			}
		}
	}

	private buildTrackRow(parent: HTMLElement, track: AudioTrackState): void {
		const row = parent.createDiv({cls: "rpg-audio-sidebar-track"});
		const topRow = row.createDiv({cls: "rpg-audio-sidebar-track-top"});
		topRow.createDiv({cls: "rpg-audio-sidebar-track-name", text: track.def.name});

		const controls = createPlayerControls(topRow, {
			onPlay: () => this.manager.play(track.def.id),
			onPause: () => this.manager.pause(track.def.id),
			onStop: () => this.manager.stop(track.def.id),
			onVolumeChange: (v) => this.manager.setTrackVolume(track.def.id, v),
		}, track.volume);

		updatePlayPauseButton(controls.playPauseBtn, track.playState);

		const statusEl = row.createDiv({cls: "rpg-audio-status"});
		this.setStatusText(statusEl, track);

		this.trackRows.set(track.def.id, {controls, statusEl});
	}

	private updateTrackRow(id: string): void {
		const row = this.trackRows.get(id);
		const state = this.manager.getTrack(id);
		if (!row || !state) return;

		updatePlayPauseButton(row.controls.playPauseBtn, state.playState);
		row.controls.volumeSlider.value = String(state.volume);
		this.setStatusText(row.statusEl, state);
	}

	private setStatusText(el: HTMLElement, state: AudioTrackState): void {
		let text = "";
		if (state.playState === PlayState.Playing) {
			text = "Playing";
			if (state.def.files.length > 1) {
				text += ` (${state.currentIndex + 1}/${state.def.files.length})`;
			}
		} else if (state.playState === PlayState.Paused) {
			text = "Paused";
		}
		el.setText(text);
	}
}
