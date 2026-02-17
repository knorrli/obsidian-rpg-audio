import {setIcon} from "obsidian";
import {PlayState} from "../types";

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

	const playPauseBtn = container.createEl("button", {cls: "rpg-audio-btn rpg-audio-play-btn"});
	setIcon(playPauseBtn, "play");

	const stopBtn = container.createEl("button", {cls: "rpg-audio-btn rpg-audio-stop-btn"});
	setIcon(stopBtn, "square");

	const volumeSlider = container.createEl("input", {
		cls: "rpg-audio-volume",
		type: "range",
	});
	volumeSlider.min = "0";
	volumeSlider.max = "1";
	volumeSlider.step = "0.01";
	volumeSlider.value = String(initialVolume);

	playPauseBtn.addEventListener("click", () => {
		const isPlaying = playPauseBtn.dataset["state"] === PlayState.Playing;
		if (isPlaying) {
			callbacks.onPause();
		} else {
			callbacks.onPlay();
		}
	});

	stopBtn.addEventListener("click", () => callbacks.onStop());
	volumeSlider.addEventListener("input", () => callbacks.onVolumeChange(parseFloat(volumeSlider.value)));

	return {container, playPauseBtn, stopBtn, volumeSlider};
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
