// Part 2, K.8.4 of the request for 2.0.0: `latest` names the highest version and nothing else,
// so a correction to the old line published after the new one does not take anybody back.

import { describe, expect, it } from "vitest";
import { isHighest, versionOf } from "../../../scripts/isHighestTag.mjs";

describe("which tag latest may name", () => {
	it("is never a correction to the old line published after the new one", () => {
		expect(isHighest("v1.2.2", ["v1.2.1", "v2.0.0", "v1.2.2"])).toBe(false);
		expect(isHighest("v2.0.0", ["v1.2.1", "v2.0.0", "v1.2.2"])).toBe(true);
	});

	it("counts only plain versions", () => {
		expect(isHighest("v2.0.1", ["v2.0.0", "nightly", "v2.1.0-rc.1"])).toBe(true);
		expect(isHighest("nightly", ["v1.0.0"])).toBe(false);
		expect(versionOf("v2.0.0+build.7")).toEqual([2, 0, 0]);
		expect(versionOf("v2.1.0-rc.1")).toBeNull();
	});
});
