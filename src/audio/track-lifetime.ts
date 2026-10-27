import {AudioTrackState, PlayState, ORPHAN_CHECK_DELAY_MS} from "../types";

export interface LifetimeHost {
	getTrack(id: string): AudioTrackState | undefined;
	unregister(id: string): void;
	/** A track lost its last player but is still playing or paused. */
	onLeftView(id: string): void;
}

/**
 * Decides when a track can be unregistered: once it is stopped, has no player
 * on screen, and isn't retained by the library or a pin.
 */
export class TrackLifetime {
	private host: LifetimeHost;
	private playerCounts: Map<string, number> = new Map();
	private retained: Set<string> = new Set();
	private orphanTimers: Map<string, number> = new Map();

	constructor(host: LifetimeHost) {
		this.host = host;
	}

	attachPlayer(id: string): void {
		this.playerCounts.set(id, (this.playerCounts.get(id) ?? 0) + 1);
	}

	detachPlayer(id: string): void {
		const count = (this.playerCounts.get(id) ?? 0) - 1;
		if (count > 0) {
			this.playerCounts.set(id, count);
		} else {
			this.playerCounts.delete(id);
		}
		this.scheduleOrphanCheck(id);
	}

	/**
	 * Stays true through the orphan-check grace period after the last player
	 * detaches, so a note switch doesn't flash its tracks out of view and back.
	 */
	hasPlayers(id: string): boolean {
		return this.playerCounts.has(id) || this.orphanTimers.has(id);
	}

	/** Releasing a retained track cleans it up once stopped. */
	setRetained(ids: Set<string>): void {
		const released = Array.from(this.retained).filter(id => !ids.has(id));
		this.retained = new Set(ids);
		for (const id of released) this.cleanupIfOrphaned(id);
	}

	cleanupIfOrphaned(id: string): void {
		const state = this.host.getTrack(id);
		if (!state || state.playState !== PlayState.Stopped) return;
		if (this.retained.has(id) || hasLivePlayerElement(id)) return;
		this.host.unregister(id);
	}

	clearOrphanTimer(id: string): void {
		const timer = this.orphanTimers.get(id);
		if (timer !== undefined) {
			window.clearTimeout(timer);
			this.orphanTimers.delete(id);
		}
	}

	destroy(): void {
		for (const timer of this.orphanTimers.values()) window.clearTimeout(timer);
		this.orphanTimers.clear();
		this.playerCounts.clear();
		this.retained.clear();
	}

	private scheduleOrphanCheck(id: string): void {
		this.clearOrphanTimer(id);
		const timer = window.setTimeout(() => {
			this.orphanTimers.delete(id);
			const state = this.host.getTrack(id);
			if (!state) return;
			if (this.retained.has(id) || hasLivePlayerElement(id)) return;
			if (state.playState === PlayState.Playing || state.playState === PlayState.Paused) {
				// Live element gone but track still in use; wait for it to stop, then
				// cleanupIfOrphaned will pick it up.
				this.host.onLeftView(id);
				return;
			}
			this.host.unregister(id);
		}, ORPHAN_CHECK_DELAY_MS);
		this.orphanTimers.set(id, timer);
	}
}

/**
 * Player components inside transclusions don't reliably get onunload, so the
 * player counts alone can't be trusted for cleanup; the DOM is checked too.
 */
function hasLivePlayerElement(id: string): boolean {
	const selector = `.rpg-audio-player[data-track-id="${CSS.escape(id)}"]`;
	const elements = document.querySelectorAll<HTMLElement>(selector);
	for (let i = 0; i < elements.length; i++) {
		const el = elements[i];
		if (el && el.isConnected) return true;
	}
	return false;
}
