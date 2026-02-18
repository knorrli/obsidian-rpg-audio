import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, RpgAudioSettings, RpgAudioSettingTab } from "./settings";
import { AudioManager } from "./audio-manager";
import { SIDEBAR_VIEW_TYPE } from "./types";
import { parseAudioBlock, RpgAudioCodeBlockPlayer } from "./ui/code-block-player";
import { RpgAudioSidebarView } from "./ui/sidebar-view";

export default class RpgAudioPlugin extends Plugin {
	settings: RpgAudioSettings;
	audioManager: AudioManager;

	async onload() {
		await this.loadSettings();

		this.audioManager = new AudioManager(this.app);
		this.audioManager.masterVolume = this.settings.masterVolume;
		this.audioManager.audioFolder = this.settings.audioFolder;
		this.audioManager.crossfadeDuration = this.settings.crossfadeDuration;

		this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new RpgAudioSidebarView(leaf, this.audioManager));

		this.registerMarkdownCodeBlockProcessor("rpg-audio", (source, el, ctx) => {
			const def = parseAudioBlock(source);
			if (!def) {
				el.createDiv({ cls: "rpg-audio-error", text: "Invalid rpg-audio block. Requires: id, name, type, and file/files." });
				return;
			}
			const player = new RpgAudioCodeBlockPlayer(el, this.audioManager, def);
			ctx.addChild(player);
		});

		// eslint-disable-next-line obsidianmd/ui/sentence-case
		this.addRibbonIcon("music", "RPG Audio", () => {
			void this.toggleSidebar();
		});

		this.addCommand({
			id: "toggle-sidebar",
			name: "Toggle audio sidebar",
			callback: () => this.toggleSidebar(),
		});

		this.addCommand({
			id: "stop-all",
			name: "Stop all audio",
			callback: () => this.audioManager.stopAll(),
		});

		this.addSettingTab(new RpgAudioSettingTab(this.app, this));

		if (this.settings.autoOpenSidebar) {
			this.app.workspace.onLayoutReady(() => this.activateSidebar());
		}
	}

	onunload() {
		this.audioManager.destroyAll();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<RpgAudioSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async toggleSidebar(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
		if (existing.length > 0) {
			const first = existing[0];
			if (first) first.detach();
		} else {
			await this.activateSidebar();
		}
	}

	private async activateSidebar(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
		const first = existing[0];
		if (first) {
			await this.app.workspace.revealLeaf(first);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
			await this.app.workspace.revealLeaf(leaf);
		}
	}
}
