// Every call a screen makes about a record or an invoice is in the table, and its button asks
// about that call.
//
// Part 1, G.5 of the request for 2.0.0: settling several records, changing several, changing a
// plan from one part onwards, removing several, removing a plan, marking the invoices before one
// as paid, moving a purchase to another invoice and saying which day an invoice closed were not
// in the table the screens read, and each of their buttons was drawn behind the permission of
// another call. The two hold the same roles today, which is exactly why nothing could tell.

import { METHOD_PERMISSIONS } from "@cofre/storage";
import { describe, expect, it } from "vitest";

/** The text of every source file of the application, read by the bundler the tests run on. */
const SOURCES: Record<string, string> = import.meta.glob(
	["../**/*.ts", "../**/*.tsx", "!../**/*.test.ts"],
	{
		query: "?raw",
		import: "default",
		eager: true,
	},
);

/** The calls that only read, which no button is drawn behind. */
const READS = new Set([
	"transactions.list",
	"transactions.balances",
	"invoices.get",
	"invoices.list",
	"invoices.standing",
]);

/** The calls of G.5, each of which a button makes and has to be asked about by name. */
const ASKED_BY_NAME = [
	"transactions.settleMany",
	"transactions.updateMany",
	"transactions.updateFrom",
	"transactions.removeMany",
	"transactions.removeGroup",
	"invoices.markPaidUntil",
	"invoices.move",
	"invoices.closedOn",
];

function screens(): { file: string; text: string }[] {
	return Object.entries(SOURCES).map(([file, text]) => ({ file, text }));
}

function callsIn(text: string): string[] {
	return [...text.matchAll(/session\??\.(transactions|invoices)\.(\w+)\(/g)].map(
		(found) => `${found[1]}.${found[2]}`,
	);
}

describe("the calls the screens make", () => {
	it("names every call about a record or an invoice in the table", () => {
		// The screens were read, and the records screen is among them.
		expect(screens().some(({ file }) => file.endsWith("pages/TransactionsPage.tsx"))).toBe(true);
		const missing = new Set<string>();
		for (const { text } of screens()) {
			for (const call of callsIn(text)) {
				if (!READS.has(call) && !(call in METHOD_PERMISSIONS)) missing.add(call);
			}
		}
		expect([...missing].sort()).toEqual([]);
	});

	it("asks about each of these by its own name where it is made", () => {
		const unasked: string[] = [];
		for (const { file, text } of screens()) {
			for (const call of new Set(callsIn(text))) {
				if (!ASKED_BY_NAME.includes(call)) continue;
				if (!text.includes(`mayCall("${call}")`)) unasked.push(`${file}: ${call}`);
			}
		}
		expect(unasked.sort()).toEqual([]);
	});
});
