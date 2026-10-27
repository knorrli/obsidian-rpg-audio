import {describe, expect, it, vi} from "vitest";
import {TrackLifetime} from "../src/audio/track-lifetime";
import {trackState} from "./track-state";

function createLifetime() {
	const track = trackState({id: "rain"});
	const host = {
		getTrack: (id: string) => (id === "rain" ? track : undefined),
		unregister: vi.fn(),
		onEnteredView: vi.fn(),
		onLeftView: vi.fn(),
	};
	return {lifetime: new TrackLifetime(host), host};
}

describe("TrackLifetime.cleanupIfOrphaned", () => {
	it("keeps a stopped track while a player is loaded", () => {
		const {lifetime, host} = createLifetime();
		lifetime.attachPlayer("rain");

		lifetime.cleanupIfOrphaned("rain");

		expect(host.unregister).not.toHaveBeenCalled();
	});

	it("unregisters a stopped track without players", () => {
		const {lifetime, host} = createLifetime();

		lifetime.cleanupIfOrphaned("rain");

		expect(host.unregister).toHaveBeenCalledWith("rain");
	});

	it("keeps a stopped track retained by the library or a pin", () => {
		const {lifetime, host} = createLifetime();
		lifetime.setRetained(new Set(["rain"]));

		lifetime.cleanupIfOrphaned("rain");

		expect(host.unregister).not.toHaveBeenCalled();
	});
});
