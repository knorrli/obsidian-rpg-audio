export function isAtOrUnder(path: string, dir: string): boolean {
	return path === dir || path.startsWith(`${dir}/`);
}

/** Where `path` ends up after `oldPath` (a note or a folder) is renamed to `newPath`, or null if it isn't affected. */
export function movedPath(path: string, oldPath: string, newPath: string): string | null {
	return isAtOrUnder(path, oldPath) ? newPath + path.slice(oldPath.length) : null;
}

/** Folder containing `notePath`, relative to `root`; "" for a note directly in `root`. */
export function folderWithin(notePath: string, root: string): string {
	const parent = notePath.slice(0, Math.max(0, notePath.lastIndexOf("/")));
	return parent === root ? "" : parent.slice(root.length + 1);
}

export function baseName(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}
