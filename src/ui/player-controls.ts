import {setIcon} from "obsidian";
import {AudioTrackState, MAX_TRACK_VOLUME, PlayState} from "../types";

export interface PlayerControlsCallbacks {
	onPlay: () => void;
	onPause: () => void;
	onStop: () => void;
	onVolumeChange: (volume: number) => void;
}

export interface PlayerControlsElements {
	container: HTMLElement;
	playPauseBtn: HTMLButtonElement;
	stopBtn: HTMLButtonElement;
	volumeSlider: HTMLInputElement;
}

export function createPlayerControls(
	parent: HTMLElement,
	callbacks: PlayerControlsCallbacks,
	initialVolume = 1.0,
): PlayerControlsElements {
	const container = parent.createDiv({cls: "rpg-audio-controls"});

	const playPauseBtn = container.createEl("button", {cls: "rpg-audio-btn rpg-audio-play-btn clickable-icon"});
	setIcon(playPauseBtn, "play");

	const stopBtn = container.createEl("button", {cls: "rpg-audio-btn rpg-audio-stop-btn clickable-icon"});
	setIcon(stopBtn, "square");

	const volumeSlider = container.createEl("input", {
		cls: "rpg-audio-volume",
		type: "range",
	});
	volumeSlider.min = "0";
	volumeSlider.max = String(MAX_TRACK_VOLUME);
	volumeSlider.step = "0.01";
	setSliderVolume(volumeSlider, initialVolume);

	playPauseBtn.addEventListener("click", () => {
		const isPlaying = playPauseBtn.dataset["state"] === PlayState.Playing;
		if (isPlaying) {
			callbacks.onPause();
		} else {
			callbacks.onPlay();
		}
	});

	stopBtn.addEventListener("click", () => callbacks.onStop());
	volumeSlider.addEventListener("input", () => {
		setSliderVolume(volumeSlider, parseFloat(volumeSlider.value));
		callbacks.onVolumeChange(parseFloat(volumeSlider.value));
	});
	volumeSlider.addEventListener("dblclick", () => {
		setSliderVolume(volumeSlider, 1);
		callbacks.onVolumeChange(1);
	});

	return {container, playPauseBtn, stopBtn, volumeSlider};
}

export function setSliderVolume(slider: HTMLInputElement, volume: number): void {
	slider.value = String(volume);
	slider.setAttribute("aria-label", `Volume ${Math.round(volume * 100)}% (double-click to reset)`);
}

export function createPinButton(parent: HTMLElement, onToggle: () => void): HTMLButtonElement {
	const btn = parent.createEl("button", {cls: "rpg-audio-btn rpg-audio-pin-btn clickable-icon"});
	setIcon(btn, "pin");
	btn.addEventListener("click", (e) => {
		e.stopPropagation();
		onToggle();
	});
	updatePinButton(btn, false);
	return btn;
}

export function updatePinButton(btn: HTMLButtonElement, pinned: boolean): void {
	btn.setAttribute("aria-label", pinned ? "Unpin" : "Pin to sidebar");
	btn.toggleClass("is-active", pinned);
}

export function updatePlayPauseButton(btn: HTMLButtonElement, state: PlayState): void {
	btn.dataset["state"] = state;
	if (state === PlayState.Playing) {
		setIcon(btn, "pause");
		btn.setAttribute("aria-label", "Pause");
	} else {
		setIcon(btn, "play");
		btn.setAttribute("aria-label", "Play");
	}
}

export function applyPlayStateClass(el: HTMLElement, playState: PlayState): void {
	el.toggleClass("is-playing", playState === PlayState.Playing);
	el.toggleClass("is-paused", playState === PlayState.Paused);
	el.toggleClass("is-stopped", playState === PlayState.Stopped);
}

/** Shows the error if there is one, otherwise the playlist position while playing. */
export function setStatusText(el: HTMLElement, state: AudioTrackState): void {
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

/** Fade out while anything plays, fade in while something is paused, disabled otherwise. */
export function updateFadeToggle(btn: HTMLElement, hasPlaying: boolean, hasPaused: boolean): void {
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
