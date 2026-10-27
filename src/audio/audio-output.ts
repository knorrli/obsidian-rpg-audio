import {App} from "obsidian";

/** One audio element per track, each routed through its own gain node. */
export class AudioOutput {
	private context: AudioContext | null = null;
	private elements: Map<string, HTMLAudioElement> = new Map();
	private gains: Map<string, GainNode> = new Map();

	element(id: string): HTMLAudioElement | undefined {
		return this.elements.get(id);
	}

	ensureElement(id: string, onEnded: () => void): HTMLAudioElement {
		const existing = this.elements.get(id);
		if (existing) return existing;

		const el = new Audio();
		// Vault resource URLs live on a per-vault app:// origin distinct from the
		// window's; without a CORS-mode load the MediaElementSource outputs silence.
		el.crossOrigin = "anonymous";
		this.elements.set(id, el);

		const ctx = this.ensureContext();
		const source = ctx.createMediaElementSource(el);
		const gain = ctx.createGain();
		source.connect(gain);
		gain.connect(ctx.destination);
		this.gains.set(id, gain);

		el.addEventListener("ended", onEnded);
		return el;
	}

	setGain(id: string, value: number): void {
		const gain = this.gains.get(id);
		if (gain) gain.gain.value = value;
	}

	release(id: string): void {
		const el = this.elements.get(id);
		if (el) {
			unloadElement(el);
			this.elements.delete(id);
		}
		const gain = this.gains.get(id);
		if (gain) {
			gain.disconnect();
			this.gains.delete(id);
		}
	}

	destroy(): void {
		for (const el of this.elements.values()) unloadElement(el);
		this.elements.clear();
		for (const gain of this.gains.values()) gain.disconnect();
		this.gains.clear();
		if (this.context) {
			this.context.close().catch(() => {});
			this.context = null;
		}
	}

	private ensureContext(): AudioContext {
		if (!this.context) {
			this.context = new AudioContext();
		}
		if (this.context.state === "suspended") {
			this.context.resume().catch(() => {});
		}
		return this.context;
	}
}

function unloadElement(el: HTMLAudioElement): void {
	el.pause();
	el.removeAttribute("src");
	el.load();
}

/** Tries `path` as a vault path first, then relative to `audioFolder`. */
export function resolveAudioUrl(app: App, audioFolder: string, path: string): string | null {
	let file = app.vault.getFileByPath(path);
	if (file) return app.vault.getResourcePath(file);

	if (audioFolder) {
		file = app.vault.getFileByPath(`${audioFolder}/${path}`);
		if (file) return app.vault.getResourcePath(file);
	}

	return null;
}
