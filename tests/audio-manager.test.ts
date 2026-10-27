import {describe, expect, it, vi} from "vitest";
import type {App} from "obsidian";
import {AudioManager} from "../src/audio/audio-manager";
import {EVENT_SOURCE_RENAMED, EVENT_TRACKS_UPDATED} from "../src/types";
import {trackDef} from "./track-state";

function createManager(): AudioManager {
	const volumes = {get: () => 1, set: () => undefined};
	return new AudioManager({} as App, volumes);
}

describe("AudioManager.claim", () => {
	it("registers an unused id", () => {
		const manager = createManager();
		expect(manager.claim(trackDef({id: "rain"}), "Scenes/Inn.md")).toBe(true);
		expect(manager.getTrack("rain")?.sourcePath).toBe("Scenes/Inn.md");
	});

	it("accepts the same note again and takes its edited definition", () => {
		const manager = createManager();
		manager.claim(trackDef({id: "rain"}), "Scenes/Inn.md");
		expect(manager.claim(trackDef({id: "rain", name: "Heavy rain"}), "Scenes/Inn.md")).toBe(true);
		expect(manager.getTrack("rain")?.def.name).toBe("Heavy rain");
	});

	it("refuses an id held by another note", () => {
		const manager = createManager();
		manager.claim(trackDef({id: "rain", name: "Inn rain"}), "Scenes/Inn.md");
		expect(manager.claim(trackDef({id: "rain", name: "Forest rain"}), "Scenes/Forest.md")).toBe(false);
		expect(manager.getTrack("rain")?.def.name).toBe("Inn rain");
	});

	it("refuses an id held by a library block", () => {
		const manager = createManager();
		manager.registerAll([{def: trackDef({id: "rain"}), sourcePath: "Library/Weather.md"}]);
		expect(manager.claim(trackDef({id: "rain"}), "Scenes/Inn.md")).toBe(false);
	});

	it("lets a library block take over an id held by a note", () => {
		const manager = createManager();
		manager.claim(trackDef({id: "rain"}), "Scenes/Inn.md");
		manager.registerAll([{def: trackDef({id: "rain"}), sourcePath: "Library/Weather.md"}]);
		expect(manager.getTrack("rain")?.sourcePath).toBe("Library/Weather.md");
	});
});

describe("AudioManager.attachPlayer", () => {
	it("announces a track's first player, so the sidebar can move it into view", () => {
		const manager = createManager();
		manager.claim(trackDef({id: "rain"}), "Scenes/Inn.md");
		const listener = vi.fn();
		manager.on(EVENT_TRACKS_UPDATED, listener);

		manager.attachPlayer("rain");
		manager.attachPlayer("rain");

		expect(manager.hasPlayers("rain")).toBe(true);
		expect(listener).toHaveBeenCalledTimes(1);
	});
});

describe("AudioManager.renameSource", () => {
	it("moves tracks with their note or folder and announces the rename", () => {
		const manager = createManager();
		manager.claim(trackDef({id: "rain"}), "Scenes/Town/Inn.md");
		manager.claim(trackDef({id: "wind"}), "Scenes/Townhall.md");
		const listener = vi.fn();
		manager.on(EVENT_SOURCE_RENAMED, listener);

		manager.renameSource("Scenes/Town", "Places/City");

		expect(manager.getTrack("rain")?.sourcePath).toBe("Places/City/Inn.md");
		expect(manager.getTrack("wind")?.sourcePath).toBe("Scenes/Townhall.md");
		expect(listener).toHaveBeenCalledWith("Scenes/Town", "Places/City");
	});

	it("keeps the moved note's own block as the holder", () => {
		const manager = createManager();
		manager.claim(trackDef({id: "rain"}), "Scenes/Inn.md");
		manager.renameSource("Scenes/Inn.md", "Scenes/Tavern.md");
		expect(manager.claim(trackDef({id: "rain"}), "Scenes/Tavern.md")).toBe(true);
	});
});
