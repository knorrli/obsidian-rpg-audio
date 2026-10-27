import {AudioTrackDef, AudioTrackState, PlayState} from "../src/types";

export function trackDef(overrides: Partial<AudioTrackDef> & {id: string}): AudioTrackDef {
	return {
		name: overrides.id,
		type: "sfx",
		files: [`${overrides.id}.mp3`],
		loop: false,
		random: false,
		autoplay: "off",
		stops: [],
		resumes: [],
		pauses: [],
		scope: [],
		...overrides,
	};
}

export function trackState(
	def: Partial<AudioTrackDef> & {id: string},
	state: Partial<Omit<AudioTrackState, "def">> = {},
): AudioTrackState {
	return {
		def: trackDef(def),
		sourcePath: "Note.md",
		playState: PlayState.Stopped,
		volume: 1,
		currentIndex: 0,
		error: null,
		lastCause: null,
		...state,
	};
}

export function trackMap(...tracks: AudioTrackState[]): Map<string, AudioTrackState> {
	return new Map(tracks.map(t => [t.def.id, t]));
}
