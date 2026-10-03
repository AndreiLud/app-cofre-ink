// Every group a screen builds a key from exists, in both languages.
//
// A key written whole is checked by the translation script. A key built from a code, such as
// `budget.state.${state}`, is not, and the month on paper had two of those whose group never
// existed: every limit printed `budget.state.comfortable` in its state column, and every step
// of the plan printed `plan.buildReserve`, in the file somebody hands to another person.

import { describe, expect, it } from "vitest";
import en from "./en.json";
import pt from "./pt.json";

/** The text of every source file of the application, read by the bundler the tests run on. */
const SOURCES: Record<string, string> = import.meta.glob(
	["../**/*.ts", "../**/*.tsx", "!../**/*.test.ts"],
	{ query: "?raw", import: "default", eager: true },
);

/** The group before the part that is filled in: `budget.state` of `budget.state.${state}`. */
function groupsIn(text: string): string[] {
	return [...text.matchAll(/\bt\(\s*`([a-zA-Z]+(?:\.[a-zA-Z]+)*)\.\$\{/g)].map(
		(found) => found[1] ?? "",
	);
}

function holdsGroup(messages: unknown, path: string): boolean {
	let node: unknown = messages;
	for (const part of path.split(".")) {
		if (node === null || typeof node !== "object") return false;
		node = (node as Record<string, unknown>)[part];
	}
	return node !== null && typeof node === "object";
}

describe("the keys a screen builds from a code", () => {
	it("come from a group that exists in both languages", () => {
		const groups = new Set<string>();
		for (const text of Object.values(SOURCES))
			for (const group of groupsIn(text)) groups.add(group);
		// The reading found the groups, the two of the month on paper among them.
		expect(groups.has("invoice.standing")).toBe(true);
		expect(groups.has("step.said")).toBe(true);

		const missing = [...groups].filter((group) => !holdsGroup(pt, group) || !holdsGroup(en, group));
		expect(missing.sort()).toEqual([]);
	});
});
