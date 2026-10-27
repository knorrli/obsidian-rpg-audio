import {TrackAction, TrackCause, TrackCauseKind} from "../types";

export type CauseInput = {kind: TrackCauseKind; detail?: string};

export function buildCause(action: TrackAction, input: CauseInput | undefined): TrackCause {
	return {
		action,
		kind: input?.kind ?? "user",
		detail: input?.detail,
		at: Date.now(),
	};
}
