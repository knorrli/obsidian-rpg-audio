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
	random: boolean;
	autoplay: boolean;
	stops: string[];
	resumes: string[];
	pauses: string[];
	scope: string[];
}

export type TrackAction = "play" | "pause" | "stop" | "resume";
export type TrackCauseKind = "user" | "directive" | "scope" | "autoplay" | "system" | "ended";

export interface TrackCause {
	action: TrackAction;
	kind: TrackCauseKind;
	detail?: string;
	at: number;
}

export interface AudioTrackState {
	def: AudioTrackDef;
	playState: PlayState;
	volume: number;
	currentIndex: number;
	error: string | null;
	lastCause: TrackCause | null;
}

export const EVENT_TRACK_CHANGED = "track-changed";
export const EVENT_TRACKS_UPDATED = "tracks-updated";
export const EVENT_MASTER_VOLUME = "master-volume";
export const EVENT_ALLOW_AUTOPLAY = "allow-autoplay";
export const EVENT_ACTIVE_SCOPE_CHANGED = "active-scope-changed";

export const SIDEBAR_VIEW_TYPE = "rpg-audio-sidebar";

/** Delay before an orphaned track (no live code-block-player) is cleaned up. */
export const ORPHAN_CHECK_DELAY_MS = 2000;
/** How often to poll for DOM detachment (workaround for transclusion onunload bug). */
export const DETACH_POLL_INTERVAL_MS = 2000;
/** Minimum fade duration when using the sidebar fade buttons. */
export const MIN_FADE_DURATION_MS = 1000;
