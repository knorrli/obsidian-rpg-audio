interface ActiveFade {
	id: string;
	from: number;
	to: number;
	duration: number;
	startTime: number;
	onTick: (value: number) => void;
	resolve: () => void;
}

export class FadeEngine {
	private activeFades: Map<string, ActiveFade> = new Map();
	private rafId: number | null = null;

	start(
		id: string,
		from: number,
		to: number,
		durationMs: number,
		onTick: (value: number) => void,
	): Promise<void> {
		this.cancel(id);

		return new Promise<void>((resolve) => {
			const fade: ActiveFade = {
				id,
				from,
				to,
				duration: durationMs,
				startTime: performance.now(),
				onTick,
				resolve,
			};
			this.activeFades.set(id, fade);
			this.ensureLoop();
		});
	}

	cancel(id: string): void {
		const fade = this.activeFades.get(id);
		if (fade) {
			this.activeFades.delete(id);
			fade.resolve();
		}
		if (this.activeFades.size === 0) this.stopLoop();
	}

	cancelAll(): void {
		for (const fade of this.activeFades.values()) {
			fade.resolve();
		}
		this.activeFades.clear();
		this.stopLoop();
	}

	destroy(): void {
		this.cancelAll();
	}

	private ensureLoop(): void {
		if (this.rafId !== null) return;
		const tick = (now: number) => {
			for (const fade of this.activeFades.values()) {
				const elapsed = now - fade.startTime;
				const t = Math.min(elapsed / fade.duration, 1);
				const value = fade.from + (fade.to - fade.from) * t;
				fade.onTick(value);
				if (t >= 1) {
					this.activeFades.delete(fade.id);
					fade.resolve();
				}
			}
			if (this.activeFades.size > 0) {
				this.rafId = requestAnimationFrame(tick);
			} else {
				this.rafId = null;
			}
		};
		this.rafId = requestAnimationFrame(tick);
	}

	private stopLoop(): void {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}
}
