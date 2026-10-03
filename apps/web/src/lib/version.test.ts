// Part 2, K.6.1 and K.8.4 of the request for 2.0.0: the version of the page is the one of the
// root package.json, and a page writes only to a server of its own major version.

import { describe, expect, it } from "vitest";
import root from "../../../../package.json";
import { APP_VERSION, versionMatchOf } from "./version.ts";

describe("the version of the page", () => {
	it("is the version of the root package.json", () => {
		expect(APP_VERSION).toBe(root.version);
	});

	it("writes to a server of the same major version, whatever the rest says", () => {
		expect(versionMatchOf("2.0.0", "2.1.0")).toBe("same");
		expect(versionMatchOf("2.0.3", "v2.0.0")).toBe("same");
	});

	it("takes a server that does not say its version for a 1.x", () => {
		expect(versionMatchOf("2.0.0", "1.2.1")).toBe("serverOlder");
		expect(versionMatchOf("2.0.0", undefined)).toBe("serverOlder");
		expect(versionMatchOf("2.0.0", null)).toBe("serverOlder");
		expect(versionMatchOf("2.0.0", "3.0.0")).toBe("pageOlder");
	});
});
