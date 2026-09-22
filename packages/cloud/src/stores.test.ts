// Every destination, against a service that answers the way the real one does.
//
// What is checked here is the part this project owns: the requests it builds, what it
// makes of the answers, and above all that "somebody wrote this file first" arrives as
// a conflict the engine can recover from rather than as a lost write.

import { BUNDLE_FORMAT, type SyncBundle } from "@cofre/storage";
import { describe, expect, it } from "vitest";
import { createFileStore } from "./file.ts";
import { mirrorToSheet } from "./googleSheets.ts";
import { CloudError } from "./http.ts";
import { isPacked, packBundle, unpackBundle } from "./pack.ts";
import { createWebdavStore } from "./webdav.ts";

const bundle: SyncBundle = {
	format: BUNDLE_FORMAT,
	version: 1,
	spaceId: "espaco1",
	changes: [],
	people: [],
	writtenAt: 1,
};

/** The bundle as it travels: packed, because that is what every store writes. */
const packed = () => packBundle(bundle);

type Call = {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string;
	/** What was sent when it was not text, which is every file this package writes. */
	sent: Uint8Array | null;
};

/** A service that records what it was asked and answers what it is told to. */
function fakeService(
	answers: (call: Call) => {
		status?: number;
		body?: string;
		bytes?: Uint8Array;
		headers?: Record<string, string>;
	},
) {
	const calls: Call[] = [];

	const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
		const headers: Record<string, string> = {};
		for (const [name, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
			headers[name.toLowerCase()] = value;
		}
		const call: Call = {
			url: String(url),
			method: init?.method ?? "GET",
			headers,
			body: typeof init?.body === "string" ? init.body : "",
			sent: init?.body instanceof Uint8Array ? init.body : null,
		};
		calls.push(call);

		const answer = answers(call);
		return new Response((answer.bytes ?? answer.body ?? "") as BodyInit, {
			status: answer.status ?? 200,
			headers: answer.headers,
		});
	}) as typeof globalThis.fetch;

	return { fetcher, calls };
}

describe("a folder over WebDAV", () => {
	it("reads the file and the version it was given", async () => {
		const service = fakeService(() => ({
			bytes: packed(),
			headers: { ETag: '"v1"' },
		}));

		const store = createWebdavStore({
			url: "https://nuvem.exemplo.com/cofre/",
			user: "ana",
			password: "segredo",
			fetcher: service.fetcher,
		});

		const read = await store.read("espaco1");
		expect(read.bundle?.spaceId).toBe("espaco1");
		expect(read.revision).toBe('"v1"');

		expect(service.calls[0]?.url).toBe("https://nuvem.exemplo.com/cofre/cofre_espaco1.json.gz");
		expect(service.calls[0]?.headers.authorization).toBe(`Basic ${btoa("ana:segredo")}`);
	});

	it("takes a file that is not there yet for what it is", async () => {
		const service = fakeService(() => ({ status: 404 }));
		const store = createWebdavStore({
			url: "https://nuvem.exemplo.com/cofre",
			user: "ana",
			password: "segredo",
			fetcher: service.fetcher,
		});

		expect(await store.read("espaco1")).toEqual({ bundle: null, revision: null });
	});

	it("only writes over the version it read", async () => {
		const service = fakeService(() => ({ status: 201, headers: { ETag: '"v2"' } }));
		const store = createWebdavStore({
			url: "https://nuvem.exemplo.com/cofre",
			user: "ana",
			password: "segredo",
			fetcher: service.fetcher,
		});

		await store.write("espaco1", bundle, '"v1"');
		expect(service.calls[0]?.headers["if-match"]).toBe('"v1"');

		await store.write("espaco1", bundle, null);
		expect(service.calls[1]?.headers["if-none-match"]).toBe("*");
	});

	it("says a conflict is a conflict", async () => {
		const service = fakeService(() => ({ status: 412 }));
		const store = createWebdavStore({
			url: "https://nuvem.exemplo.com/cofre",
			user: "ana",
			password: "segredo",
			fetcher: service.fetcher,
		});

		await expect(store.write("espaco1", bundle, '"old"')).rejects.toThrow(
			/changed while this device/,
		);
	});

	it("passes on what went wrong when it is something else", async () => {
		const service = fakeService(() => ({ status: 401, body: "no" }));
		const store = createWebdavStore({
			url: "https://nuvem.exemplo.com/cofre",
			user: "ana",
			password: "errado",
			fetcher: service.fetcher,
		});

		await expect(store.read("espaco1")).rejects.toBeInstanceOf(CloudError);
	});
});

