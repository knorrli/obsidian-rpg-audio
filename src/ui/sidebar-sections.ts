import {AudioManager} from "../audio/audio-manager";
import type {StickyTracks} from "../sticky-tracks";
import {AudioTrackState, MIN_FADE_DURATION_MS, PinnedTrackRef, PlayState} from "../types";

export type SectionKey = "library" | "pinned" | "in-view" | "elsewhere";

export interface SidebarSection {
	key: SectionKey;
	label: string;
	tracks: AudioTrackState[];
	/** Pins whose block could not be found in the pinned note. */
	missingPins: PinnedTrackRef[];
}

export interface TypeGroup {
	type: string;
	tracks: AudioTrackState[];
}

/**
 * Each track appears in exactly one section, claimed in section order. Order
 * within a section never depends on play state, so a track keeps its position.
 */
export function buildSidebarSections(manager: AudioManager, sticky: StickyTracks): SidebarSection[] {
	const claimed = new Set<string>();
	const claim = (ids: string[]): AudioTrackState[] => {
		const tracks: AudioTrackState[] = [];
		for (const id of ids) {
			const track = manager.getTrack(id);
			if (!track || claimed.has(id)) continue;
			claimed.add(id);
			tracks.push(track);
		}
		return tracks;
	};

	const library = claim(sticky.libraryTrackIds);
	const pinned = claim(sticky.pins.map(p => p.id));
	const missingPins = sticky.loaded ? sticky.pins.filter(p => !manager.getTrack(p.id)) : [];

	const rest = manager.getAllTracks().filter(t => !claimed.has(t.def.id));
	const inView = rest.filter(t => manager.hasPlayers(t.def.id));
	const elsewhere = rest.filter(t => !manager.hasPlayers(t.def.id));

	const sections: SidebarSection[] = [
		{key: "library", label: "Library", tracks: library, missingPins: []},
		{key: "pinned", label: "Pinned", tracks: pinned, missingPins},
		{key: "in-view", label: "In view", tracks: inView, missingPins: []},
		{key: "elsewhere", label: "Elsewhere", tracks: elsewhere, missingPins: []},
	];
	return sections.filter(s => s.tracks.length > 0 || s.missingPins.length > 0);
}

export function groupByType(tracks: AudioTrackState[]): TypeGroup[] {
	const groups = new Map<string, AudioTrackState[]>();
	for (const track of tracks) {
		const group = groups.get(track.def.type);
		if (group) {
			group.push(track);
		} else {
			groups.set(track.def.type, [track]);
		}
	}
	return Array.from(groups, ([type, groupTracks]) => ({type, tracks: groupTracks}))
		.sort((a, b) => a.type.localeCompare(b.type));
}

export function anyInState(manager: AudioManager, ids: string[], playState: PlayState): boolean {
	return ids.some(id => manager.getTrack(id)?.playState === playState);
}

export function sidebarFadeDuration(manager: AudioManager): number {
	return Math.max(manager.crossfadeDuration, MIN_FADE_DURATION_MS);
}
