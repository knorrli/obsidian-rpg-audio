import {describe, expect, it} from "vitest";
import type {AudioManager} from "../src/audio/audio-manager";
import type {StickyTracks} from "../src/sticky-tracks";
import {buildSidebarSections, groupByFolder} from "../src/ui/sidebar-sections";
import {trackMap, trackState} from "./track-state";

describe("groupByFolder", () => {
	const folders: Record<string, string> = {
		fight: "",
		rain: "",
		cave: "Erkundung/Dul",
		wind: "Erkundung",
		drip: "Erkundung/Dul",
	};
	const tracks = ["fight", "cave", "rain", "wind", "drip"].map(id => trackState({id}));

	it("groups by folder sorted by path, root first, keeping track order", () => {
		const groups = groupByFolder(tracks, id => folders[id] ?? "");
		expect(groups.map(g => [g.path, g.tracks.map(t => t.def.id)])).toEqual([
			["", ["fight", "rain"]],
			["Erkundung", ["wind"]],
			["Erkundung/Dul", ["cave", "drip"]],
		]);
	});

	it("returns no groups without tracks", () => {
		expect(groupByFolder([], () => "")).toEqual([]);
	});
});

describe("buildSidebarSections", () => {
	function build(libraryIds: string[], pinnedIds: string[]) {
		const tracks = trackMap(...[...libraryIds, ...pinnedIds].map(id => trackState({id})));
		const manager = {
			getTrack: (id: string) => tracks.get(id),
			getAllTracks: () => Array.from(tracks.values()),
			hasPlayers: () => false,
		} as unknown as AudioManager;
		const sticky = {
			libraryTrackIds: libraryIds,
			pins: pinnedIds.map(id => ({id, path: "Note.md"})),
			loaded: true,
		} as unknown as StickyTracks;
		return buildSidebarSections(manager, sticky).map(s => [s.key, s.tracks.map(t => t.def.id)]);
	}

	it("lists pinned tracks above the library and moves a pinned library track out of it", () => {
		expect(build(["rain", "cave", "wind"], ["inn", "cave"])).toEqual([
			["pinned", ["inn", "cave"]],
			["library", ["rain", "wind"]],
		]);
	});
});
