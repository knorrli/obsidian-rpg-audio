import {App, Events} from "obsidian";
import {
	AudioTrackDef,
	AudioTrackState,
	PlayState,
	EVENT_TRACK_CHANGED,
	EVENT_TRACKS_UPDATED,
	EVENT_MASTER_VOLUME,
} from "./types";

export class AudioManager extends Events {
	private app: App;
	private tracks: Map<string, AudioTrackState> = new Map();
	private audioElements: Map<string, HTMLAudioElement> = new Map();
	private orphanTimers: Map<string, number> = new Map();
	private _masterVolume = 1.0;

	constructor(app: App) {
		super();
		this.app = app;
	}

	get masterVolume(): number {
		return this._masterVolume;
	}

	set masterVolume(value: number) {
		this._masterVolume = Math.max(0, Math.min(1, value));
		for (const [id] of this.tracks) {
			this.applyVolume(id);
		}
		this.trigger(EVENT_MASTER_VOLUME, this._masterVolume);
	}

	getAllTracks(): AudioTrackState[] {
		return Array.from(this.tracks.values());
	}

	getTrack(id: string): AudioTrackState | undefined {
		return this.tracks.get(id);
	}

	register(def: AudioTrackDef): void {
		this.clearOrphanTimer(def.id);

		const existing = this.tracks.get(def.id);
		if (existing) {
			existing.def = def;
			this.trigger(EVENT_TRACKS_UPDATED);
			return;
		}

		this.tracks.set(def.id, {
			def,
			playState: PlayState.Stopped,
			volume: 1.0,
			currentIndex: 0,
		});
		this.trigger(EVENT_TRACKS_UPDATED);
	}

	unregister(id: string): void {
		this.stop(id);
		const el = this.audioElements.get(id);
		if (el) {
			el.pause();
			el.removeAttribute("src");
			el.load();
			this.audioElements.delete(id);
		}
		this.tracks.delete(id);
		this.trigger(EVENT_TRACKS_UPDATED);
	}

	async play(id: string): Promise<void> {
		const state = this.tracks.get(id);
		if (!state) return;

		const fileIndex = state.currentIndex;
		const filePath = state.def.files[fileIndex];
		if (!filePath) return;

		const resourceUrl = this.resolveFile(filePath);
		if (!resourceUrl) return;

		let el = this.audioElements.get(id);
		if (!el) {
			el = new Audio();
			this.audioElements.set(id, el);
			this.setupAudioElement(id, el);
		}

		if (!(state.playState === PlayState.Paused && el.src)) {
			el.src = resourceUrl;
			el.loop = state.def.loop && state.def.files.length === 1;
		}

		try {
			await el.play();
			state.playState = PlayState.Playing;
			this.applyVolume(id);
		} catch (e) {
			console.error(`RPG Audio: failed to play track "${id}"`, e);
			state.playState = PlayState.Stopped;
		}
		this.trigger(EVENT_TRACK_CHANGED, id);
	}

	pause(id: string): void {
		const state = this.tracks.get(id);
		if (!state || state.playState !== PlayState.Playing) return;

		const el = this.audioElements.get(id);
		if (el) el.pause();

		state.playState = PlayState.Paused;
		this.trigger(EVENT_TRACK_CHANGED, id);
	}

	stop(id: string): void {
		const state = this.tracks.get(id);
		if (!state || state.playState === PlayState.Stopped) return;

		const el = this.audioElements.get(id);
		if (el) {
			el.pause();
			el.currentTime = 0;
		}

		state.playState = PlayState.Stopped;
		state.currentIndex = 0;
		this.trigger(EVENT_TRACK_CHANGED, id);
	}

	stopAll(): void {
		for (const [id] of this.tracks) {
			this.stop(id);
		}
	}

	setTrackVolume(id: string, volume: number): void {
		const state = this.tracks.get(id);
		if (!state) return;

		state.volume = Math.max(0, Math.min(1, volume));
		this.applyVolume(id);
		this.trigger(EVENT_TRACK_CHANGED, id);
	}

	scheduleOrphanCheck(id: string): void {
		this.clearOrphanTimer(id);
		const timer = window.setTimeout(() => {
			this.orphanTimers.delete(id);
			const state = this.tracks.get(id);
			if (!state) return;
			if (state.playState === PlayState.Playing) return;
			this.unregister(id);
		}, 2000);
		this.orphanTimers.set(id, timer);
	}

	private clearOrphanTimer(id: string): void {
		const timer = this.orphanTimers.get(id);
		if (timer !== undefined) {
			window.clearTimeout(timer);
			this.orphanTimers.delete(id);
		}
	}

	destroyAll(): void {
		for (const [, timer] of this.orphanTimers) {
			window.clearTimeout(timer);
		}
		this.orphanTimers.clear();
		for (const [, el] of this.audioElements) {
			el.pause();
			el.removeAttribute("src");
			el.load();
		}
		this.audioElements.clear();
		this.tracks.clear();
	}

	private applyVolume(id: string): void {
		const state = this.tracks.get(id);
		const el = this.audioElements.get(id);
		if (!state || !el) return;
		el.volume = state.volume * this._masterVolume;
	}

	private setupAudioElement(id: string, el: HTMLAudioElement): void {
		el.addEventListener("ended", () => {
			const state = this.tracks.get(id);
			if (!state) return;

			if (state.def.files.length > 1) {
				const nextIndex = state.currentIndex + 1;
				if (nextIndex < state.def.files.length) {
					state.currentIndex = nextIndex;
					void this.playCurrentIndex(id);
				} else if (state.def.loop) {
					state.currentIndex = 0;
					void this.playCurrentIndex(id);
				} else {
					state.playState = PlayState.Stopped;
					state.currentIndex = 0;
					this.trigger(EVENT_TRACK_CHANGED, id);
				}
			} else {
				state.playState = PlayState.Stopped;
				this.trigger(EVENT_TRACK_CHANGED, id);
			}
		});
	}

	private async playCurrentIndex(id: string): Promise<void> {
		const state = this.tracks.get(id);
		if (!state) return;

		const filePath = state.def.files[state.currentIndex];
		if (!filePath) return;

		const resourceUrl = this.resolveFile(filePath);
		if (!resourceUrl) return;

		const el = this.audioElements.get(id);
		if (!el) return;

		el.src = resourceUrl;
		el.loop = false;
		try {
			await el.play();
			this.applyVolume(id);
		} catch (e) {
			console.error(`RPG Audio: failed to play track "${id}"`, e);
			state.playState = PlayState.Stopped;
		}
		this.trigger(EVENT_TRACK_CHANGED, id);
	}

	private resolveFile(path: string): string | null {
		const file = this.app.vault.getFileByPath(path);
		if (!file) return null;
		return this.app.vault.getResourcePath(file);
	}
}
