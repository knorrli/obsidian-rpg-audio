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
	AudioTrackState,
	TrackCause,
	MIN_FADE_DURATION_MS,
} from "../types";
import {createPlayerControls, updatePlayPauseButton, PlayerControlsElements} from "./player-controls";

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
	private typeFadeBtns: Map<string, HTMLElement> = new Map();
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
	}

	async onClose(): Promise<void> {
		this.trackRows.clear();
		this.contentArea = null;
		this.masterSlider = null;
		this.autoplayBtn = null;
		this.globalFadeBtn = null;
		this.typeFadeBtns.clear();
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
		this.typeFadeBtns.clear();

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

		groupOrder.sort((a, b) => a.localeCompare(b));

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

			const fadeDuration = () => Math.max(this.manager.crossfadeDuration, MIN_FADE_DURATION_MS);

			const fadeToggleBtn = sectionHeader.createEl("button", {cls: "rpg-audio-btn rpg-audio-section-fade-btn clickable-icon"});
			fadeToggleBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				if (this.hasPlayingTracksOfType(type)) {
					this.manager.fadeOutType(type, fadeDuration());
				} else {
					this.manager.fadeInType(type, fadeDuration());
				}
			});
			this.typeFadeBtns.set(type, fadeToggleBtn);
			this.updateFadeToggle(fadeToggleBtn, this.hasPlayingTracksOfType(type), this.hasPausedTracksOfType(type));

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

		const statusEl = row.createDiv({cls: "rpg-audio-status"});
		this.setStatusText(statusEl, track);

		const scopeEl = row.createDiv({cls: "rpg-audio-sidebar-track-scope"});
		const debugEl = row.createDiv({cls: "rpg-audio-sidebar-track-debug"});
		this.updateDebugEls(scopeEl, debugEl, track);

		this.trackRows.set(track.def.id, {rowEl: row, controls, statusEl, debugEl, scopeEl});
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

	private hasPlayingTracksOfType(type: string): boolean {
		return this.manager.getAllTracks().some(t => t.def.type === type && t.playState === PlayState.Playing);
	}

	private hasPausedTracksOfType(type: string): boolean {
		return this.manager.getAllTracks().some(t => t.def.type === type && t.playState === PlayState.Paused);
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
		for (const [type, btn] of this.typeFadeBtns) {
			this.updateFadeToggle(btn, this.hasPlayingTracksOfType(type), this.hasPausedTracksOfType(type));
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
