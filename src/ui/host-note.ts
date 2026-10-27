import {App, MarkdownRenderChild, MarkdownView, TFile} from "obsidian";

/**
 * When a tab moves on to another note, reading view doesn't unload transcluded
 * blocks whose section is scrolled off the page at that moment, so the player
 * unloads itself once the view it was shown in no longer shows that note.
 */
export function unloadWhenHostNoteCloses(app: App, child: MarkdownRenderChild): void {
	let host: {view: MarkdownView; file: TFile} | null = null;
	// The block renders before its section is attached to the view.
	window.requestAnimationFrame(() => {
		host = findHost(app, child.containerEl);
	});
	child.registerEvent(app.workspace.on("file-open", () => {
		if (host && host.view.file !== host.file) child.unload();
	}));
}

function findHost(app: App, el: HTMLElement): {view: MarkdownView; file: TFile} | null {
	if (!el.isConnected) return null;
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		const view = leaf.view;
		if (view instanceof MarkdownView && view.file && view.containerEl.contains(el)) {
			return {view, file: view.file};
		}
	}
	return null;
}
