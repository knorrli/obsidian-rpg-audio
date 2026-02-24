import {MarkdownRenderChild, setIcon} from "obsidian";
import {AudioManager} from "../audio-manager";
import {AudioTrackDef, PlayState, EVENT_TRACK_CHANGED} from "../types";
import {createPlayerControls, updatePlayPauseButton, PlayerControlsElements} from "./player-controls";

export function parseAudioBlock(source: string): AudioTrackDef | null {
	const lines = source.split("\n").map(l => l.trim()).filter(l => l.length > 0);

	let id = "";
	let name = "";
	let type = "";
	let loop = false;
	let random = false;
	let stops: string[] = [];
	let starts: string[] = [];
	const files: string[] = [];
	let inFilesList = false;

	for (const line of lines) {
		if (inFilesList) {
			if (line.startsWith("- ")) {
				files.push(line.slice(2).trim());
				continue;
			} else {
				inFilesList = false;
			}
		}

		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;

		const key = line.slice(0, colonIdx).trim().toLowerCase();
		const value = line.slice(colonIdx + 1).trim();

		switch (key) {
			case "id":
				id = value;
				break;
			case "name":
				name = value;
				break;
			case "type":
				type = value;
				break;
			case "loop":
				loop = value === "true";
				break;
			case "random":
				random = value === "true";
				break;
			case "stops":
				if (value) {
					stops = value.split(",").map(s => s.trim()).filter(s => s.length > 0);
				}
				break;
			case "starts":
				if (value) {
					starts = value.split(",").map(s => s.trim()).filter(s => s.length > 0);
				}
				break;
			case "file":
				files.push(value);
				break;
			case "files":
				inFilesList = true;
				break;
		}
	}

	if (!id || !name || files.length === 0) return null;

	if (!type) type = files.length > 1 ? "playlist" : "sfx";

	return {id, name, type, files, loop, random, stops, starts};
}

export class RpgAudioCodeBlockPlayer extends MarkdownRenderChild {
	private manager: AudioManager;
	private def: AudioTrackDef;
	private controls: PlayerControlsElements | null = null;
	private statusEl: HTMLElement | null = null;
	private eventRef: (() => void) | null = null;

	constructor(containerEl: HTMLElement, manager: AudioManager, def: AudioTrackDef) {
		super(containerEl);
		this.manager = manager;
		this.def = def;
	}

	onload(): void {
		this.manager.register(this.def);
		this.buildUI();

		const handler = (changedId: string) => {
			if (changedId === this.def.id) this.syncState();
		};
		this.manager.on(EVENT_TRACK_CHANGED, handler);
		this.eventRef = () => this.manager.off(EVENT_TRACK_CHANGED, handler);

		this.syncState();
	}

	onunload(): void {
		if (this.eventRef) {
			this.eventRef();
			this.eventRef = null;
		}
		this.manager.scheduleOrphanCheck(this.def.id);
	}

	private buildUI(): void {
		const el = this.containerEl;
		el.empty();
		el.addClass("rpg-audio-player");

		const header = el.createDiv({cls: "rpg-audio-header"});
		const iconEl = header.createSpan({cls: "rpg-audio-icon"});
		setIcon(iconEl, this.getTypeIcon());
		header.createSpan({cls: "rpg-audio-name", text: this.def.name});
		header.createSpan({cls: "rpg-audio-badge", text: this.def.type});

		this.statusEl = el.createSpan({cls: "rpg-audio-status-inline"});

		const currentState = this.manager.getTrack(this.def.id);
		const initialVolume = currentState ? currentState.volume : 1.0;

		this.controls = createPlayerControls(el, {
			onPlay: () => { this.ensureActive(); void this.manager.play(this.def.id); },
			onPause: () => { this.ensureActive(); this.manager.pause(this.def.id); },
			onStop: () => { this.ensureActive(); this.manager.stop(this.def.id); },
			onVolumeChange: (v) => { this.ensureActive(); this.manager.setTrackVolume(this.def.id, v); },
		}, initialVolume);
	}

	/** Re-register track and event listener if orphaned (e.g. in embedded notes). */
	private ensureActive(): void {
		if (!this.manager.getTrack(this.def.id)) {
			this.manager.register(this.def);
		}
		if (!this.eventRef) {
			const handler = (changedId: string) => {
				if (changedId === this.def.id) this.syncState();
			};
			this.manager.on(EVENT_TRACK_CHANGED, handler);
			this.eventRef = () => this.manager.off(EVENT_TRACK_CHANGED, handler);
		}
	}

	private syncState(): void {
		const state = this.manager.getTrack(this.def.id);
		if (!state || !this.controls || !this.statusEl) return;

		updatePlayPauseButton(this.controls.playPauseBtn, state.playState);
		this.controls.volumeSlider.value = String(state.volume);

		this.containerEl.toggleClass("is-playing", state.playState === PlayState.Playing);
		this.containerEl.toggleClass("is-paused", state.playState === PlayState.Paused);
		this.containerEl.toggleClass("is-stopped", state.playState === PlayState.Stopped);

		let statusText = "";
		if (state.error) {
			statusText = state.error;
			this.statusEl.addClass("rpg-audio-error-text");
		} else {
			this.statusEl.removeClass("rpg-audio-error-text");
			if (state.playState === PlayState.Playing) {
				statusText = "Playing";
				if (state.def.files.length > 1) {
					statusText += ` (${state.currentIndex + 1}/${state.def.files.length})`;
				}
			} else if (state.playState === PlayState.Paused) {
				statusText = "Paused";
			}
		}
		this.statusEl.setText(statusText);
	}

	private getTypeIcon(): string {
		if (this.def.files.length > 1) return "list-music";
		if (this.def.loop) return "repeat";
		return "music";
	}
}
