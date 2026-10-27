import { App, Events } from "obsidian";
import {
	AudioTrackDef,
	AudioTrackState,
	PlayState,
	EVENT_TRACK_CHANGED,
	EVENT_TRACKS_UPDATED,
	EVENT_MASTER_VOLUME,
	EVENT_ALLOW_AUTOPLAY,
	EVENT_ACTIVE_SCOPE_CHANGED,
} from "../types";
import { AudioOutput, resolveAudioUrl } from "./audio-output";
import { CauseInput, buildCause } from "./causes";
import { TrackFades } from "./track-fades";
import { TrackLifetime } from "./track-lifetime";
import { directiveTargets, sameScope, scopeTransitionTargets } from "./transitions";

export class AudioManager extends Events {
	audioFolder = "";
	crossfadeDuration = 0;
	playFadeDuration = 0;
	autoplayDelay = 0;

	private app: App;
	private tracks: Map<string, AudioTrackState> = new Map();
	private output = new AudioOutput();
	private fades = new TrackFades((id) => this.applyVolume(id));
	private lifetime: TrackLifetime;
	private unregistering: Set<string> = new Set();
	private _masterVolume = 1.0;
	private _allowAutoplay = false;
	private _activeScope: Set<string> = new Set();

	constructor(app: App) {
		super();
		this.app = app;
		this.lifetime = new TrackLifetime({
			getTrack: (id) => this.tracks.get(id),
			unregister: (id) => this.unregister(id),
			onLeftView: () => this.trigger(EVENT_TRACKS_UPDATED),
		});
	}

	get allowAutoplay(): boolean {
		return this._allowAutoplay;
	}

