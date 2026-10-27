import {AudioTrackState, PlayState} from "../types";

function matchesDirective(tokens: string[], otherId: string, otherType: string): boolean {
	let matched = false;
	for (const token of tokens) {
		if (token.startsWith("!")) {
			const negated = token.slice(1);
			if (negated === otherType || negated === otherId) return false;
		} else if (token === otherType || token === otherId) {
			matched = true;
		}
	}
	return matched;
}

function isScopeSubset(child: Iterable<string>, parent: Set<string>): boolean {
	for (const s of child) {
		if (!parent.has(s)) return false;
	}
	return true;
}

export function sameScope(a: Set<string>, b: Set<string>): boolean {
	return a.size === b.size && isScopeSubset(a, b);
}

/** Tracks in `playState` that a `stops`/`pauses`/`resumes` token list on `triggerId` applies to. */
export function directiveTargets(
	tracks: Map<string, AudioTrackState>,
	triggerId: string,
	tokens: string[],
	playState: PlayState,
): string[] {
	if (tokens.length === 0) return [];
	const targets: string[] = [];
	for (const [otherId, other] of tracks) {
		if (otherId !== triggerId && other.playState === playState && matchesDirective(tokens, otherId, other.def.type)) {
			targets.push(otherId);
		}
	}
	return targets;
}

/** Playing scoped tracks that fall outside `activeScope`. Unscoped tracks are never affected. */
export function scopeTransitionTargets(
	tracks: Map<string, AudioTrackState>,
	triggerId: string,
	activeScope: Set<string>,
): string[] {
	const targets: string[] = [];
	for (const [otherId, other] of tracks) {
		if (otherId === triggerId) continue;
		if (other.def.scope.length === 0) continue;
		if (other.playState !== PlayState.Playing) continue;
		if (isScopeSubset(other.def.scope, activeScope)) continue;
		targets.push(otherId);
	}
	return targets;
}
