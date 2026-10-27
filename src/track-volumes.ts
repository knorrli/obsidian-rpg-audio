import {debounce} from "obsidian";
import type RpgAudioPlugin from "./main";

const SAVE_DEBOUNCE_MS = 500;
const DEFAULT_VOLUME = 1;

/** Fader positions keyed by track id, so they survive reloads and tracks re-registering. */
export class TrackVolumes {
	private plugin: RpgAudioPlugin;
	private save = debounce(() => void this.plugin.saveSettings(), SAVE_DEBOUNCE_MS, true);

	constructor(plugin: RpgAudioPlugin) {
		this.plugin = plugin;
	}

	get(id: string): number {
		return this.plugin.settings.trackVolumes[id] ?? DEFAULT_VOLUME;
	}

	set(id: string, volume: number): void {
		const volumes = {...this.plugin.settings.trackVolumes};
		if (volume === DEFAULT_VOLUME) {
			delete volumes[id];
		} else {
			volumes[id] = volume;
		}
		this.plugin.settings.trackVolumes = volumes;
		this.save();
	}

	flush(): void {
		this.save.run();
	}
}
