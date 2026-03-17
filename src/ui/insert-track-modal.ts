import { App, Modal, Setting, FuzzySuggestModal, TFile } from "obsidian";

const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "flac", "m4a", "webm", "aac"];

const TYPE_OPTIONS: Record<string, string> = {
	music: "Music",
	sfx: "SFX",
	ambience: "Ambience",
	playlist: "Playlist",
};

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function generateCodeBlock(opts: {
	id: string;
	name: string;
	type: string;
	files: string[];
	loop: boolean;
	random: boolean;
	stops: string;
	pauses: string;
	starts: string;
}): string {
	const lines: string[] = [];
	lines.push(`id: ${opts.id}`);
	lines.push(`name: ${opts.name}`);
	lines.push(`type: ${opts.type}`);
	if (opts.loop) lines.push("loop: true");
	if (opts.random) lines.push("random: true");
	if (opts.stops.trim()) lines.push(`stops: ${opts.stops.trim()}`);
	if (opts.pauses.trim()) lines.push(`pauses: ${opts.pauses.trim()}`);
	if (opts.starts.trim()) lines.push(`starts: ${opts.starts.trim()}`);

	if (opts.files.length === 1) {
		lines.push(`file: ${opts.files[0]}`);
	} else if (opts.files.length > 1) {
		lines.push("files:");
		for (const f of opts.files) {
			lines.push(`- ${f}`);
		}
	}

	return "```rpg-audio\n" + lines.join("\n") + "\n```";
}

class AudioFileSuggestModal extends FuzzySuggestModal<TFile> {
	private audioFiles: TFile[];
	private onChoose: (file: TFile) => void;

	constructor(app: App, audioFiles: TFile[], onChoose: (file: TFile) => void) {
		super(app);
		this.audioFiles = audioFiles;
		this.onChoose = onChoose;
		this.setPlaceholder("Search audio files…");
	}

	getItems(): TFile[] {
		return this.audioFiles;
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile): void {
		this.onChoose(item);
	}
}

export class InsertTrackModal extends Modal {
	private audioFolder: string;
	private onInsert: (codeBlock: string) => void;

	private name = "";
	private id = "";
	private idManuallyEdited = false;
	private type = "music";
	private customType = "";
	private selectedFiles: string[] = [];
	private loop = false;
	private random = false;
	private stops = "";
	private pauses = "";
	private starts = "";

	private fileListEl: HTMLElement | null = null;
	private insertBtn: HTMLButtonElement | null = null;
	private idSetting: Setting | null = null;
	private customTypeEl: HTMLElement | null = null;

