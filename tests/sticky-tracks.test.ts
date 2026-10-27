import {describe, expect, it, vi} from "vitest";
import type {App} from "obsidian";
import {AudioManager} from "../src/audio/audio-manager";
import {StickyTracks} from "../src/sticky-tracks";
import type RpgAudioPlugin from "../src/main";
import {EVENT_STICKY_CHANGED, PinnedTrackRef} from "../src/types";

type FakeFile = {path: string; content: string};
type VaultHandler = (file: {path: string}, oldPath?: string) => void;

function block(id: string): string {
	return `\`\`\`rpg-audio\nid: ${id}\nname: ${id}\nfile: ${id}.mp3\n\`\`\``;
}

function setup(files: FakeFile[], libraryFolder = "Library") {
	const handlers = new Map<string, VaultHandler>();
	const vault = {
		getMarkdownFiles: () => files.filter(f => f.path.endsWith(".md")),
		cachedRead: (file: FakeFile) => Promise.resolve(file.content),
		getFileByPath: (path: string) => files.find(f => f.path === path) ?? null,
		on: (name: string, handler: VaultHandler) => {
			handlers.set(name, handler);
			return {};
		},
	};
	const settings = {libraryFolder, pinnedTracks: [] as PinnedTrackRef[]};
	const plugin = {
		app: {vault},
		settings,
		registerEvent: () => undefined,
		saveSettings: () => Promise.resolve(),
	} as unknown as RpgAudioPlugin;
	const manager = new AudioManager({} as App, {get: () => 1, set: () => undefined});
	const sticky = new StickyTracks(plugin, manager);
	return {sticky, handlers, files};
}

describe("StickyTracks library folders", () => {
	it("records each library track's folder relative to the library folder", async () => {
		const {sticky} = setup([
			{path: "Library/Weather.md", content: block("rain")},
			{path: "Library/Erkundung/Dul/Cave.md", content: block("drip")},
			{path: "Scenes/Inn.md", content: block("inn")},
		]);
		await sticky.refresh();

		expect(sticky.libraryTrackIds).toEqual(["drip", "rain"]);
		expect(sticky.libraryFolderOf("rain")).toBe("");
		expect(sticky.libraryFolderOf("drip")).toBe("Erkundung/Dul");
		expect(sticky.isLibraryTrack("inn")).toBe(false);
		expect(sticky.libraryFolderName).toBe("Library");
	});

	it("announces a change when a note moves to another folder without changing ids or order", async () => {
		const {sticky, files} = setup([{path: "Library/Erkundung/Cave.md", content: block("drip")}]);
		await sticky.refresh();
		const changed = vi.fn();
		sticky.on(EVENT_STICKY_CHANGED, changed);

		files[0] = {path: "Library/Erkundung/Dul/Cave.md", content: block("drip")};
		await sticky.refresh();

		expect(sticky.libraryFolderOf("drip")).toBe("Erkundung/Dul");
		expect(changed).toHaveBeenCalledTimes(1);
	});

	it("stays quiet when a refresh changes nothing", async () => {
		const {sticky} = setup([{path: "Library/Weather.md", content: block("rain")}]);
		await sticky.refresh();
		const changed = vi.fn();
		sticky.on(EVENT_STICKY_CHANGED, changed);

		await sticky.refresh();

		expect(changed).not.toHaveBeenCalled();
	});
});

describe("StickyTracks rename handling", () => {
	it.each([
		["a subfolder inside the library", "Library/Erkundung/Dul", "Library/Erkundung/Höhlen"],
		["a note moved into the library", "Scenes/Cave.md", "Library/Cave.md"],
		["a note moved out of the library", "Library/Cave.md", "Scenes/Cave.md"],
		["a folder containing the library", "Audio", "Sound"],
	])("refreshes for %s", (_label, oldPath, newPath) => {
		const {sticky, handlers} = setup([], oldPath === "Audio" ? "Audio/Library" : "Library");
		sticky.watchVault();
		const refresh = vi.spyOn(sticky, "refresh").mockResolvedValue();

		handlers.get("rename")?.({path: newPath}, oldPath);

		expect(refresh).toHaveBeenCalled();
	});

	it("ignores renames elsewhere in the vault", () => {
		const {sticky, handlers} = setup([]);
		sticky.watchVault();
		const refresh = vi.spyOn(sticky, "refresh").mockResolvedValue();

		handlers.get("rename")?.({path: "Scenes/Tavern.md"}, "Scenes/Inn.md");

		expect(refresh).not.toHaveBeenCalled();
	});
});
