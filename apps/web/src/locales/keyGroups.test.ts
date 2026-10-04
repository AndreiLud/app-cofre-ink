// Every group a screen builds a key from exists, in both languages.
//
// A key written whole is checked by the translation script. A key built from a code, such as
// `budget.state.${state}`, is not, and the month on paper had two of those whose group never
// existed: every limit printed `budget.state.comfortable` in its state column, and every step
// of the plan printed `plan.buildReserve`, in the file somebody hands to another person.

import { PRODUCT_GROUPS, PRODUCTS } from "@cofre/core";
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

	// Found by the audit of 2.0.0: the invoice screen of somebody who sees only their own records
	// had the title `invoice.title`, a key no language holds, printed as it is. The translation
	// script asks whether every key of the files is used, not whether every key used is in them.
	it("hold every key a screen writes whole, in both languages", () => {
		// The first argument of every t(), read up to the comma or the bracket that ends it, so a key
		// chosen in a condition inside the call is read too; a quoted word in it shaped like a key
		// is a key. Names of calls, such as mayCall("accounts.remove"), are not in it.
		const keys = new Set<string>();
		for (const text of Object.values(SOURCES)) {
			for (const call of text.matchAll(/\bt\(/g)) {
				let depth = 0;
				let end = (call.index ?? 0) + call[0].length;
				for (; end < text.length; end += 1) {
					const char = text[end];
					if (char === "(" || char === "[" || char === "{") depth += 1;
					else if (char === ")" || char === "]" || char === "}") {
						if (depth === 0) break;
						depth -= 1;
					} else if (char === "," && depth === 0) break;
				}
				const first = text.slice((call.index ?? 0) + call[0].length, end);
				for (const found of first.matchAll(/"([a-zA-Z]+(?:\.[a-zA-Z0-9]+)+)"/g)) {
					keys.add(found[1] ?? "");
				}
			}
		}
		expect(keys.has("invoice.standingDue")).toBe(true);
		expect(keys.has("invoice.standingWasDue")).toBe(true);
		const resolves = (messages: unknown, path: string) => {
			const at = (key: string) => {
				let node: unknown = messages;
				for (const part of key.split(".")) {
					if (node === null || typeof node !== "object") return undefined;
					node = (node as Record<string, unknown>)[part];
				}
				return node;
			};
			const node = at(path);
			// A string, a group read whole, or a sentence said in the singular and the plural.
			return (
				(typeof node === "string" && node !== "") ||
				(node !== null && typeof node === "object") ||
				typeof at(`${path}_other`) === "string"
			);
		};
		const missing = [...keys].filter((key) => !resolves(pt, key) || !resolves(en, key));
		expect(missing.sort()).toEqual([]);
	});

	// Part 2, H.8.4 of 2.0.0: the translation script sees investments.products.* and
	// investments.fields.* only by their prefix, so a product of the catalog with no name, or a
	// field with no label, would pass it and print a key on the form.
	it("name every product of the catalog, its group and every field it asks for", () => {
		const wanted = [
			...PRODUCTS.map((product) => `investments.products.${product.id}`),
			...PRODUCT_GROUPS.map((group) => `investments.groups.${group}`),
			...PRODUCTS.flatMap((product) => product.fields).map(
				(field) => `investments.fields.${field}`,
			),
			...PRODUCTS.flatMap((product) => product.indexers).map(
				(indexer) => `investments.indexers.${indexer}`,
			),
		];
		const said = (messages: unknown, path: string) => {
			let node: unknown = messages;
			for (const part of path.split(".")) {
				if (node === null || typeof node !== "object") return false;
				node = (node as Record<string, unknown>)[part];
			}
			return typeof node === "string" && node !== "";
		};
		const missing = [...new Set(wanted)].filter((key) => !said(pt, key) || !said(en, key));
		expect(missing).toEqual([]);
	});
});
