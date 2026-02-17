import {App, PluginSettingTab, Setting} from "obsidian";
import type RpgAudioPlugin from "./main";

export interface RpgAudioSettings {
	audioFolder: string;
	masterVolume: number;
	autoOpenSidebar: boolean;
}

export const DEFAULT_SETTINGS: RpgAudioSettings = {
	audioFolder: "audio",
	masterVolume: 1.0,
	autoOpenSidebar: true,
};

export class RpgAudioSettingTab extends PluginSettingTab {
	plugin: RpgAudioPlugin;

	constructor(app: App, plugin: RpgAudioPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Audio folder")
			.setDesc("Vault-relative folder where audio files are stored")
			.addText(text => text
				.setPlaceholder("Audio")
				.setValue(this.plugin.settings.audioFolder)
				.onChange(async (value) => {
					this.plugin.settings.audioFolder = value;
					this.plugin.audioManager.audioFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Master volume")
			.setDesc("Global volume multiplier for all tracks")
			.addSlider(slider => slider
				.setLimits(0, 1, 0.01)
				.setValue(this.plugin.settings.masterVolume)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.masterVolume = value;
					this.plugin.audioManager.masterVolume = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Auto-open sidebar")
			.setDesc("Automatically open the audio sidebar when the plugin loads")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoOpenSidebar)
				.onChange(async (value) => {
					this.plugin.settings.autoOpenSidebar = value;
					await this.plugin.saveSettings();
				}));
	}
}
