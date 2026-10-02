// Where a copy goes, read back from what a browser is holding.
//
// This module has carried two corrections that nothing could have caught, both about a
// folder's address and its application password being filed under the database. The second
// of them, in 1.1.0, was found by reading rather than by a failure, which is a thin way to
// find a bug about where somebody's password is written down.

import { beforeEach, describe, expect, it } from "vitest";
import { readyToBackUp, storedDestination } from "./destinations.ts";

/** Enough of a browser store for a module that wraps every read and write in a try. */
function store(): void {
	const kept = new Map<string, string>();
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => kept.get(key) ?? null,
			setItem: (key: string, value: string) => {
				kept.set(key, value);
			},
			removeItem: (key: string) => {
				kept.delete(key);
			},
			clear: () => {
				kept.clear();
			},
		},
	});
}

beforeEach(() => {
	store();
});

describe("the destination a browser is holding", () => {
	it("reads a folder filed under the database back as a folder", () => {
		// What a browser that hit the 1.0.3 fault held afterwards, in the shape 1.0.4 wrote.
		// A database never has a user, so a filled user under the database is the one tell
		// there is that these are a folder's fields.
		localStorage.setItem(
			"cofreDestination",
			JSON.stringify({
				kind: "database",
				places: {
					database: {
						address: "https://nuvem.exemplo.com/dav",
						user: "ana",
						secret: "senha",
					},
				},
			}),
		);

		expect(storedDestination()).toEqual({
			kind: "webdav",
			address: "https://nuvem.exemplo.com/dav",
			user: "ana",
			secret: "senha",
		});
	});

	it("answers nothing for a browser that has never chosen one", () => {
		expect(storedDestination().kind).toBe(null);
	});
});

describe("whether a backup can be armed", () => {
	it("will not arm one at an address that is not an address", () => {
		// A line of text counted as filled in, so the run armed itself and every pass died
		// before it could say anything.
		expect(
			readyToBackUp({ kind: "webdav", address: "minha pasta", user: "ana", secret: "senha" }),
		).toBe(false);
		expect(
			readyToBackUp({
				kind: "webdav",
				address: "https://nuvem.exemplo.com/dav",
				user: "ana",
				secret: "senha",
			}),
		).toBe(true);
	});

	it("asks a database for a token and no user, and a folder for both", () => {
		expect(
			readyToBackUp({ kind: "database", address: "casa.turso.io", user: "", secret: "token" }),
		).toBe(true);
		expect(
			readyToBackUp({ kind: "database", address: "casa.turso.io", user: "", secret: "" }),
		).toBe(false);
		expect(
			readyToBackUp({
				kind: "webdav",
				address: "https://nuvem.exemplo.com/dav",
				user: " ",
				secret: "senha",
			}),
		).toBe(false);
	});

	it("arms nothing when no destination was chosen", () => {
		expect(readyToBackUp({ kind: null, address: "", user: "", secret: "" })).toBe(false);
	});
});
