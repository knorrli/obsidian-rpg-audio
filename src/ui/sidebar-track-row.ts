import type RpgAudioPlugin from "../main";
import {AudioTrackState, PinnedTrackRef, TrackCause} from "../types";
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

function formatCause(cause: TrackCause): string {
	const kindLabel = cause.kind === "user" ? "" : ` (${cause.kind})`;
	const detail = cause.detail ? ` — ${cause.detail}` : "";
	return `${cause.action}${kindLabel}${detail}`;
}

export class SidebarTrackRow {
	private plugin: RpgAudioPlugin;
	private rowEl: HTMLElement;
	private controls: PlayerControlsElements;
	private statusEl: HTMLElement;
	private scopeEl: HTMLElement;
	private debugEl: HTMLElement;

	constructor(parent: HTMLElement, track: AudioTrackState, plugin: RpgAudioPlugin) {
		this.plugin = plugin;
		const manager = plugin.audioManager;
		const sticky = plugin.stickyTracks;
		const id = track.def.id;

		this.rowEl = parent.createDiv({cls: "rpg-audio-sidebar-track"});
		const topRow = this.rowEl.createDiv({cls: "rpg-audio-sidebar-track-top"});
		topRow.createDiv({cls: "rpg-audio-sidebar-track-name", text: track.def.name});

		this.controls = createPlayerControls(topRow, {
			onPlay: () => void manager.play(id),
			onPause: () => manager.pause(id),
			onStop: () => manager.stop(id),
			onVolumeChange: (v) => manager.setTrackVolume(id, v),
		}, track.volume);

		if (sticky.showsPinButton(id)) {
			const pinBtn = createPinButton(topRow, () => void sticky.togglePin(id));
			updatePinButton(pinBtn, sticky.isPinned(id));
		}

		this.statusEl = this.rowEl.createDiv({cls: "rpg-audio-status"});
		this.scopeEl = this.rowEl.createDiv({cls: "rpg-audio-sidebar-track-scope"});
		this.debugEl = this.rowEl.createDiv({cls: "rpg-audio-sidebar-track-debug"});
		this.update(track);
	}

	update(state: AudioTrackState): void {
		applyPlayStateClass(this.rowEl, state.playState);
		updatePlayPauseButton(this.controls.playPauseBtn, state.playState);
		setSliderVolume(this.controls.volumeSlider, state.volume);
		setStatusText(this.statusEl, state);
		this.updateDebugEls(state);
	}

	private updateDebugEls(track: AudioTrackState): void {
		const on = this.plugin.settings.showDebugInfo;
		this.scopeEl.empty();
		this.debugEl.empty();
		this.scopeEl.toggleClass("is-hidden", !on);
		this.debugEl.toggleClass("is-hidden", !on);
		if (!on) return;

		if (track.def.scope.length > 0) {
			this.scopeEl.createSpan({cls: "rpg-audio-debug-label", text: "scope: "});
			this.scopeEl.createSpan({text: track.def.scope.join(", ")});
		} else {
			this.scopeEl.createSpan({cls: "rpg-audio-debug-muted", text: "no scope"});
		}

		if (track.lastCause) {
			this.debugEl.setText(formatCause(track.lastCause));
		} else {
			this.debugEl.createSpan({cls: "rpg-audio-debug-muted", text: "no events yet"});
		}
	}
}

export function buildMissingPinRow(parent: HTMLElement, pin: PinnedTrackRef, plugin: RpgAudioPlugin): void {
	const row = parent.createDiv({cls: "rpg-audio-sidebar-track is-stopped"});
	const topRow = row.createDiv({cls: "rpg-audio-sidebar-track-top"});
	topRow.createDiv({cls: "rpg-audio-sidebar-track-name", text: pin.id});
	const pinBtn = createPinButton(topRow, () => void plugin.stickyTracks.unpin(pin.id));
	pinBtn.addClass("rpg-audio-push-right");
	updatePinButton(pinBtn, true);
	row.createDiv({cls: "rpg-audio-status rpg-audio-error-text", text: `Not found in ${pin.path}`});
}
