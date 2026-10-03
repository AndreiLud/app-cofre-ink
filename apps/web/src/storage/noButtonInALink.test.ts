// A link is one control, and a button inside it is a second one in the same place.
//
// Part 1, E.6.3 of the request for 2.0.0: a link wrapping a button appeared on six screens,
// two stops of the Tab key for one action, and a screen reader read both. A link that should
// look like a button wears the button's classes instead, which is what `buttonClasses` is for.

import { describe, expect, it } from "vitest";

const SOURCES: Record<string, string> = import.meta.glob(["../**/*.tsx"], {
	query: "?raw",
	import: "default",
	eager: true,
});

describe("the links of the screens", () => {
	it("never hold a button", () => {
		expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
		const nested: string[] = [];
		for (const [file, text] of Object.entries(SOURCES)) {
			for (const found of text.matchAll(
				/<(Link|a)\b[^<]*>\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<Button\b/g,
			)) {
				const line = text.slice(0, found.index).split("\n").length;
				nested.push(`${file}:${line}`);
			}
		}
		expect(nested).toEqual([]);
	});
});
