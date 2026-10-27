export function isAtOrUnder(path: string, dir: string): boolean {
	return path === dir || path.startsWith(`${dir}/`);
}

/** Where `path` ends up after `oldPath` (a note or a folder) is renamed to `newPath`, or null if it isn't affected. */
export function movedPath(path: string, oldPath: string, newPath: string): string | null {
	return isAtOrUnder(path, oldPath) ? newPath + path.slice(oldPath.length) : null;
}
