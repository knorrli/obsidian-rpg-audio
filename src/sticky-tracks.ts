import {Events, TAbstractFile, TFile, debounce, normalizePath} from "obsidian";
import type RpgAudioPlugin from "./main";
import {AudioManager} from "./audio-manager";
import {parseAudioBlock} from "./ui/code-block-player";
import {AudioTrackDef, EVENT_STICKY_CHANGED, PinnedTrackRef} from "./types";

const REFRESH_DEBOUNCE_MS = 300;
const FENCE_OPEN = /^(`{3,}|~{3,})\s*rpg-audio\s*$/;
const BLOCKQUOTE_PREFIX = /^\s*(>\s?)+/;

function parseAudioBlocksInMarkdown(content: string): AudioTrackDef[] {
	const defs: AudioTrackDef[] = [];
	let fence: string | null = null;
	let body: string[] = [];
	for (const rawLine of content.split("\n")) {
		const line = rawLine.replace(BLOCKQUOTE_PREFIX, "");
		const trimmed = line.trim();
		if (fence === null) {
			const match = FENCE_OPEN.exec(trimmed);
			if (match?.[1]) {
				fence = match[1];
				body = [];
			}
		} else if (trimmed.startsWith(fence) && trimmed.replace(/[`~]/g, "") === "") {
			const def = parseAudioBlock(body.join("\n"));
			if (def) defs.push(def);
			fence = null;
		} else {
			body.push(line);
		}
	}
	return defs;
}

/**
 * Keeps tracks registered after their note closes: every block in the library
 * folder, plus tracks the user pinned. Pins are stored as note path + track id
 * and re-read from the note, so edits to the block carry over.
 */
export class StickyTracks extends Events {
	private plugin: RpgAudioPlugin;
	private manager: AudioManager;
	private libraryIds: string[] = [];
	private refreshGeneration = 0;
	private _loaded = false;

	readonly requestRefresh = debounce(() => void this.refresh(), REFRESH_DEBOUNCE_MS, true);

	constructor(plugin: RpgAudioPlugin, manager: AudioManager) {
		super();
		this.plugin = plugin;
		this.manager = manager;
	}

	watchVault(): void {
		const {vault} = this.plugin.app;
		const onChange = (file: TAbstractFile) => {
			if (this.isRelevant(file.path)) this.requestRefresh();
		};
		this.plugin.registerEvent(vault.on("modify", onChange));
		this.plugin.registerEvent(vault.on("create", onChange));
		this.plugin.registerEvent(vault.on("delete", onChange));
		this.plugin.registerEvent(vault.on("rename", (file, oldPath) => {
			const pinsMoved = this.movePins(oldPath, file.path);
			if (pinsMoved || this.isLibraryNote(oldPath) || this.isLibraryNote(file.path)) this.requestRefresh();
		}));
	}

	/** Ordered by note path, then by position in the note. */
	get libraryTrackIds(): string[] {
		return this.libraryIds;
	}

	/** False until the first refresh, while no pin has been looked up yet. */
	get loaded(): boolean {
		return this._loaded;
	}

	get pins(): PinnedTrackRef[] {
		return this.plugin.settings.pinnedTracks;
	}

	private isLibraryNote(path: string): boolean {
		const folder = this.libraryFolder();
		return folder !== null && path.startsWith(`${folder}/`) && path.endsWith(".md");
	}

	isLibraryTrack(id: string): boolean {
		return this.libraryIds.includes(id);
	}

	isPinned(id: string): boolean {
		return this.pins.some(p => p.id === id);
	}

	async togglePin(id: string): Promise<void> {
		if (this.isPinned(id)) {
			await this.unpin(id);
			return;
		}
		const track = this.manager.getTrack(id);
		if (!track) return;
		await this.savePins([...this.pins, {id, path: track.sourcePath}]);
	}

	async unpin(id: string): Promise<void> {
		await this.savePins(this.pins.filter(p => p.id !== id));
	}

	async unpinAll(): Promise<void> {
		await this.savePins([]);
	}

	async refresh(): Promise<void> {
		const generation = ++this.refreshGeneration;

		const libraryFiles = this.plugin.app.vault.getMarkdownFiles()
			.filter(f => this.isLibraryNote(f.path))
			.sort((a, b) => a.path.localeCompare(b.path));
		const libraryEntries: {def: AudioTrackDef; sourcePath: string}[] = [];
		for (const file of libraryFiles) {
			for (const def of await this.readBlocks(file)) {
				libraryEntries.push({def, sourcePath: file.path});
			}
		}

		const libraryIds = new Set(libraryEntries.map(e => e.def.id));
		const pinEntries: {def: AudioTrackDef; sourcePath: string}[] = [];
		for (const path of new Set(this.pins.map(p => p.path))) {
			const file = this.plugin.app.vault.getFileByPath(path);
			if (!file) continue;
			const wanted = new Set(this.pins.filter(p => p.path === path).map(p => p.id));
			for (const def of await this.readBlocks(file)) {
				if (wanted.has(def.id) && !libraryIds.has(def.id)) pinEntries.push({def, sourcePath: path});
			}
		}

		if (generation !== this.refreshGeneration) return;

		this.libraryIds = Array.from(libraryIds);
		this._loaded = true;
		this.manager.registerAll([...libraryEntries, ...pinEntries]);
		this.applyRetention();
	}

	private async readBlocks(file: TFile): Promise<AudioTrackDef[]> {
		return parseAudioBlocksInMarkdown(await this.plugin.app.vault.cachedRead(file));
	}

	private libraryFolder(): string | null {
		const raw = this.plugin.settings.libraryFolder.trim();
		return raw ? normalizePath(raw) : null;
	}

	private isRelevant(path: string): boolean {
		return this.isLibraryNote(path) || this.pins.some(p => p.path === path);
	}

	/** Handles both a renamed note and a renamed folder containing pinned notes. */
	private movePins(oldPath: string, newPath: string): boolean {
		const moved = (path: string): string | null => {
			if (path === oldPath) return newPath;
			if (path.startsWith(`${oldPath}/`)) return newPath + path.slice(oldPath.length);
			return null;
		};
		if (!this.pins.some(p => moved(p.path) !== null)) return false;
		void this.savePins(this.pins.map(p => ({...p, path: moved(p.path) ?? p.path})));
		return true;
	}

	private async savePins(pins: PinnedTrackRef[]): Promise<void> {
		this.plugin.settings.pinnedTracks = pins;
		this.applyRetention();
		await this.plugin.saveSettings();
	}

	private applyRetention(): void {
		this.manager.setRetained(new Set([...this.libraryIds, ...this.pins.map(p => p.id)]));
		this.trigger(EVENT_STICKY_CHANGED);
	}
}
