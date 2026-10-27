import {describe, expect, it} from "vitest";
import {directiveTargets, sameScope, scopeTransitionTargets} from "../src/audio/transitions";
import {PlayState} from "../src/types";
import {trackMap, trackState} from "./track-state";

const playing = {playState: PlayState.Playing};

describe("directiveTargets", () => {
	const tracks = trackMap(
		trackState({id: "trigger", type: "music"}, playing),
		trackState({id: "battle", type: "music"}, playing),
		trackState({id: "tavern", type: "music"}, playing),
		trackState({id: "rain", type: "ambience"}, playing),
		trackState({id: "paused-music", type: "music"}, {playState: PlayState.Paused}),
	);

	it("matches by type and by id, never the trigger itself", () => {
		expect(directiveTargets(tracks, "trigger", ["music"], PlayState.Playing)).toEqual(["battle", "tavern"]);
		expect(directiveTargets(tracks, "trigger", ["rain"], PlayState.Playing)).toEqual(["rain"]);
	});

	it("only returns tracks in the requested play state", () => {
		expect(directiveTargets(tracks, "trigger", ["music"], PlayState.Paused)).toEqual(["paused-music"]);
	});

	it("excludes negated ids and types", () => {
		expect(directiveTargets(tracks, "trigger", ["music", "!tavern"], PlayState.Playing)).toEqual(["battle"]);
		expect(directiveTargets(tracks, "trigger", ["rain", "battle", "!music"], PlayState.Playing)).toEqual(["rain"]);
	});

	it("matches nothing with only negations or no tokens", () => {
		expect(directiveTargets(tracks, "trigger", ["!music"], PlayState.Playing)).toEqual([]);
		expect(directiveTargets(tracks, "trigger", [], PlayState.Playing)).toEqual([]);
	});
});

describe("scopeTransitionTargets", () => {
	const tracks = trackMap(
		trackState({id: "trigger", scope: ["inn"]}, playing),
		trackState({id: "town-ambience", scope: ["town"]}, playing),
		trackState({id: "inn-music", scope: ["inn"]}, playing),
		trackState({id: "dungeon", scope: ["dungeon"]}, playing),
		trackState({id: "stopped-dungeon", scope: ["dungeon"]}),
		trackState({id: "unscoped"}, playing),
	);

	it("returns playing scoped tracks outside the active scope", () => {
		expect(scopeTransitionTargets(tracks, "trigger", new Set(["town", "inn"]))).toEqual(["dungeon"]);
	});

	it("requires every scope label of a track to be active", () => {
		const multi = trackMap(trackState({id: "both", scope: ["town", "night"]}, playing));
		expect(scopeTransitionTargets(multi, "trigger", new Set(["town"]))).toEqual(["both"]);
		expect(scopeTransitionTargets(multi, "trigger", new Set(["town", "night"]))).toEqual([]);
	});
});

describe("sameScope", () => {
	it("compares as sets", () => {
		expect(sameScope(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
		expect(sameScope(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
	});
});
