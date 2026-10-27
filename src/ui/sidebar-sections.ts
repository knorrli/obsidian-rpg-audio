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

export interface FolderGroup {
	path: string;
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

	const pinned = claim(sticky.pins.map(p => p.id));
	const library = claim(sticky.libraryTrackIds);
	const missingPins = sticky.loaded ? sticky.pins.filter(p => !manager.getTrack(p.id)) : [];

	const rest = manager.getAllTracks().filter(t => !claimed.has(t.def.id));
	const inView = rest.filter(t => manager.hasPlayers(t.def.id));
	const elsewhere = rest.filter(t => !manager.hasPlayers(t.def.id));

	const sections: SidebarSection[] = [
		{key: "pinned", label: "Pinned", tracks: pinned, missingPins},
		{key: "library", label: "Library", tracks: library, missingPins: []},
		{key: "in-view", label: "In view", tracks: inView, missingPins: []},
		{key: "elsewhere", label: "Elsewhere", tracks: elsewhere, missingPins: []},
	];
	return sections.filter(s => s.tracks.length > 0 || s.missingPins.length > 0);
}

/** One group per folder, sorted by path; tracks keep their order within a group. */
export function groupByFolder(tracks: AudioTrackState[], folderOf: (id: string) => string): FolderGroup[] {
	const groups = new Map<string, AudioTrackState[]>();
	for (const track of tracks) {
		const path = folderOf(track.def.id);
		const group = groups.get(path);
		if (group) {
			group.push(track);
		} else {
			groups.set(path, [track]);
		}
	}
	return Array.from(groups, ([path, groupTracks]) => ({path, tracks: groupTracks}))
		.sort((a, b) => a.path.localeCompare(b.path));
}

export function anyInState(manager: AudioManager, ids: string[], playState: PlayState): boolean {
	return ids.some(id => manager.getTrack(id)?.playState === playState);
}

export function sidebarFadeDuration(manager: AudioManager): number {
	return Math.max(manager.crossfadeDuration, MIN_FADE_DURATION_MS);
}
