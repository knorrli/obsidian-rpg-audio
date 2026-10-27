import {FadeEngine} from "./fade-engine";

export type PlayFadeMode = "in" | "out";

/**
 * Per-track fade multiplier (absent means 1) and, for play/pause fades, which
 * direction is in flight. `onChange` re-applies the track's gain.
 */
export class TrackFades {
	private engine = new FadeEngine();
	private multipliers: Map<string, number> = new Map();
	private playModes: Map<string, PlayFadeMode> = new Map();
	private onChange: (id: string) => void;

	constructor(onChange: (id: string) => void) {
		this.onChange = onChange;
	}

	multiplier(id: string): number {
		return this.multipliers.get(id) ?? 1;
	}

	hasMultiplier(id: string): boolean {
		return this.multipliers.has(id);
	}

	setMultiplier(id: string, value: number): void {
		this.multipliers.set(id, value);
		this.onChange(id);
	}

	resetMultiplier(id: string): void {
		this.multipliers.delete(id);
	}

	playMode(id: string): PlayFadeMode | undefined {
		return this.playModes.get(id);
	}

	setPlayMode(id: string, mode: PlayFadeMode): void {
		this.playModes.set(id, mode);
	}

	clearPlayMode(id: string): void {
		this.playModes.delete(id);
	}

	/** Resolves true when the ramp completes, false when another ramp or `clear` cancels it. */
	ramp(id: string, from: number, to: number, durationMs: number): Promise<boolean> {
		return this.engine.start(id, from, to, durationMs, (value) => this.setMultiplier(id, value));
	}

	clear(id: string): void {
		this.engine.cancel(id);
		this.multipliers.delete(id);
		this.playModes.delete(id);
	}

	clearAll(): void {
		this.engine.cancelAll();
		this.multipliers.clear();
		this.playModes.clear();
	}

	destroy(): void {
		this.engine.destroy();
		this.multipliers.clear();
		this.playModes.clear();
	}
}
