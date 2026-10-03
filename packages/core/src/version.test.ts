// Part 2, K.3.1 of the request for 2.0.0: versions read and compared without a network.

import { describe, expect, it } from "vitest";
import {
	compareVersions,
	crossesMajor,
	parseVersion,
	versionState,
	versionText,
} from "./version.ts";

const v = (text: string) => {
	const found = parseVersion(text);
	if (!found) throw new Error(`not a version: ${text}`);
	return found;
};

describe("a version", () => {
	it("reads with or without the v, and without a build suffix", () => {
		expect(parseVersion("v2.0.0")).toEqual({ major: 2, minor: 0, patch: 0 });
		expect(parseVersion("2.0.0")).toEqual({ major: 2, minor: 0, patch: 0 });
		expect(parseVersion("2.1.3+ab12")).toEqual({ major: 2, minor: 1, patch: 3 });
	});

	it("is nothing when it is a preview or not a version at all", () => {
		expect(parseVersion("v2.1.0-rc.1")).toBeNull();
		expect(parseVersion("nightly")).toBeNull();
		expect(parseVersion("2.0")).toBeNull();
	});

	it("compares by number, so 1.10.0 comes after 1.9.9", () => {
		expect(compareVersions(v("1.10.0"), v("1.9.9"))).toBeGreaterThan(0);
		expect(compareVersions(v("2.0.0"), v("2.0.0"))).toBe(0);
		expect(compareVersions(v("2.0.1"), v("2.1.0"))).toBeLessThan(0);
	});

	it("says where a copy stands against the latest published", () => {
		expect(versionState(v("2.0.0"), v("2.1.0"))).toBe("behind");
		expect(versionState(v("2.1.0"), v("2.1.0"))).toBe("current");
		expect(versionState(v("2.2.0"), v("2.1.0"))).toBe("ahead");
	});

	it("knows when the major version changes", () => {
		expect(crossesMajor(v("1.2.1"), v("2.0.0"))).toBe(true);
		expect(crossesMajor(v("2.0.0"), v("2.9.4"))).toBe(false);
		expect(versionText(v("2.0.0"))).toBe("v2.0.0");
	});
});
