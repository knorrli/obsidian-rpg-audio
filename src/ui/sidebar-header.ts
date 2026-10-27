import {setIcon} from "obsidian";
import type RpgAudioPlugin from "../main";
import {PlayState} from "../types";
import {updateFadeToggle} from "./player-controls";
import {anyInState, sidebarFadeDuration} from "./sidebar-sections";

/** Title row with the autoplay, global fade and stop-all buttons, plus the master volume slider. */
export class SidebarHeader {
	private plugin: RpgAudioPlugin;
	private autoplayBtn: HTMLElement;
	private fadeBtn: HTMLElement;
	private masterSlider: HTMLInputElement;

	constructor(container: HTMLElement, plugin: RpgAudioPlugin) {
		this.plugin = plugin;
		const manager = plugin.audioManager;
		const header = container.createDiv({cls: "rpg-audio-sidebar-header"});

		const titleRow = header.createDiv({cls: "rpg-audio-sidebar-title-row"});
		titleRow.createSpan({cls: "rpg-audio-sidebar-title", text: "RPG Audio"});

		const globalControls = titleRow.createDiv({cls: "rpg-audio-global-controls"});

		this.autoplayBtn = globalControls.createEl("button", {cls: "rpg-audio-btn clickable-icon"});
		this.autoplayBtn.addEventListener("click", () => void this.toggleAutoplay());
		this.updateAutoplay();

		this.fadeBtn = globalControls.createEl("button", {cls: "rpg-audio-btn clickable-icon"});
		this.fadeBtn.addEventListener("click", () => {
			if (this.anyTrackInState(PlayState.Playing)) {
				manager.fadeOutAll(sidebarFadeDuration(manager));
			} else {
				manager.fadeInAll(sidebarFadeDuration(manager));
			}
		});
		this.updateFade();

		const stopAllBtn = globalControls.createEl("button", {cls: "rpg-audio-btn rpg-audio-stop-all-btn clickable-icon"});
		setIcon(stopAllBtn, "square");
		stopAllBtn.setAttribute("aria-label", "Stop all");
		stopAllBtn.addEventListener("click", () => manager.stopAll());

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
		this.masterSlider.value = String(manager.masterVolume);
		this.masterSlider.addEventListener("input", () => {
			manager.masterVolume = parseFloat(this.masterSlider.value);
		});
	}

	setMasterVolume(volume: number): void {
		this.masterSlider.value = String(volume);
	}

	updateFade(): void {
		updateFadeToggle(this.fadeBtn, this.anyTrackInState(PlayState.Playing), this.anyTrackInState(PlayState.Paused));
	}

	updateAutoplay(): void {
		const on = this.plugin.audioManager.allowAutoplay;
		setIcon(this.autoplayBtn, on ? "zap" : "zap-off");
		this.autoplayBtn.setAttribute("aria-label", on ? "Autoplay enabled (click to disable)" : "Autoplay disabled (click to enable)");
		this.autoplayBtn.toggleClass("is-active", on);
	}

	private anyTrackInState(playState: PlayState): boolean {
		const manager = this.plugin.audioManager;
		return anyInState(manager, manager.getAllTracks().map(t => t.def.id), playState);
	}

	private async toggleAutoplay(): Promise<void> {
		this.plugin.settings.allowAutoplay = !this.plugin.settings.allowAutoplay;
		this.plugin.audioManager.allowAutoplay = this.plugin.settings.allowAutoplay;
		await this.plugin.saveSettings();
	}
}
