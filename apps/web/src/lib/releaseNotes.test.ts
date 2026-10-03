// Part 2, K.3.4 of the request for 2.0.0: the notes of a version become elements, and no link
// in them reaches the page.

import { describe, expect, it } from "vitest";
import { readNotes } from "./releaseNotes.ts";

describe("the notes of a version", () => {
	it("reads headings, items and paragraphs, and leaves every address out", () => {
		const notes = [
			"## Fixed",
			"",
			"* The **invoice** of a [card](https://evil.example/x) is paid on its day.",
			"1. A second item <https://evil.example/y>",
			"",
			"Read more at https://evil.example/z please.",
			"<script>alert(1)</script>",
		].join("\r\n");

		const blocks = readNotes(notes);
		expect(blocks).toEqual([
			{ kind: "heading", text: "Fixed" },
			{ kind: "list", items: ["The invoice of a card is paid on its day.", "A second item"] },
			{ kind: "paragraph", text: "Read more at please. alert(1)" },
		]);
		expect(JSON.stringify(blocks)).not.toContain("http");
		expect(JSON.stringify(blocks)).not.toContain("<");
	});
});
