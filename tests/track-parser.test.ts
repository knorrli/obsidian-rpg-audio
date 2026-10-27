import {describe, expect, it} from "vitest";
import {parseAudioBlock, parseAudioBlocksInMarkdown} from "../src/track-parser";

describe("parseAudioBlock", () => {
	it("parses a single-file block with defaults", () => {
		expect(parseAudioBlock("id: rain\nname: Rain\nfile: rain.mp3")).toEqual({
			id: "rain",
			name: "Rain",
			type: "sfx",
			files: ["rain.mp3"],
			loop: false,
			random: false,
			autoplay: "off",
			stops: [],
			resumes: [],
			pauses: [],
			scope: [],
		});
	});

	it("defaults the type to playlist when there are several files", () => {
		const def = parseAudioBlock("id: tavern\nname: Tavern\nfiles:\n  - a.mp3\n  - b.mp3\nloop: true");
		expect(def?.type).toBe("playlist");
		expect(def?.files).toEqual(["a.mp3", "b.mp3"]);
		expect(def?.loop).toBe(true);
	});

	it("keeps an explicit type", () => {
		expect(parseAudioBlock("id: a\nname: A\ntype: ambience\nfile: a.mp3")?.type).toBe("ambience");
	});

	it.each([
		["id: a\nfile: a.mp3", "name"],
		["name: A\nfile: a.mp3", "id"],
		["id: a\nname: A", "files"],
	])("returns null without %s", (source) => {
		expect(parseAudioBlock(source)).toBeNull();
	});

	it.each([
		["true", "always"],
		["hover", "hover"],
		["HOVER", "hover"],
		["false", "off"],
		["sometimes", "off"],
	])("maps autoplay: %s to %s", (value, mode) => {
		expect(parseAudioBlock(`id: a\nname: A\nfile: a.mp3\nautoplay: ${value}`)?.autoplay).toBe(mode);
	});

	it("splits directive lists and accepts starts as an alias for resumes", () => {
		const def = parseAudioBlock("id: a\nname: A\nfile: a.mp3\nstops: music, !boss ,\nstarts: ambience\npauses: sfx");
		expect(def?.stops).toEqual(["music", "!boss"]);
		expect(def?.resumes).toEqual(["ambience"]);
		expect(def?.pauses).toEqual(["sfx"]);
	});

	it("deduplicates scope labels", () => {
		expect(parseAudioBlock("id: a\nname: A\nfile: a.mp3\nscope: town, inn, town")?.scope).toEqual(["town", "inn"]);
	});

	it("keeps colons in values after the first", () => {
		expect(parseAudioBlock("id: a\nname: Act 1: Arrival\nfile: a.mp3")?.name).toBe("Act 1: Arrival");
	});
});

describe("parseAudioBlocksInMarkdown", () => {
	const block = (id: string, fence = "```") => `${fence}rpg-audio\nid: ${id}\nname: ${id}\nfile: ${id}.mp3\n${fence}`;

	it("returns blocks in document order", () => {
		const content = `# Scene\n\n${block("a")}\n\nText\n\n${block("b", "~~~")}`;
		expect(parseAudioBlocksInMarkdown(content).map(d => d.id)).toEqual(["a", "b"]);
	});

	it("ignores an rpg-audio example nested in a longer fence", () => {
		const content = `\`\`\`\`markdown\n${block("example")}\n\`\`\`\`\n${block("real")}`;
		expect(parseAudioBlocksInMarkdown(content).map(d => d.id)).toEqual(["real"]);
	});

	it("ignores other code blocks", () => {
		expect(parseAudioBlocksInMarkdown("```js\nid: a\nname: A\nfile: a.mp3\n```")).toEqual([]);
	});

	it("reads blocks inside callouts", () => {
		const content = `> [!note] Music\n${block("quoted").split("\n").map(l => `> ${l}`).join("\n")}`;
		expect(parseAudioBlocksInMarkdown(content).map(d => d.id)).toEqual(["quoted"]);
	});

	it("drops invalid blocks and an unclosed trailing block", () => {
		const content = "```rpg-audio\nid: broken\n```\n```rpg-audio\nid: open\nname: Open\nfile: o.mp3";
		expect(parseAudioBlocksInMarkdown(content)).toEqual([]);
	});
});