describe("packing the file", () => {
	const wordy: SyncBundle = {
		...bundle,
		changes: Array.from({ length: 200 }, (_unused, index) => ({
			id: `0199${String(index).padStart(28, "0")}`,
			spaceId: "espaco1",
			entity: "transactions",
			entityId: `0199${String(index).padStart(28, "1")}`,
			operation: "insert" as const,
			payload: {
				kind: "expense",
				status: "settled",
				amount: -4290,
				currency: "BRL",
				happened_on: "2026-09-10",
				description: "Mercado do bairro",
				account_id: "0199aaaa",
				created_by: "0199bbbb",
			},
			hlc: `000000000${index}`,
			deviceId: "aparelho",
			actorId: "0199bbbb",
			createdAt: 1,
		})),
	};

	it("makes a log a fraction of the size it was", () => {
		const plain = new TextEncoder().encode(JSON.stringify(wordy)).length;
		const small = packBundle(wordy).length;

		// A log is the same twenty words over and over, so it packs hard. The check is
		// deliberately loose: what matters is that it is a fraction, not which one.
		expect(small).toBeLessThan(plain / 4);
		expect(unpackBundle(packBundle(wordy))?.changes).toHaveLength(200);
	});

	it("writes the file packed", async () => {
		const service = fakeService(() => ({ status: 201 }));
		const store = createWebdavStore({
			url: "https://nuvem.exemplo.com/cofre",
			user: "ana",
			password: "segredo",
			fetcher: service.fetcher,
		});

		await store.write("espaco1", wordy, null);
		const sent = service.calls[0]?.sent;

		expect(sent).not.toBeNull();
		expect(isPacked(sent ?? new Uint8Array())).toBe(true);
		expect(unpackBundle(sent ?? new Uint8Array())?.changes).toHaveLength(200);
	});

	it("still reads a file that was written before any of this", async () => {
		const plain = new TextEncoder().encode(JSON.stringify(bundle));
		expect(unpackBundle(plain)?.spaceId).toBe("espaco1");
		expect(unpackBundle(new TextEncoder().encode("nao e um arquivo"))).toBe(null);
		expect(unpackBundle(new Uint8Array())).toBe(null);
	});
});

describe("a service that does not answer at all", () => {
	it("is a failure with a name and a place, not the words a browser uses", async () => {
		// What a browser throws when there is no connection, no such host, or a
		// certificate it refuses. All of them arrive here as one thing.
		const offline = (() => Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch;

		const store = createWebdavStore({
			url: "https://nuvem.exemplo.com/cofre",
			user: "ana",
			password: "segredo",
			fetcher: offline,
			name: "WebDAV",
		});
		const failed = await store.read("espaco1").catch((error: unknown) => error);

		expect(failed).toBeInstanceOf(CloudError);
		expect((failed as CloudError).status).toBe(0);
		expect((failed as CloudError).where).toBe("WebDAV");
		expect((failed as CloudError).message).toBe("WebDAV did not answer");
	});
});

describe("a file the person moves themselves", () => {
	it("reads what they gave it and hands back what came out", async () => {
		let handed: SyncBundle | null = null;

		const store = createFileStore({
			read: async () => ({ bundle, revision: null }),
			write: (written) => {
				handed = written;
			},
		});

		expect((await store.read("espaco1")).bundle?.spaceId).toBe("espaco1");
		await store.write("espaco1", bundle, null);
		expect(handed).toEqual(bundle);
	});
});

describe("a spreadsheet that keeps up", () => {
	it("makes one the first time and says where it is", async () => {
		const service = fakeService((call) =>
			call.method === "POST"
				? { body: JSON.stringify({ spreadsheetId: "sheet1" }) }
				: { body: "{}" },
		);

		const result = await mirrorToSheet(
			{ token: "t", fetcher: service.fetcher },
			["Data"],
			[["2026-09-10"]],
		);

		expect(result.spreadsheetId).toBe("sheet1");
		expect(result.url).toBe("https://docs.google.com/spreadsheets/d/sheet1");
		expect(result.rows).toBe(1);
	});

	it("empties the tab before writing, so nothing is counted twice", async () => {
		const service = fakeService(() => ({ body: "{}" }));

		await mirrorToSheet(
			{ token: "t", spreadsheetId: "sheet1", fetcher: service.fetcher },
			["Data"],
			[["2026-09-10"]],
		);

		expect(service.calls[0]?.url).toContain(":clear");
		expect(service.calls[1]?.url).toContain("valueInputOption=USER_ENTERED");
		expect(JSON.parse(service.calls[1]?.body ?? "{}").values).toEqual([["Data"], ["2026-09-10"]]);
	});
});
