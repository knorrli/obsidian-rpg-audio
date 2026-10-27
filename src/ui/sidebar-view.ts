import {ItemView, WorkspaceLeaf, setIcon} from "obsidian";
import {AudioManager} from "../audio-manager";
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
	PinnedTrackRef,
	TrackCause,
	MIN_FADE_DURATION_MS,
} from "../types";
import {createPinButton, createPlayerControls, updatePinButton, updatePlayPauseButton, PlayerControlsElements} from "./player-controls";
import {buildSidebarSections, groupByType} from "./sidebar-sections";

function formatCause(cause: TrackCause): string {
	const kindLabel = cause.kind === "user" ? "" : ` (${cause.kind})`;
	const detail = cause.detail ? ` — ${cause.detail}` : "";
	return `${cause.action}${kindLabel}${detail}`;
}

export class RpgAudioSidebarView extends ItemView {
	private plugin: RpgAudioPlugin;
	private manager: AudioManager;
	private trackRows: Map<string, {rowEl: HTMLElement; controls: PlayerControlsElements; statusEl: HTMLElement; debugEl: HTMLElement; scopeEl: HTMLElement}> = new Map();
	private contentArea: HTMLElement | null = null;
	private masterSlider: HTMLInputElement | null = null;
	private autoplayBtn: HTMLElement | null = null;
	private collapsedGroups: Set<string> = new Set();
	private globalFadeBtn: HTMLElement | null = null;
	private groupFadeBtns: {btn: HTMLElement; ids: string[]}[] = [];
	private debugToggleBtn: HTMLElement | null = null;
	private activeScopeEl: HTMLElement | null = null;

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

		this.buildHeader(container);
		this.contentArea = container.createDiv({cls: "rpg-audio-sidebar-content"});
		this.renderAll();
		this.buildFooter(container);

