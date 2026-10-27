import {describe, expect, it} from "vitest";
import {isAtOrUnder, movedPath} from "../src/vault-paths";

describe("isAtOrUnder", () => {
	it("matches the path itself and anything below it", () => {
		expect(isAtOrUnder("Library", "Library")).toBe(true);
		expect(isAtOrUnder("Library/Weather.md", "Library")).toBe(true);
	});

	it("does not match a sibling sharing a prefix", () => {
		expect(isAtOrUnder("Library2/Weather.md", "Library")).toBe(false);
	});
});

describe("movedPath", () => {
	it("follows a renamed note", () => {
		expect(movedPath("Scenes/Inn.md", "Scenes/Inn.md", "Scenes/Tavern.md")).toBe("Scenes/Tavern.md");
	});

	it("follows a renamed parent folder", () => {
		expect(movedPath("Scenes/Town/Inn.md", "Scenes/Town", "Places/City")).toBe("Places/City/Inn.md");
	});

	it("returns null for unaffected paths", () => {
		expect(movedPath("Scenes/Townhall.md", "Scenes/Town", "Places/City")).toBeNull();
	});
});
