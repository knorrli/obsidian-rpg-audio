import { App, Events } from "obsidian";
import {
	AudioTrackDef,
	AudioTrackState,
	PlayState,
	EVENT_TRACK_CHANGED,
	EVENT_TRACKS_UPDATED,
	EVENT_MASTER_VOLUME,
} from "./types";
import { FadeEngine } from "./fade-engine";

export class AudioManager extends Events {
	private app: App;
	private tracks: Map<string, AudioTrackState> = new Map();
	private audioElements: Map<string, HTMLAudioElement> = new Map();
	private orphanTimers: Map<string, number> = new Map();
	private _masterVolume = 1.0;
	private _audioFolder = "";
	private fades = new FadeEngine();
	private fadeMultipliers: Map<string, number> = new Map();
	private _crossfadeDuration = 0;

	constructor(app: App) {
		super();
		this.app = app;
	}

	set audioFolder(value: string) {
		this._audioFolder = value;
	}

	get crossfadeDuration(): number {
		return this._crossfadeDuration;
	}

	set crossfadeDuration(value: number) {
		this._crossfadeDuration = value;
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
			error: null,
		});
		this.trigger(EVENT_TRACKS_UPDATED);
	}

	unregister(id: string): void {
		this.fades.cancel(id);
		this.fadeMultipliers.delete(id);
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

		let crossfading = false;
		if (state.def.exclusive) {
			for (const [otherId, other] of this.tracks) {
				if (otherId !== id && other.def.type === state.def.type && other.playState === PlayState.Playing) {
					if (this._crossfadeDuration > 0) {
						this.fadeOutAndStop(otherId, this._crossfadeDuration);
						crossfading = true;
					} else {
						this.stop(otherId);
					}
				}
			}
		}

		const shouldFadeIn = crossfading;

		const fileIndex = state.currentIndex;
		const filePath = state.def.files[fileIndex];
		if (!filePath) return;

		const resourceUrl = this.resolveFile(filePath);
		if (!resourceUrl) {
			state.error = `File not found: ${filePath}`;
			state.playState = PlayState.Stopped;
			this.trigger(EVENT_TRACK_CHANGED, id);
			return;
		}

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
			state.error = null;
			if (shouldFadeIn) {
				this.fadeIn(id, this._crossfadeDuration);
			} else {
				this.applyVolume(id);
			}
		} catch (e) {
			console.error(`RPG Audio: failed to play track "${id}"`, e);
			state.error = `Playback failed: ${filePath}`;
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
		if (!state) return;

		this.fades.cancel(id);
		this.fadeMultipliers.delete(id);

		const el = this.audioElements.get(id);
		if (el) {
			el.pause();
			el.currentTime = 0;
		}

		state.playState = PlayState.Stopped;
		state.currentIndex = 0;
		state.error = null;
		this.trigger(EVENT_TRACK_CHANGED, id);
	}

	stopAll(): void {
		this.fades.cancelAll();
		this.fadeMultipliers.clear();
		for (const [id] of this.tracks) {
			this.stop(id);
		}
	}

	fadeOutType(type: string, duration: number): void {
		for (const [id, state] of this.tracks) {
			if (state.def.type === type && state.playState === PlayState.Playing) {
				const current = this.fadeMultipliers.get(id) ?? 1;
				this.fades.start(id, current, 0, duration, (value) => {
					this.fadeMultipliers.set(id, value);
					this.applyVolume(id);
				}).then(() => {
					this.pause(id);
					this.fadeMultipliers.delete(id);
				}).catch((e) => {
					console.error(`RPG Audio: fade-out failed for "${id}"`, e);
				});
			}
		}
	}

	fadeInType(type: string, duration: number): void {
		for (const [id, state] of this.tracks) {
			if (state.def.type === type && state.playState === PlayState.Paused) {
				this.fadeMultipliers.set(id, 0);
				this.applyVolume(id);
				this.play(id).then(() => {
					this.fades.start(id, 0, 1, duration, (value) => {
						this.fadeMultipliers.set(id, value);
						this.applyVolume(id);
					}).catch((e) => {
						console.error(`RPG Audio: fade-in failed for "${id}"`, e);
					});
				}).catch((e) => {
					console.error(`RPG Audio: fade-in play failed for "${id}"`, e);
				});
			}
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
		this.fades.destroy();
		this.fadeMultipliers.clear();
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
		el.volume = state.volume * this._masterVolume * (this.fadeMultipliers.get(id) ?? 1);
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
		if (!resourceUrl) {
			state.error = `File not found: ${filePath}`;
			state.playState = PlayState.Stopped;
			this.trigger(EVENT_TRACK_CHANGED, id);
			return;
		}

		const el = this.audioElements.get(id);
		if (!el) return;

		el.src = resourceUrl;
		el.loop = false;
		try {
			await el.play();
			state.error = null;
			this.applyVolume(id);
		} catch (e) {
			console.error(`RPG Audio: failed to play track "${id}"`, e);
			state.error = `Playback failed: ${filePath}`;
			state.playState = PlayState.Stopped;
		}
		this.trigger(EVENT_TRACK_CHANGED, id);
	}

	private fadeOutAndStop(id: string, duration: number): void {
		const current = this.fadeMultipliers.get(id) ?? 1;
		this.fades.start(id, current, 0, duration, (value) => {
			this.fadeMultipliers.set(id, value);
			this.applyVolume(id);
		}).then(() => {
			this.stop(id);
		}).catch((e) => {
			console.error(`RPG Audio: fade-out failed for "${id}"`, e);
		});
	}

	private fadeIn(id: string, duration: number): void {
		this.fadeMultipliers.set(id, 0);
		this.applyVolume(id);
		this.fades.start(id, 0, 1, duration, (value) => {
			this.fadeMultipliers.set(id, value);
			this.applyVolume(id);
		}).catch((e) => {
			console.error(`RPG Audio: fade-in failed for "${id}"`, e);
		});
	}

	private resolveFile(path: string): string | null {
		// Try the path as-is first (absolute vault path)
		let file = this.app.vault.getFileByPath(path);
		if (file) return this.app.vault.getResourcePath(file);

		// Try relative to the configured audio folder
		if (this._audioFolder) {
			const prefixed = `${this._audioFolder}/${path}`;
			file = this.app.vault.getFileByPath(prefixed);
			if (file) return this.app.vault.getResourcePath(file);
		}

		return null;
	}
}
