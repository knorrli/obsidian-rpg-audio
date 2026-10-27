import {describe, expect, it} from "vitest";
import {groupByFolder} from "../src/ui/sidebar-sections";
import {trackState} from "./track-state";

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
