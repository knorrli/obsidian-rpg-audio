import {Events, TAbstractFile, TFile, debounce, normalizePath} from "obsidian";
import type RpgAudioPlugin from "./main";
import {AudioManager} from "./audio/audio-manager";
import {parseAudioBlocksInMarkdown} from "./track-parser";
import {AudioTrackDef, EVENT_STICKY_CHANGED, PinnedTrackRef} from "./types";
import {isAtOrUnder, movedPath} from "./vault-paths";

const REFRESH_DEBOUNCE_MS = 300;

type TrackEntry = {def: AudioTrackDef; sourcePath: string};

/**
 * Keeps tracks registered after their note closes: every block in the library
 * folder, plus tracks the user pinned. Pins are stored as note path + track id
 * and re-read from the note, so edits to the block carry over.
 */
export class StickyTracks extends Events {
	private plugin: RpgAudioPlugin;
	private manager: AudioManager;
	private libraryIds: string[] = [];
	private libraryIdSet: Set<string> = new Set();
	/** Pins whose block was not found in their note on the last refresh. */
	private unresolvedPins: Set<string> = new Set();
	private refreshGeneration = 0;
	private lastSignature = "";
	private destroyed = false;
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
			if (pinsMoved || this.touchesLibrary(oldPath) || this.touchesLibrary(file.path)) this.requestRefresh();
		}));
	}

	destroy(): void {
		this.destroyed = true;
		this.requestRefresh.cancel();
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

	isLibraryTrack(id: string): boolean {
		return this.libraryIdSet.has(id);
	}

	isPinned(id: string): boolean {
		return this.pins.some(p => p.id === id);
	}

	/** Library tracks need no pin, but a pin made before the track joined the library must stay removable. */
	showsPinButton(id: string): boolean {
		return !this.isLibraryTrack(id) || this.isPinned(id);
	}

	async togglePin(id: string): Promise<void> {
		if (this.isPinned(id)) {
			await this.unpin(id);
			return;
		}
		const track = this.manager.getTrack(id);
		if (!track) return;
		this.unresolvedPins.delete(id);
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
		const {vault} = this.plugin.app;

		const libraryFiles = vault.getMarkdownFiles()
			.filter(f => this.isLibraryNote(f.path))
			.sort((a, b) => a.path.localeCompare(b.path));
		const pinPaths = Array.from(new Set(this.pins.map(p => p.path)));
		const pinFiles = pinPaths.map(path => vault.getFileByPath(path));

		const [libraryBlocks, pinBlocks] = await Promise.all([
			Promise.all(libraryFiles.map(f => this.readBlocks(f))),
			Promise.all(pinFiles.map(f => f ? this.readBlocks(f) : Promise.resolve([]))),
		]);

		if (this.destroyed || generation !== this.refreshGeneration) return;

		const libraryEntries: TrackEntry[] = [];
		const libraryIds = new Set<string>();
		libraryFiles.forEach((file, i) => {
			for (const def of libraryBlocks[i] ?? []) {
				if (libraryIds.has(def.id)) continue;
				libraryIds.add(def.id);
				libraryEntries.push({def, sourcePath: file.path});
			}
		});

		const pinEntries: TrackEntry[] = [];
		const resolved = new Set<string>();
		pinPaths.forEach((path, i) => {
			const wanted = new Set(this.pins.filter(p => p.path === path).map(p => p.id));
			for (const def of pinBlocks[i] ?? []) {
				if (!wanted.has(def.id) || libraryIds.has(def.id) || resolved.has(def.id)) continue;
				resolved.add(def.id);
				pinEntries.push({def, sourcePath: path});
			}
		});

		this.libraryIds = Array.from(libraryIds);
		this.libraryIdSet = libraryIds;
		this.unresolvedPins = new Set(this.pins.map(p => p.id).filter(id => !libraryIds.has(id) && !resolved.has(id)));
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

	private isLibraryNote(path: string): boolean {
		const folder = this.libraryFolder();
		return folder !== null && path.startsWith(`${folder}/`) && path.endsWith(".md");
	}

	/** True for anything inside the library folder, the folder itself, or a folder containing it. */
	private touchesLibrary(path: string): boolean {
		const folder = this.libraryFolder();
		return folder !== null && (isAtOrUnder(path, folder) || isAtOrUnder(folder, path));
	}

	private isRelevant(path: string): boolean {
		return this.touchesLibrary(path) || this.pins.some(p => isAtOrUnder(p.path, path));
	}

	/** Handles both a renamed note and a renamed folder containing pinned notes. */
	private movePins(oldPath: string, newPath: string): boolean {
		const moved = (path: string) => movedPath(path, oldPath, newPath);
		if (!this.pins.some(p => moved(p.path) !== null)) return false;
		void this.savePins(this.pins.map(p => ({...p, path: moved(p.path) ?? p.path})));
		return true;
	}

	private async savePins(pins: PinnedTrackRef[]): Promise<void> {
		this.plugin.settings.pinnedTracks = pins;
		this.applyRetention();
		await this.plugin.saveSettings();
	}

	/**
	 * Unresolved pins are not retained, so their track is cleaned up once stopped
	 * and the sidebar shows the pin as missing. A pin added since the last
	 * refresh is not in the unresolved set yet and is retained.
	 */
	private applyRetention(): void {
		const pinIds = this.pins.map(p => p.id).filter(id => !this.unresolvedPins.has(id));
		this.manager.setRetained(new Set([...this.libraryIds, ...pinIds]));

		const signature = JSON.stringify([this.libraryIds, this.pins, Array.from(this.unresolvedPins)]);
		if (signature === this.lastSignature) return;
		this.lastSignature = signature;
		this.trigger(EVENT_STICKY_CHANGED);
	}
}