	constructor(app: App, audioFolder: string, onInsert: (codeBlock: string) => void) {
		super(app);
		this.audioFolder = audioFolder;
		this.onInsert = onInsert;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("rpg-audio-insert-modal");

		contentEl.createEl("h2", { text: "Insert audio track" });

		new Setting(contentEl)
			.setName("Name")
			.setDesc("Display name for this track")
			.addText(text => text
				.setPlaceholder("Tavern music")
				.onChange(value => {
					this.name = value;
					if (!this.idManuallyEdited) {
						this.id = slugify(value);
						this.updateIdDisplay();
					}
					this.updateInsertBtn();
				}));

		this.idSetting = new Setting(contentEl)
			.setName("ID")
			.setDesc("Unique identifier (auto-generated from name)")
			.addText(text => text
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setPlaceholder("tavern-music")
				.onChange(value => {
					this.id = value;
					this.idManuallyEdited = value.length > 0;
					this.updateInsertBtn();
				}));

		const typeSetting = new Setting(contentEl)
			.setName("Type")
			.addDropdown(dropdown => {
				for (const [value, label] of Object.entries(TYPE_OPTIONS)) {
					dropdown.addOption(value, label);
				}
				dropdown.addOption("__custom__", "Custom…");
				dropdown.setValue(this.type);
				dropdown.onChange(value => {
					if (value === "__custom__") {
						this.type = this.customType;
						this.showCustomType(true);
					} else {
						this.type = value;
						this.showCustomType(false);
					}
					this.updateInsertBtn();
				});
			});

		this.customTypeEl = typeSetting.controlEl.createDiv({ cls: "rpg-audio-custom-type is-hidden" });
		const customInput = this.customTypeEl.createEl("input", {
			type: "text",
			placeholder: "Enter custom type",
			cls: "rpg-audio-custom-type-input",
		});
		customInput.addEventListener("input", () => {
			this.customType = customInput.value;
			this.type = customInput.value;
			this.updateInsertBtn();
		});

		// Files section
		const fileSetting = new Setting(contentEl)
			.setName("Audio files")
			.setDesc("Select one or more audio files from your vault")
			.addButton(btn => btn
				.setButtonText("Add file")
				.setCta()
				.onClick(() => this.openFilePicker()));

		this.fileListEl = fileSetting.controlEl.createDiv({ cls: "rpg-audio-file-list" });

		new Setting(contentEl)
			.setName("Loop")
			.setDesc("Loop playback (single file repeats, playlist cycles)")
			.addToggle(toggle => toggle
				.setValue(this.loop)
				.onChange(value => { this.loop = value; }));

		new Setting(contentEl)
			.setName("Random")
			.setDesc("Randomize playback order for playlists")
			.addToggle(toggle => toggle
				.setValue(this.random)
				.onChange(value => { this.random = value; }));

		// Advanced section
		contentEl.createEl("details", {}, details => {
			details.createEl("summary", { text: "Advanced", cls: "rpg-audio-insert-advanced-summary" });

			new Setting(details)
				.setName("Stops")
				.setDesc("Comma-separated types to stop when this plays")
				.addText(text => text
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder("music")
					.onChange(value => { this.stops = value; }));

			new Setting(details)
				.setName("Pauses")
				.setDesc("Comma-separated types to pause when this plays")
				.addText(text => text
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder("ambience")
					.onChange(value => { this.pauses = value; }));

			new Setting(details)
				.setName("Starts")
				.setDesc("Comma-separated types to resume when this plays")
				.addText(text => text
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder("ambience")
					.onChange(value => { this.starts = value; }));
		});

		// Insert button
		const btnContainer = contentEl.createDiv({ cls: "rpg-audio-insert-btn-row" });
		this.insertBtn = btnContainer.createEl("button", {
			text: "Insert track",
			cls: "mod-cta",
		});
		this.insertBtn.disabled = true;
		this.insertBtn.addEventListener("click", () => this.doInsert());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private updateIdDisplay(): void {
		if (!this.idSetting) return;
		const input = this.idSetting.controlEl.querySelector("input");
		if (input) input.value = this.id;
	}

	private updateInsertBtn(): void {
		if (!this.insertBtn) return;
		this.insertBtn.disabled = !this.name.trim() || !this.id.trim() || !this.type.trim() || this.selectedFiles.length === 0;
	}

	private showCustomType(visible: boolean): void {
		if (this.customTypeEl) {
			this.customTypeEl.toggleClass("is-hidden", !visible);
		}
	}

	private getAudioFiles(): TFile[] {
		return this.app.vault.getFiles().filter(f => {
			if (!AUDIO_EXTENSIONS.includes(f.extension.toLowerCase())) return false;
			return true;
		});
	}

	private openFilePicker(): void {
		const files = this.getAudioFiles();
		new AudioFileSuggestModal(this.app, files, (file) => {
			// Store path relative to audio folder if possible
			let path = file.path;
			if (this.audioFolder && path.startsWith(this.audioFolder + "/")) {
				path = path.slice(this.audioFolder.length + 1);
			}
			if (!this.selectedFiles.includes(path)) {
				this.selectedFiles.push(path);
				this.renderFileList();
				this.updateInsertBtn();
			}
		}).open();
	}

	private renderFileList(): void {
		if (!this.fileListEl) return;
		this.fileListEl.empty();

		for (const filePath of this.selectedFiles) {
			const chip = this.fileListEl.createDiv({ cls: "rpg-audio-file-chip" });
			chip.createSpan({ text: filePath, cls: "rpg-audio-file-chip-name" });
			const removeBtn = chip.createEl("button", {
				cls: "rpg-audio-file-chip-remove clickable-icon",
				attr: { "aria-label": "Remove" },
			});
			removeBtn.textContent = "×";
			removeBtn.addEventListener("click", () => {
				this.selectedFiles = this.selectedFiles.filter(f => f !== filePath);
				this.renderFileList();
				this.updateInsertBtn();
			});
		}
	}

	private doInsert(): void {
		const block = generateCodeBlock({
			id: this.id,
			name: this.name,
			type: this.type,
			files: this.selectedFiles,
			loop: this.loop,
			random: this.random,
			stops: this.stops,
			pauses: this.pauses,
			starts: this.starts,
		});
		this.onInsert(block);
		this.close();
	}
}
