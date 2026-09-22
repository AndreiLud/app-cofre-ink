// Every destination, against a service that answers the way the real one does.
//
// What is checked here is the part this project owns: the requests it builds, what it
// makes of the answers, and above all that "somebody wrote this file first" arrives as
// a conflict the engine can recover from rather than as a lost write.

import { BUNDLE_FORMAT, type SyncBundle } from "@cofre/storage";
import { describe, expect, it } from "vitest";
import { createDropboxStore } from "./dropbox.ts";
import { createFileStore } from "./file.ts";
import { createGoogleDriveStore } from "./googleDrive.ts";
import { mirrorToSheet } from "./googleSheets.ts";
import { CloudError } from "./http.ts";
import { challengeOf, finishOAuth, startOAuth } from "./oauth.ts";
import { createWebdavStore } from "./webdav.ts";

const bundle: SyncBundle = {
	format: BUNDLE_FORMAT,
	version: 1,
	spaceId: "espaco1",
	changes: [],
	people: [],
	writtenAt: 1,
};

type Call = { url: string; method: string; headers: Record<string, string>; body: string };

/** A service that records what it was asked and answers what it is told to. */
function fakeService(
	answers: (call: Call) => { status?: number; body?: string; headers?: Record<string, string> },
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
		};
		calls.push(call);

		const answer = answers(call);
		return new Response(answer.body ?? "", {
			status: answer.status ?? 200,
			headers: answer.headers,
		});
	}) as typeof globalThis.fetch;

	return { fetcher, calls };
}

describe("a folder over WebDAV", () => {
	it("reads the file and the version it was given", async () => {
		const service = fakeService(() => ({
			body: JSON.stringify(bundle),
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

		expect(service.calls[0]?.url).toBe("https://nuvem.exemplo.com/cofre/cofre_espaco1.json");
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

describe("a folder in Dropbox", () => {
	it("reads the file and the revision beside it", async () => {
		const service = fakeService(() => ({
			body: JSON.stringify(bundle),
			headers: { "Dropbox-API-Result": JSON.stringify({ rev: "abc" }) },
		}));

		const store = createDropboxStore({ token: "t", fetcher: service.fetcher });
		const read = await store.read("espaco1");

		expect(read.bundle?.spaceId).toBe("espaco1");
		expect(read.revision).toBe("abc");
		expect(JSON.parse(service.calls[0]?.headers["dropbox-api-arg"] ?? "{}")).toEqual({
			path: "/cofre_espaco1.json",
		});
	});

	it("writes as an update of the revision it read", async () => {
		const service = fakeService(() => ({ body: JSON.stringify({ rev: "def" }) }));
		const store = createDropboxStore({ token: "t", folder: "/Cofre", fetcher: service.fetcher });

		const written = await store.write("espaco1", bundle, "abc");
		expect(written.revision).toBe("def");

		const argument = JSON.parse(service.calls[0]?.headers["dropbox-api-arg"] ?? "{}");
		expect(argument.path).toBe("/Cofre/cofre_espaco1.json");
		expect(argument.mode).toEqual({ ".tag": "update", update: "abc" });
	});

	it("turns the answer for a file that moved into a conflict", async () => {
		const service = fakeService(() => ({ status: 409, body: "{}" }));
		const store = createDropboxStore({ token: "t", fetcher: service.fetcher });

		await expect(store.write("espaco1", bundle, "abc")).rejects.toThrow(
			/changed while this device/,
		);
	});
});

describe("a folder in Google Drive", () => {
	it("looks in the corner that belongs to this application", async () => {
		const service = fakeService((call) =>
			call.url.includes("alt=media")
				? { body: JSON.stringify(bundle) }
				: { body: JSON.stringify({ files: [{ id: "1", name: "x", modifiedTime: "2026-09-22" }] }) },
		);

		const store = createGoogleDriveStore({ token: "t", fetcher: service.fetcher });
		const read = await store.read("espaco1");

		expect(read.bundle?.spaceId).toBe("espaco1");
		expect(read.revision).toBe("2026-09-22");
		expect(service.calls[0]?.url).toContain("spaces=appDataFolder");
		expect(service.calls[0]?.url).toContain("cofre_espaco1.json");
	});

	it("creates the file the first time, in two parts", async () => {
		const service = fakeService((call) =>
			call.url.includes("uploadType=multipart")
				? { body: JSON.stringify({ id: "1", modifiedTime: "2026-09-22" }) }
				: { body: JSON.stringify({ files: [] }) },
		);

		const store = createGoogleDriveStore({ token: "t", fetcher: service.fetcher });
		const written = await store.write("espaco1", bundle, null);

		expect(written.revision).toBe("2026-09-22");
		expect(service.calls[1]?.body).toContain("cofre_espaco1.json");
		expect(service.calls[1]?.body).toContain("appDataFolder");
	});

	it("refuses to write when the file moved since it was read", async () => {
		const service = fakeService(() => ({
			body: JSON.stringify({ files: [{ id: "1", name: "x", modifiedTime: "muito depois" }] }),
		}));

		const store = createGoogleDriveStore({ token: "t", fetcher: service.fetcher });
		await expect(store.write("espaco1", bundle, "2026-09-22")).rejects.toThrow(
			/changed while this device/,
		);
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

describe("getting a token without a secret", () => {
	it("sends the hash and keeps the number", async () => {
		const setup = {
			service: "dropbox" as const,
			clientId: "abc",
			redirectUri: "http://localhost:5173/dados",
		};
		const started = await startOAuth(setup);
		const query = new URL(started.url).searchParams;

		expect(started.url.startsWith("https://www.dropbox.com/oauth2/authorize")).toBe(true);
		expect(query.get("code_challenge_method")).toBe("S256");
		expect(query.get("code_challenge")).toBe(await challengeOf(started.verifier));
		// The number itself is never in the address.
		expect(started.url).not.toContain(started.verifier);
	});

	it("turns the code into a token, and says so when it cannot", async () => {
		const good = fakeService(() => ({
			body: JSON.stringify({ access_token: "t", expires_in: 3600 }),
		}));
		const setup = {
			service: "googleDrive" as const,
			clientId: "abc",
			redirectUri: "http://localhost:5173/dados",
		};

		const token = await finishOAuth(setup, { code: "c", verifier: "v" }, good.fetcher);
		expect(token.token).toBe("t");
		expect(token.expiresAt).toBeGreaterThan(Date.now());

		const bad = fakeService(() => ({
			status: 400,
			body: JSON.stringify({ error: "invalid_grant", error_description: "codigo usado" }),
		}));
		await expect(finishOAuth(setup, { code: "c", verifier: "v" }, bad.fetcher)).rejects.toThrow(
			"codigo usado",
		);
	});
});