		this.registerEvent(
			this.manager.on(EVENT_TRACKS_UPDATED, () => this.renderAll())
		);
		this.registerEvent(
			this.manager.on(EVENT_TRACK_CHANGED, (id: string) => {
				this.updateTrackRow(id);
				this.updateFadeButtons();
			})
		);
		this.registerEvent(
			this.manager.on(EVENT_MASTER_VOLUME, (vol: number) => {
				if (this.masterSlider) this.masterSlider.value = String(vol);
			})
		);
		this.registerEvent(
			this.manager.on(EVENT_ALLOW_AUTOPLAY, () => this.updateAutoplayBtn())
		);
		this.registerEvent(
			this.manager.on(EVENT_ACTIVE_SCOPE_CHANGED, () => this.updateActiveScope())
		);
		this.registerEvent(
			this.plugin.stickyTracks.on(EVENT_STICKY_CHANGED, () => this.renderAll())
		);
	}

	async onClose(): Promise<void> {
		this.trackRows.clear();
		this.contentArea = null;
		this.masterSlider = null;
		this.autoplayBtn = null;
		this.globalFadeBtn = null;
		this.groupFadeBtns = [];
		this.debugToggleBtn = null;
		this.activeScopeEl = null;
	}

	private buildHeader(container: HTMLElement): void {
		const header = container.createDiv({cls: "rpg-audio-sidebar-header"});

		const titleRow = header.createDiv({cls: "rpg-audio-sidebar-title-row"});
		titleRow.createSpan({cls: "rpg-audio-sidebar-title", text: "RPG Audio"});

		const fadeDuration = () => Math.max(this.manager.crossfadeDuration, MIN_FADE_DURATION_MS);

		const globalControls = titleRow.createDiv({cls: "rpg-audio-global-controls"});

		this.autoplayBtn = globalControls.createEl("button", {cls: "rpg-audio-btn clickable-icon"});
		this.autoplayBtn.addEventListener("click", () => void this.toggleAutoplay());
		this.updateAutoplayBtn();

		this.globalFadeBtn = globalControls.createEl("button", {cls: "rpg-audio-btn clickable-icon"});
		this.globalFadeBtn.addEventListener("click", () => {
			if (this.hasPlayingTracks()) {
				this.manager.fadeOutAll(fadeDuration());
			} else {
				this.manager.fadeInAll(fadeDuration());
			}
		});
		this.updateFadeToggle(this.globalFadeBtn, this.hasPlayingTracks(), this.hasPausedTracks());

		const stopAllBtn = globalControls.createEl("button", {cls: "rpg-audio-btn rpg-audio-stop-all-btn clickable-icon"});
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

	private buildFooter(container: HTMLElement): void {
		const footer = container.createDiv({cls: "rpg-audio-sidebar-footer"});

		this.activeScopeEl = footer.createDiv({cls: "rpg-audio-sidebar-active-scope"});
		this.updateActiveScope();

		const controls = footer.createDiv({cls: "rpg-audio-sidebar-footer-controls"});
		controls.createSpan({
			cls: "rpg-audio-sidebar-version",
			text: `v${this.plugin.manifest.version}`,
		});

		this.debugToggleBtn = controls.createEl("button", {cls: "rpg-audio-btn clickable-icon"});
		this.debugToggleBtn.addEventListener("click", () => void this.toggleDebug());
		this.updateDebugBtn();

		const settingsBtn = controls.createEl("button", {cls: "rpg-audio-btn clickable-icon"});
		setIcon(settingsBtn, "settings");
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		settingsBtn.setAttribute("aria-label", "Open RPG Audio settings");
		settingsBtn.addEventListener("click", () => this.openSettings());
	}

	private updateDebugBtn(): void {
		if (!this.debugToggleBtn) return;
		const on = this.plugin.settings.showDebugInfo;
		setIcon(this.debugToggleBtn, on ? "bug" : "bug-off");
		this.debugToggleBtn.setAttribute("aria-label", on ? "Debug info on (click to disable)" : "Debug info off (click to enable)");
		this.debugToggleBtn.toggleClass("is-active", on);
	}

	private async toggleDebug(): Promise<void> {
		this.plugin.settings.showDebugInfo = !this.plugin.settings.showDebugInfo;
		await this.plugin.saveSettings();
		this.updateDebugBtn();
		this.updateActiveScope();
		this.renderAll();
	}

	private updateActiveScope(): void {
		if (!this.activeScopeEl) return;
		const on = this.plugin.settings.showDebugInfo;
		this.activeScopeEl.empty();
		if (!on) {
			this.activeScopeEl.addClass("is-hidden");
			return;
		}
		this.activeScopeEl.removeClass("is-hidden");
		const scope = this.manager.activeScope;
		const label = scope.length === 0 ? "(none)" : `{${scope.join(", ")}}`;
		this.activeScopeEl.createSpan({cls: "rpg-audio-debug-label", text: "Active scope: "});
		this.activeScopeEl.createSpan({text: label});
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
				for (const group of groupByType(section.tracks)) {
					const groupBody = this.buildGroup(body, {
						collapseKey: `library/${group.type}`,
						label: group.type,
						tracks: group.tracks,
						count: group.tracks.length,
						isSubgroup: true,
					});
					if (!groupBody) continue;
					for (const track of group.tracks) this.buildTrackRow(groupBody, track);
				}
			} else {
				for (const track of section.tracks) this.buildTrackRow(body, track);
				for (const pin of section.missingPins) this.buildMissingPinRow(body, pin);
			}
		}
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
			const fadeDuration = () => Math.max(this.manager.crossfadeDuration, MIN_FADE_DURATION_MS);
			const fadeToggleBtn = header.createEl("button", {cls: "rpg-audio-btn rpg-audio-section-fade-btn clickable-icon"});
			fadeToggleBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				if (this.anyInState(ids, PlayState.Playing)) {
					this.manager.fadeOutTracks(ids, fadeDuration(), `fade out ${opts.label}`);
				} else {
					this.manager.fadeInTracks(ids, fadeDuration(), `fade in ${opts.label}`);
				}
			});
			this.groupFadeBtns.push({btn: fadeToggleBtn, ids});
			this.updateFadeToggle(fadeToggleBtn, this.anyInState(ids, PlayState.Playing), this.anyInState(ids, PlayState.Paused));
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

	private buildTrackRow(parent: HTMLElement, track: AudioTrackState): void {
		const sticky = this.plugin.stickyTracks;
		const row = parent.createDiv({cls: "rpg-audio-sidebar-track"});
		this.applyPlayStateClass(row, track.playState);
		const topRow = row.createDiv({cls: "rpg-audio-sidebar-track-top"});
		topRow.createDiv({cls: "rpg-audio-sidebar-track-name", text: track.def.name});

		const controls = createPlayerControls(topRow, {
			onPlay: () => void this.manager.play(track.def.id),
			onPause: () => this.manager.pause(track.def.id),
			onStop: () => this.manager.stop(track.def.id),
			onVolumeChange: (v) => this.manager.setTrackVolume(track.def.id, v),
		}, track.volume);

		updatePlayPauseButton(controls.playPauseBtn, track.playState);

		if (sticky.showsPinButton(track.def.id)) {
			const pinBtn = createPinButton(topRow, () => void sticky.togglePin(track.def.id));
			updatePinButton(pinBtn, sticky.isPinned(track.def.id));
		}

		const statusEl = row.createDiv({cls: "rpg-audio-status"});
		this.setStatusText(statusEl, track);

		const scopeEl = row.createDiv({cls: "rpg-audio-sidebar-track-scope"});
		const debugEl = row.createDiv({cls: "rpg-audio-sidebar-track-debug"});
		this.updateDebugEls(scopeEl, debugEl, track);

		this.trackRows.set(track.def.id, {rowEl: row, controls, statusEl, debugEl, scopeEl});
	}

	private buildMissingPinRow(parent: HTMLElement, pin: PinnedTrackRef): void {
		const row = parent.createDiv({cls: "rpg-audio-sidebar-track is-stopped"});
		const topRow = row.createDiv({cls: "rpg-audio-sidebar-track-top"});
		topRow.createDiv({cls: "rpg-audio-sidebar-track-name", text: pin.id});
		const pinBtn = createPinButton(topRow, () => void this.plugin.stickyTracks.unpin(pin.id));
		pinBtn.addClass("rpg-audio-push-right");
		updatePinButton(pinBtn, true);
		row.createDiv({cls: "rpg-audio-status rpg-audio-error-text", text: `Not found in ${pin.path}`});
	}

	private updateTrackRow(id: string): void {
		const row = this.trackRows.get(id);
		const state = this.manager.getTrack(id);
		if (!row || !state) return;

		this.applyPlayStateClass(row.rowEl, state.playState);
		updatePlayPauseButton(row.controls.playPauseBtn, state.playState);
		row.controls.volumeSlider.value = String(state.volume);
		this.setStatusText(row.statusEl, state);
		this.updateDebugEls(row.scopeEl, row.debugEl, state);
	}

	private updateDebugEls(scopeEl: HTMLElement, debugEl: HTMLElement, track: AudioTrackState): void {
		const on = this.plugin.settings.showDebugInfo;
		scopeEl.empty();
		debugEl.empty();
		if (!on) {
			scopeEl.addClass("is-hidden");
			debugEl.addClass("is-hidden");
			return;
		}
		scopeEl.removeClass("is-hidden");
		debugEl.removeClass("is-hidden");

		if (track.def.scope.length > 0) {
			scopeEl.createSpan({cls: "rpg-audio-debug-label", text: "scope: "});
			scopeEl.createSpan({text: track.def.scope.join(", ")});
		} else {
			scopeEl.createSpan({cls: "rpg-audio-debug-muted", text: "no scope"});
		}

		if (track.lastCause) {
			debugEl.setText(formatCause(track.lastCause));
		} else {
			debugEl.createSpan({cls: "rpg-audio-debug-muted", text: "no events yet"});
		}
	}

	private hasPlayingTracks(): boolean {
		return this.manager.getAllTracks().some(t => t.playState === PlayState.Playing);
	}

	private hasPausedTracks(): boolean {
		return this.manager.getAllTracks().some(t => t.playState === PlayState.Paused);
	}

	private anyInState(ids: string[], playState: PlayState): boolean {
		return ids.some(id => this.manager.getTrack(id)?.playState === playState);
	}

	private updateFadeToggle(btn: HTMLElement, hasPlaying: boolean, hasPaused: boolean): void {
		if (hasPlaying) {
			setIcon(btn, "volume-x");
			btn.setAttribute("aria-label", "Fade out");
			btn.removeClass("rpg-audio-btn-disabled");
		} else if (hasPaused) {
			setIcon(btn, "volume-2");
			btn.setAttribute("aria-label", "Fade in");
			btn.removeClass("rpg-audio-btn-disabled");
		} else {
			setIcon(btn, "volume-x");
			btn.setAttribute("aria-label", "Fade out");
			btn.addClass("rpg-audio-btn-disabled");
		}
	}

	private updateAutoplayBtn(): void {
		if (!this.autoplayBtn) return;
		const on = this.manager.allowAutoplay;
		setIcon(this.autoplayBtn, on ? "zap" : "zap-off");
		this.autoplayBtn.setAttribute("aria-label", on ? "Autoplay enabled (click to disable)" : "Autoplay disabled (click to enable)");
		this.autoplayBtn.toggleClass("is-active", on);
	}

	private async toggleAutoplay(): Promise<void> {
		this.plugin.settings.allowAutoplay = !this.plugin.settings.allowAutoplay;
		this.manager.allowAutoplay = this.plugin.settings.allowAutoplay;
		await this.plugin.saveSettings();
	}

	private openSettings(): void {
		const setting = (this.plugin.app as unknown as { setting: { open: () => void; openTabById: (id: string) => void } }).setting;
		setting.open();
		setting.openTabById(this.plugin.manifest.id);
	}

	private updateFadeButtons(): void {
		if (this.globalFadeBtn) {
			this.updateFadeToggle(this.globalFadeBtn, this.hasPlayingTracks(), this.hasPausedTracks());
		}
		for (const {btn, ids} of this.groupFadeBtns) {
			this.updateFadeToggle(btn, this.anyInState(ids, PlayState.Playing), this.anyInState(ids, PlayState.Paused));
		}
	}

	private applyPlayStateClass(el: HTMLElement, playState: PlayState): void {
		el.toggleClass("is-playing", playState === PlayState.Playing);
		el.toggleClass("is-paused", playState === PlayState.Paused);
		el.toggleClass("is-stopped", playState === PlayState.Stopped);
	}

	private setStatusText(el: HTMLElement, state: AudioTrackState): void {
		let text = "";
		if (state.error) {
			text = state.error;
			el.addClass("rpg-audio-error-text");
		} else {
			el.removeClass("rpg-audio-error-text");
			if (state.playState === PlayState.Playing && state.def.files.length > 1) {
				text = `${state.currentIndex + 1}/${state.def.files.length}`;
			}
		}
		el.setText(text);
	}
}
