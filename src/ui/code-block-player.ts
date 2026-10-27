import {MarkdownRenderChild, setIcon} from "obsidian";
import {AudioManager} from "../audio/audio-manager";
import type {StickyTracks} from "../sticky-tracks";
import {AudioTrackDef, EVENT_TRACK_CHANGED, EVENT_STICKY_CHANGED, DETACH_POLL_INTERVAL_MS} from "../types";
import {
	applyPlayStateClass,
	createPinButton,
	createPlayerControls,
	setSliderVolume,
	setStatusText,
	updatePinButton,
	updatePlayPauseButton,
	PlayerControlsElements,
} from "./player-controls";

export class RpgAudioCodeBlockPlayer extends MarkdownRenderChild {
	private manager: AudioManager;
	private sticky: StickyTracks;
	private def: AudioTrackDef;
	private sourcePath: string;
	private controls: PlayerControlsElements | null = null;
	private pinBtn: HTMLButtonElement | null = null;
	private statusEl: HTMLElement | null = null;
	private eventRef: (() => void) | null = null;
	private autoplayTimer: number | null = null;

	constructor(containerEl: HTMLElement, manager: AudioManager, sticky: StickyTracks, def: AudioTrackDef, sourcePath: string) {
		super(containerEl);
		this.manager = manager;
		this.sticky = sticky;
		this.def = def;
		this.sourcePath = sourcePath;
	}

	onload(): void {
		const wasRegistered = !!this.manager.getTrack(this.def.id);
		this.manager.attachPlayer(this.def.id);
		this.manager.register(this.def, this.sourcePath);
		this.buildUI();
		this.registerEvent(this.sticky.on(EVENT_STICKY_CHANGED, () => this.syncPinButton()));

		const handler = (changedId: string) => {
			if (changedId === this.def.id) this.syncState();
		};
		this.manager.on(EVENT_TRACK_CHANGED, handler);
		this.eventRef = () => this.manager.off(EVENT_TRACK_CHANGED, handler);

		this.syncState();

		if (this.def.autoplay !== "off" && !wasRegistered && this.manager.allowAutoplay) {
			const delay = this.manager.autoplayDelay;
			// The block is not reliably attached to its popover yet when it renders,
			// so hover mode always waits a tick before deciding where it is.
			if (delay > 0 || this.def.autoplay === "hover") {
				this.autoplayTimer = window.setTimeout(() => {
					this.autoplayTimer = null;
					this.startAutoplay();
				}, delay);
			} else {
				this.startAutoplay();
			}
		}

		// Obsidian does not call onunload for MarkdownRenderChild inside
		// ![[...]] transclusions. Poll for DOM detachment as a fallback.
		this.registerInterval(window.setInterval(() => {
			if (!this.containerEl.isConnected) this.unload();
		}, DETACH_POLL_INTERVAL_MS));
	}

	private startAutoplay(): void {
		if (this.def.autoplay === "hover" && !this.isInHoverPopover()) return;
		void this.manager.play(this.def.id, false, {kind: "autoplay"});
	}

	private isInHoverPopover(): boolean {
		return this.containerEl.isConnected && !!this.containerEl.closest(".hover-popover");
	}

	onunload(): void {
		if (this.autoplayTimer !== null) {
			window.clearTimeout(this.autoplayTimer);
			this.autoplayTimer = null;
		}
		if (this.eventRef) {
			this.eventRef();
			this.eventRef = null;
		}
		this.manager.detachPlayer(this.def.id);
	}

	private buildUI(): void {
		const el = this.containerEl;
		el.empty();
		el.addClass("rpg-audio-player");
		el.dataset.trackId = this.def.id;

		const header = el.createDiv({cls: "rpg-audio-header"});
		const iconEl = header.createSpan({cls: "rpg-audio-icon"});
		setIcon(iconEl, this.getTypeIcon());
		header.createSpan({cls: "rpg-audio-name", text: this.def.name});
		header.createSpan({cls: "rpg-audio-badge", text: this.def.type});
		this.pinBtn = createPinButton(header, () => {
			this.ensureActive();
			void this.sticky.togglePin(this.def.id);
		});
		this.syncPinButton();

		this.statusEl = el.createSpan({cls: "rpg-audio-status-inline"});

		const currentState = this.manager.getTrack(this.def.id);
		const initialVolume = currentState ? currentState.volume : 1.0;

		this.controls = createPlayerControls(el, {
			onPlay: () => { this.ensureActive(); void this.manager.play(this.def.id); },
			onPause: () => { this.ensureActive(); this.manager.pause(this.def.id); },
			onStop: () => { this.ensureActive(); this.manager.stop(this.def.id); },
			onVolumeChange: (v) => { this.ensureActive(); this.manager.setTrackVolume(this.def.id, v); },
		}, initialVolume);
	}

	/** Re-register track and event listener if orphaned (e.g. in embedded notes). */
	private ensureActive(): void {
		if (!this.manager.getTrack(this.def.id)) {
			this.manager.register(this.def, this.sourcePath);
		}
		if (!this.eventRef) {
			const handler = (changedId: string) => {
				if (changedId === this.def.id) this.syncState();
			};
			this.manager.on(EVENT_TRACK_CHANGED, handler);
			this.eventRef = () => this.manager.off(EVENT_TRACK_CHANGED, handler);
		}
	}

	private syncState(): void {
		const state = this.manager.getTrack(this.def.id);
		if (!state || !this.controls || !this.statusEl) return;

		updatePlayPauseButton(this.controls.playPauseBtn, state.playState);
		setSliderVolume(this.controls.volumeSlider, state.volume);

		applyPlayStateClass(this.containerEl, state.playState);
		setStatusText(this.statusEl, state);
	}

	private syncPinButton(): void {
		if (!this.pinBtn) return;
		this.pinBtn.toggleClass("is-hidden", !this.sticky.showsPinButton(this.def.id));
		updatePinButton(this.pinBtn, this.sticky.isPinned(this.def.id));
	}

	private getTypeIcon(): string {
		if (this.def.files.length > 1) return "list-music";
		if (this.def.loop) return "repeat";
		return "music";
	}
}
