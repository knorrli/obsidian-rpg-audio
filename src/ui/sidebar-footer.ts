import {setIcon} from "obsidian";
import type RpgAudioPlugin from "../main";

/** Active scope readout (debug only), version, debug toggle and a settings shortcut. */
export class SidebarFooter {
	private plugin: RpgAudioPlugin;
	private activeScopeEl: HTMLElement;
	private debugToggleBtn: HTMLElement;

	constructor(container: HTMLElement, plugin: RpgAudioPlugin, onDebugToggled: () => void) {
		this.plugin = plugin;
		const footer = container.createDiv({cls: "rpg-audio-sidebar-footer"});

		this.activeScopeEl = footer.createDiv({cls: "rpg-audio-sidebar-active-scope"});
		this.updateActiveScope();

		const controls = footer.createDiv({cls: "rpg-audio-sidebar-footer-controls"});
		controls.createSpan({
			cls: "rpg-audio-sidebar-version",
			text: `v${plugin.manifest.version}`,
		});

		this.debugToggleBtn = controls.createEl("button", {cls: "rpg-audio-btn clickable-icon"});
		this.debugToggleBtn.addEventListener("click", () => void this.toggleDebug(onDebugToggled));
		this.updateDebugBtn();

		const settingsBtn = controls.createEl("button", {cls: "rpg-audio-btn clickable-icon"});
		setIcon(settingsBtn, "settings");
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		settingsBtn.setAttribute("aria-label", "Open RPG Audio settings");
		settingsBtn.addEventListener("click", () => this.openSettings());
	}

	updateActiveScope(): void {
		const on = this.plugin.settings.showDebugInfo;
		this.activeScopeEl.empty();
		if (!on) {
			this.activeScopeEl.addClass("is-hidden");
			return;
		}
		this.activeScopeEl.removeClass("is-hidden");
		const scope = this.plugin.audioManager.activeScope;
		const label = scope.length === 0 ? "(none)" : `{${scope.join(", ")}}`;
		this.activeScopeEl.createSpan({cls: "rpg-audio-debug-label", text: "Active scope: "});
		this.activeScopeEl.createSpan({text: label});
	}

	private updateDebugBtn(): void {
		const on = this.plugin.settings.showDebugInfo;
		setIcon(this.debugToggleBtn, on ? "bug" : "bug-off");
		this.debugToggleBtn.setAttribute("aria-label", on ? "Debug info on (click to disable)" : "Debug info off (click to enable)");
		this.debugToggleBtn.toggleClass("is-active", on);
	}

	private async toggleDebug(onDebugToggled: () => void): Promise<void> {
		this.plugin.settings.showDebugInfo = !this.plugin.settings.showDebugInfo;
		await this.plugin.saveSettings();
		this.updateDebugBtn();
		this.updateActiveScope();
		onDebugToggled();
	}

	private openSettings(): void {
		const setting = (this.plugin.app as unknown as { setting: { open: () => void; openTabById: (id: string) => void } }).setting;
		setting.open();
		setting.openTabById(this.plugin.manifest.id);
	}
}
