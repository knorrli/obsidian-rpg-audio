import {AudioTrackDef, AutoplayMode} from "./types";

function parseAutoplayMode(value: string): AutoplayMode {
	switch (value.toLowerCase()) {
		case "true": return "always";
		case "hover": return "hover";
		default: return "off";
	}
}

export function parseAudioBlock(source: string): AudioTrackDef | null {
	const lines = source.split("\n").map(l => l.trim()).filter(l => l.length > 0);

	let id = "";
	let name = "";
	let type = "";
	let loop = false;
	let random = false;
	let autoplay: AutoplayMode = "off";
	let stops: string[] = [];
	let resumes: string[] = [];
	let pauses: string[] = [];
	let scope: string[] = [];
	const files: string[] = [];
	let inFilesList = false;

	for (const line of lines) {
		if (inFilesList) {
			if (line.startsWith("- ")) {
				files.push(line.slice(2).trim());
				continue;
			} else {
				inFilesList = false;
			}
		}

		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;

		const key = line.slice(0, colonIdx).trim().toLowerCase();
		const value = line.slice(colonIdx + 1).trim();

		switch (key) {
			case "id":
				id = value;
				break;
			case "name":
				name = value;
				break;
			case "type":
				type = value;
				break;
			case "loop":
				loop = value === "true";
				break;
			case "random":
				random = value === "true";
				break;
			case "autoplay":
				autoplay = parseAutoplayMode(value);
				break;
			case "stops":
				if (value) {
					stops = value.split(",").map(s => s.trim()).filter(s => s.length > 0);
				}
				break;
			case "resumes":
			case "starts": // deprecated alias for `resumes`, kept for backwards compatibility
				if (value) {
					resumes = value.split(",").map(s => s.trim()).filter(s => s.length > 0);
				}
				break;
			case "pauses":
				if (value) {
					pauses = value.split(",").map(s => s.trim()).filter(s => s.length > 0);
				}
				break;
			case "scope":
				if (value) {
					const raw = value.split(",").map(s => s.trim()).filter(s => s.length > 0);
					for (const token of raw) {
						if (token.includes("/")) {
							console.warn(`RPG Audio: scope label "${token}" contains "/" which is reserved for future use`);
						}
					}
					scope = Array.from(new Set(raw));
				}
				break;
			case "file":
				files.push(value);
				break;
			case "files":
				inFilesList = true;
				break;
		}
	}

	if (!id || !name || files.length === 0) return null;

	if (!type) type = files.length > 1 ? "playlist" : "sfx";

	return {id, name, type, files, loop, random, autoplay, stops, resumes, pauses, scope};
}

const FENCE_OPEN = /^(`{3,}|~{3,})(.*)$/;
const BLOCKQUOTE_PREFIX = /^\s*(>\s?)+/;

function isClosingFence(line: string, marker: string): boolean {
	return line.length >= marker.length && line === marker.charAt(0).repeat(line.length);
}

/** Every fence is tracked, so an rpg-audio example inside a longer markdown fence stays plain text. */
export function parseAudioBlocksInMarkdown(content: string): AudioTrackDef[] {
	const defs: AudioTrackDef[] = [];
	let open: {marker: string; isAudio: boolean} | null = null;
	let body: string[] = [];
	for (const rawLine of content.split("\n")) {
		const line = rawLine.replace(BLOCKQUOTE_PREFIX, "");
		const trimmed = line.trim();
		if (open === null) {
			const match = FENCE_OPEN.exec(trimmed);
			if (match?.[1]) {
				open = {marker: match[1], isAudio: (match[2] ?? "").trim() === "rpg-audio"};
				body = [];
			}
		} else if (isClosingFence(trimmed, open.marker)) {
			const def = open.isAudio ? parseAudioBlock(body.join("\n")) : null;
			if (def) defs.push(def);
			open = null;
		} else if (open.isAudio) {
			body.push(line);
		}
	}
	return defs;
}
