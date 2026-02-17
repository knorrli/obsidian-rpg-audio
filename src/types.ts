export enum PlayState {
	Stopped = "stopped",
	Playing = "playing",
	Paused = "paused",
}

export interface AudioTrackDef {
	id: string;
	name: string;
	type: string;
	files: string[];
	loop: boolean;
}

export interface AudioTrackState {
	def: AudioTrackDef;
	playState: PlayState;
	volume: number;
	currentIndex: number;
}

export const EVENT_TRACK_CHANGED = "track-changed";
export const EVENT_TRACKS_UPDATED = "tracks-updated";
export const EVENT_MASTER_VOLUME = "master-volume";

export const SIDEBAR_VIEW_TYPE = "rpg-audio-sidebar";