	set allowAutoplay(value: boolean) {
		if (this._allowAutoplay === value) return;
		this._allowAutoplay = value;
		this.trigger(EVENT_ALLOW_AUTOPLAY, value);
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

	get activeScope(): string[] {
		return Array.from(this._activeScope);
	}

	getAllTracks(): AudioTrackState[] {
		return Array.from(this.tracks.values());
	}

	getTrack(id: string): AudioTrackState | undefined {
		return this.tracks.get(id);
	}

	register(def: AudioTrackDef, sourcePath: string): void {
		this.upsert(def, sourcePath);
		this.trigger(EVENT_TRACKS_UPDATED);
	}

	registerAll(entries: {def: AudioTrackDef; sourcePath: string}[]): void {
		let changed = false;
		for (const {def, sourcePath} of entries) {
			if (this.upsert(def, sourcePath)) changed = true;
		}
		if (changed) this.trigger(EVENT_TRACKS_UPDATED);
	}

	/** Returns true if the track is new or its definition changed. */
	private upsert(def: AudioTrackDef, sourcePath: string): boolean {
		this.lifetime.clearOrphanTimer(def.id);

		const existing = this.tracks.get(def.id);
		if (existing) {
			const changed = existing.sourcePath !== sourcePath || JSON.stringify(existing.def) !== JSON.stringify(def);
			existing.def = def;
			existing.sourcePath = sourcePath;
			return changed;
		}

		this.tracks.set(def.id, {
			def,
			sourcePath,
			playState: PlayState.Stopped,
			volume: 1.0,
			currentIndex: 0,
			error: null,
			lastCause: null,
		});
		return true;
	}

	attachPlayer(id: string): void {
		this.lifetime.attachPlayer(id);
	}

	detachPlayer(id: string): void {
		this.lifetime.detachPlayer(id);
	}

	hasPlayers(id: string): boolean {
		return this.lifetime.hasPlayers(id);
	}

	setRetained(ids: Set<string>): void {
		this.lifetime.setRetained(ids);
	}

	unregister(id: string): void {
		// Break the stop → cleanupIfOrphaned → unregister → stop recursion: the
		// inner unregister returns here while the outer one finishes the teardown.
		if (this.unregistering.has(id)) return;
		this.unregistering.add(id);
		try {
			this.fades.clear(id);
			this.stop(id);
			this.output.release(id);
			this.tracks.delete(id);
			this.trigger(EVENT_TRACKS_UPDATED);
		} finally {
			this.unregistering.delete(id);
		}
	}

	async play(id: string, skipPlayFadeIn = false, cause?: CauseInput): Promise<void> {
		const state = this.tracks.get(id);
		if (!state) return;

		const fadeMode = this.fades.playMode(id);
		if (fadeMode === "out") {
			this.startPlayFadeIn(id);
			return;
		}
		if (fadeMode === "in") {
			return;
		}

		let crossfading = this.applyDirectives(id, state.def);
		if (state.def.scope.length > 0 && this.applyScopeTransition(id, state.def)) crossfading = true;

		const usePlayFadeIn = !crossfading && !skipPlayFadeIn && this.playFadeDuration > 0;

		if (state.def.random && state.def.files.length > 1 && state.playState !== PlayState.Paused) {
			state.currentIndex = Math.floor(Math.random() * state.def.files.length);
		}

		const filePath = state.def.files[state.currentIndex];
		if (!filePath) return;

		const resourceUrl = resolveAudioUrl(this.app, this.audioFolder, filePath);
		if (!resourceUrl) {
			this.markFailed(state, `File not found: ${filePath}`);
			this.trigger(EVENT_TRACK_CHANGED, id);
			return;
		}

		const el = this.output.ensureElement(id, () => this.onEnded(id));
		const wasPaused = state.playState === PlayState.Paused;
		if (!(wasPaused && el.src)) {
			el.src = resourceUrl;
			el.loop = state.def.loop && state.def.files.length === 1;
		}

		try {
			await el.play();
			state.playState = PlayState.Playing;
			state.error = null;
			state.lastCause = buildCause(wasPaused ? "resume" : "play", cause);
			if (crossfading) {
				this.fadeIn(id, this.crossfadeDuration);
			} else if (usePlayFadeIn) {
				this.fades.setMultiplier(id, 0);
				this.startPlayFadeIn(id);
			} else {
				this.applyVolume(id);
			}
		} catch (e) {
			console.error(`RPG Audio: failed to play track "${id}"`, e);
			this.markFailed(state, `Playback failed: ${filePath}`);
		}
		this.trigger(EVENT_TRACK_CHANGED, id);
	}

	/** Applies `stops`, `pauses` and `resumes`, in that order. Returns true if any track was crossfaded out. */
	private applyDirectives(id: string, def: AudioTrackDef): boolean {
		let crossfaded = false;

		for (const otherId of directiveTargets(this.tracks, id, def.stops, PlayState.Playing)) {
			if (this.stopWithCrossfade(otherId, {kind: "directive", detail: `stops from ${id}`})) crossfaded = true;
		}

		for (const otherId of directiveTargets(this.tracks, id, def.pauses, PlayState.Playing)) {
			const cause: CauseInput = {kind: "directive", detail: `pauses from ${id}`};
			if (this.crossfadeDuration > 0) {
				this.fadeOutThen(otherId, this.crossfadeDuration, () => this.applyPause(otherId, cause));
			} else {
				this.pause(otherId, false, cause);
			}
		}

		for (const otherId of directiveTargets(this.tracks, id, def.resumes, PlayState.Paused)) {
			const cause: CauseInput = {kind: "directive", detail: `resumes from ${id}`};
			if (this.crossfadeDuration > 0) {
				this.resumeWithFadeIn(otherId, this.crossfadeDuration, cause);
			} else {
				void this.play(otherId, false, cause);
			}
		}

		return crossfaded;
	}

	/** Returns true if any track was crossfaded out by the transition. */
	private applyScopeTransition(triggerId: string, def: AudioTrackDef): boolean {
		const newActive = new Set(def.scope);
		const changed = !sameScope(newActive, this._activeScope);
		this._activeScope = newActive;

		const cause: CauseInput = {
			kind: "scope",
			detail: `scope changed to {${Array.from(newActive).join(", ")}} by ${triggerId}`,
		};
		let crossfaded = false;
		for (const otherId of scopeTransitionTargets(this.tracks, triggerId, newActive)) {
			if (this.stopWithCrossfade(otherId, cause)) crossfaded = true;
		}

		if (changed) this.trigger(EVENT_ACTIVE_SCOPE_CHANGED, this.activeScope);
		return crossfaded;
	}

	pause(id: string, fromUserToggle = true, cause?: CauseInput): void {
		const state = this.tracks.get(id);
		if (!state) return;

		const fadeMode = this.fades.playMode(id);
		if (fadeMode === "out") {
			if (fromUserToggle) this.startPlayFadeIn(id);
			return;
		}
		if (fadeMode === "in") {
			this.startPlayFadeOut(id, cause);
			return;
		}

		if (state.playState !== PlayState.Playing) return;

		if (this.playFadeDuration > 0) {
			this.startPlayFadeOut(id, cause);
		} else {
			this.applyPause(id, cause);
		}
	}

	stop(id: string, cause?: CauseInput): void {
		const state = this.tracks.get(id);
		if (!state) return;

		this.fades.clear(id);

		const el = this.output.element(id);
		if (el) {
			el.pause();
			el.currentTime = 0;
		}

		state.playState = PlayState.Stopped;
		state.currentIndex = 0;
		state.error = null;
		state.lastCause = buildCause("stop", cause);
		this.trigger(EVENT_TRACK_CHANGED, id);
		this.lifetime.cleanupIfOrphaned(id);
	}

	stopAll(): void {
		this.fades.clearAll();
		for (const [id] of this.tracks) {
			this.stop(id, {kind: "user", detail: "stop all"});
		}
	}

	fadeOutAll(duration: number): void {
		this.fadeOutTracks(Array.from(this.tracks.keys()), duration, "fade out all");
	}

	fadeInAll(duration: number): void {
		this.fadeInTracks(Array.from(this.tracks.keys()), duration, "fade in all");
	}

	fadeOutTracks(ids: string[], duration: number, detail: string): void {
		const cause: CauseInput = {kind: "system", detail};
		for (const id of ids) {
			if (this.tracks.get(id)?.playState !== PlayState.Playing) continue;
			this.fadeOutThen(id, duration, () => this.applyPause(id, cause));
		}
	}

	fadeInTracks(ids: string[], duration: number, detail: string): void {
		const cause: CauseInput = {kind: "system", detail};
		for (const id of ids) {
			if (this.tracks.get(id)?.playState !== PlayState.Paused) continue;
			this.resumeWithFadeIn(id, duration, cause);
		}
	}

	setTrackVolume(id: string, volume: number): void {
		const state = this.tracks.get(id);
		if (!state) return;

		state.volume = Math.max(0, Math.min(1, volume));
		this.applyVolume(id);
		this.trigger(EVENT_TRACK_CHANGED, id);
	}

	destroyAll(): void {
		this.fades.destroy();
		this.unregistering.clear();
		this._activeScope.clear();
		this.lifetime.destroy();
		this.output.destroy();
		this.tracks.clear();
	}

	private applyVolume(id: string): void {
		const state = this.tracks.get(id);
		if (!state) return;
		this.output.setGain(id, state.volume * this._masterVolume * this.fades.multiplier(id));
	}

	private markFailed(state: AudioTrackState, message: string): void {
		state.error = message;
		state.playState = PlayState.Stopped;
	}

	private applyPause(id: string, cause?: CauseInput): void {
		const state = this.tracks.get(id);
		if (!state) return;

		this.output.element(id)?.pause();

		this.fades.clearPlayMode(id);
		this.fades.resetMultiplier(id);
		this.applyVolume(id);
		state.playState = PlayState.Paused;
		state.lastCause = buildCause("pause", cause);
		this.trigger(EVENT_TRACK_CHANGED, id);
	}

	private startPlayFadeOut(id: string, cause?: CauseInput): void {
		const current = this.fades.multiplier(id);
		if (current <= 0) {
			this.applyPause(id, cause);
			return;
		}
		this.fades.setPlayMode(id, "out");
		this.fades.ramp(id, current, 0, this.playFadeDuration * current).then((completed) => {
			if (this.fades.playMode(id) !== "out") return;
			if (completed) {
				this.applyPause(id, cause);
			} else {
				this.fades.clearPlayMode(id);
			}
		}).catch((e) => {
			console.error(`RPG Audio: play fade-out failed for "${id}"`, e);
		});
	}

	private startPlayFadeIn(id: string): void {
		const current = this.fades.hasMultiplier(id) ? this.fades.multiplier(id) : 0;
		if (current >= 1) {
			this.fades.clearPlayMode(id);
			this.fades.resetMultiplier(id);
			this.applyVolume(id);
			return;
		}
		this.fades.setPlayMode(id, "in");
		this.fades.ramp(id, current, 1, this.playFadeDuration * (1 - current)).then((completed) => {
			if (this.fades.playMode(id) !== "in") return;
			this.fades.clearPlayMode(id);
			if (completed) {
				this.fades.resetMultiplier(id);
				this.applyVolume(id);
			}
		}).catch((e) => {
			console.error(`RPG Audio: play fade-in failed for "${id}"`, e);
		});
	}

	/** Returns true if the stop is a crossfade rather than immediate. */
	private stopWithCrossfade(id: string, cause: CauseInput): boolean {
		if (this.crossfadeDuration > 0) {
			this.fadeOutThen(id, this.crossfadeDuration, () => this.stop(id, cause));
			return true;
		}
		this.stop(id, cause);
		return false;
	}

	private fadeOutThen(id: string, duration: number, onComplete: () => void): void {
		this.fades.ramp(id, this.fades.multiplier(id), 0, duration).then((completed) => {
			if (completed) onComplete();
		}).catch((e) => {
			console.error(`RPG Audio: fade-out failed for "${id}"`, e);
		});
	}

	private fadeIn(id: string, duration: number): void {
		this.fades.setMultiplier(id, 0);
		this.fades.ramp(id, 0, 1, duration).then((completed) => {
			if (completed) this.fades.resetMultiplier(id);
		}).catch((e) => {
			console.error(`RPG Audio: fade-in failed for "${id}"`, e);
		});
	}

	/** Mutes before resuming, since the element starts producing sound before `play()` resolves. */
	private resumeWithFadeIn(id: string, duration: number, cause: CauseInput): void {
		this.fades.setMultiplier(id, 0);
		this.play(id, true, cause).then(() => {
			if (this.tracks.get(id)?.playState === PlayState.Playing) {
				this.fadeIn(id, duration);
			} else {
				this.fades.resetMultiplier(id);
			}
		}).catch((e) => {
			console.error(`RPG Audio: fade-in failed for "${id}"`, e);
		});
	}

	private onEnded(id: string): void {
		const state = this.tracks.get(id);
		if (!state) return;

		if (state.def.files.length > 1 && state.def.loop) {
			if (state.def.random) {
				let next = Math.floor(Math.random() * state.def.files.length);
				if (next === state.currentIndex) {
					next = (next + 1) % state.def.files.length;
				}
				state.currentIndex = next;
			} else {
				state.currentIndex = (state.currentIndex + 1) % state.def.files.length;
			}
			void this.playCurrentIndex(id);
		} else {
			state.playState = PlayState.Stopped;
			state.currentIndex = 0;
			state.lastCause = buildCause("stop", {kind: "ended"});
			this.trigger(EVENT_TRACK_CHANGED, id);
			this.lifetime.cleanupIfOrphaned(id);
		}
	}

	private async playCurrentIndex(id: string): Promise<void> {
		const state = this.tracks.get(id);
		if (!state) return;

		const filePath = state.def.files[state.currentIndex];
		if (!filePath) return;

		const resourceUrl = resolveAudioUrl(this.app, this.audioFolder, filePath);
		if (!resourceUrl) {
			this.markFailed(state, `File not found: ${filePath}`);
			this.trigger(EVENT_TRACK_CHANGED, id);
			return;
		}

		const el = this.output.element(id);
		if (!el) return;

		el.src = resourceUrl;
		el.loop = false;
		try {
			await el.play();
			state.error = null;
			this.applyVolume(id);
		} catch (e) {
			console.error(`RPG Audio: failed to play track "${id}"`, e);
			this.markFailed(state, `Playback failed: ${filePath}`);
		}
		this.trigger(EVENT_TRACK_CHANGED, id);
	}
}
