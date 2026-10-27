import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, RpgAudioSettings, RpgAudioSettingTab } from "./settings";
import { AudioManager } from "./audio/audio-manager";
import { SIDEBAR_VIEW_TYPE } from "./types";
import { RpgAudioCodeBlockPlayer } from "./ui/code-block-player";
import { parseAudioBlock } from "./track-parser";
import { RpgAudioSidebarView } from "./ui/sidebar-view";
import { InsertTrackModal } from "./ui/insert-track-modal";
import { StickyTracks } from "./sticky-tracks";
import { TrackVolumes } from "./track-volumes";

export default class RpgAudioPlugin extends Plugin {
	settings: RpgAudioSettings;
	audioManager: AudioManager;
	stickyTracks: StickyTracks;
	trackVolumes: TrackVolumes;

	async onload() {
		await this.loadSettings();

		this.trackVolumes = new TrackVolumes(this);
		this.audioManager = new AudioManager(this.app, this.trackVolumes);
		this.audioManager.masterVolume = this.settings.masterVolume;
		this.audioManager.audioFolder = this.settings.audioFolder;
		this.audioManager.crossfadeDuration = this.settings.crossfadeDuration;
		this.audioManager.playFadeDuration = this.settings.playFadeDuration;
		this.audioManager.allowAutoplay = this.settings.allowAutoplay;
		this.audioManager.autoplayDelay = this.settings.autoplayDelay;

		this.stickyTracks = new StickyTracks(this, this.audioManager);

		this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new RpgAudioSidebarView(leaf, this));

		this.registerMarkdownCodeBlockProcessor("rpg-audio", (source, el, ctx) => {
			const def = parseAudioBlock(source);
			if (!def) {
				el.createDiv({ cls: "rpg-audio-error", text: "Invalid rpg-audio block. Requires: id, name, type, and file/files." });
				return;
			}
			const player = new RpgAudioCodeBlockPlayer(el, this.app, this.audioManager, this.stickyTracks, def, ctx.sourcePath);
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

		this.addCommand({
			id: "unpin-all",
			name: "Unpin all tracks",
			callback: () => this.stickyTracks.unpinAll(),
		});

		this.addCommand({
			id: "insert-track",
			name: "Insert audio track",
			editorCallback: (editor) => {
				new InsertTrackModal(this.app, this.settings.audioFolder, (codeBlock) => {
					editor.replaceRange(codeBlock + "\n", editor.getCursor());
				}).open();
			},
		});

		this.addSettingTab(new RpgAudioSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.audioManager.renameSource(oldPath, file.path)));
			this.stickyTracks.watchVault();
			void this.stickyTracks.refresh();
			if (this.settings.autoOpenSidebar) void this.activateSidebar();
		});
	}

	onunload() {
		this.trackVolumes.flush();
		this.stickyTracks.destroy();
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
