// The database destination, against a libSQL that keeps what it was given.
//
// The fake here is not a recording of one exchange: it is a tiny store that actually
// holds the rows, because the thing worth proving is what two devices do to each other
// over time. A file destination has to be told which version it read; this one has to
// come out right whatever order the two of them arrive in, and that only shows when the
// other side remembers.

import type { Change, Person, SyncBundle } from "@cofre/storage";
import { BUNDLE_FORMAT } from "@cofre/storage";
import { describe, expect, it } from "vitest";
import { createLibsqlStore } from "./libsql.ts";

type Value = { type: string; value?: string | number };

function change(id: string, hlc: string, description: string): Change {
	return {
		id,
		spaceId: "espaco1",
		entity: "transactions",
		entityId: `linha${id}`,
		operation: "insert",
		payload: { description },
		hlc,
		deviceId: `aparelho${id}`,
		actorId: "ana",
		createdAt: 1_700_000_000_000,
	};
}

function person(id: string, name: string, updatedAt: number): Person {
	return { id, email: `${id}@exemplo.com`, name, image: null, createdAt: 1, updatedAt };
}

function bundleOf(changes: Change[], people: Person[] = []): SyncBundle {
	return {
		format: BUNDLE_FORMAT,
		version: 1,
		spaceId: "espaco1",
		changes,
		people,
		writtenAt: 1,
	};
}

/**
 * A libSQL that keeps rows. It understands only the handful of statements this store
 * sends, which is the point: if the store starts sending something else, this stops
 * understanding it and the test says so.
 */
function fakeLibsql() {
	const changes = new Map<string, Record<string, unknown>>();
	const people = new Map<string, Record<string, unknown>>();
	let calls = 0;
	let statements = 0;

	function plain(value: Value | undefined): string | number | null {
		if (!value || value.type === "null") return null;
		return value.type === "integer" ? Number(value.value) : (value.value ?? null);
	}

	function cell(value: unknown): Value {
		if (value === null || value === undefined) return { type: "null" };
		if (typeof value === "number") return { type: "integer", value: String(value) };
		return { type: "text", value: String(value) };
	}

	const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
		calls += 1;
		const sent = JSON.parse(String(init?.body ?? "{}")) as {
			requests: { type: string; stmt?: { sql: string; args: Value[] } }[];
		};

		const results = sent.requests.map((request) => {
			if (request.type !== "execute" || !request.stmt) return { type: "ok" };
			statements += 1;

			const sql = request.stmt.sql.replace(/\s+/g, " ").trim();
			const args = request.stmt.args;

			if (sql.startsWith("CREATE")) return { type: "ok" };

			if (sql.startsWith("INSERT OR IGNORE INTO")) {
				const id = String(plain(args[0]));
				if (!changes.has(id)) {
					changes.set(id, {
						id,
						space_id: plain(args[1]),
						entity: plain(args[2]),
						entity_id: plain(args[3]),
						operation: plain(args[4]),
						payload: plain(args[5]),
						hlc: plain(args[6]),
						device_id: plain(args[7]),
						actor_id: plain(args[8]),
						created_at: plain(args[9]),
					});
				}
				return { type: "ok" };
			}

			if (sql.startsWith("INSERT INTO")) {
				const id = String(plain(args[0]));
				const updatedAt = Number(plain(args[5]));
				const before = people.get(id);
				if (!before || Number(before.updated_at) <= updatedAt) {
					people.set(id, {
						id,
						email: plain(args[1]),
						name: plain(args[2]),
						image: plain(args[3]),
						created_at: plain(args[4]),
						updated_at: updatedAt,
					});
				}
				return { type: "ok" };
			}

			const from = sql.includes("cofre_people") ? people : changes;
			const columns =
				from === people
					? ["id", "email", "name", "image", "created_at", "updated_at"]
					: [
							"id",
							"space_id",
							"entity",
							"entity_id",
							"operation",
							"payload",
							"hlc",
							"device_id",
							"actor_id",
							"created_at",
						];

			const rows = [...from.values()]
				.filter((row) => from === people || row.space_id === plain(args[0]))
				.sort((left, right) => String(left.hlc ?? "").localeCompare(String(right.hlc ?? "")))
				.map((row) => columns.map((name) => cell(row[name])));

			return {
				type: "ok",
				response: { result: { cols: columns.map((name) => ({ name })), rows } },
			};
		});

		return new Response(JSON.stringify({ results }), { status: 200 });
	}) as typeof globalThis.fetch;

	return {
		fetcher,
		changes,
		people,
		get calls() {
			return calls;
		},
		get statements() {
			return statements;
		},
	};
}

describe("a space kept in a database", () => {
	it("writes the log as rows and reads it back as a bundle", async () => {
		const service = fakeLibsql();
		const store = createLibsqlStore({
			url: "https://cofre-ana.turso.io/",
			token: "segredo",
			fetcher: service.fetcher,
		});

		expect(await store.read("espaco1")).toEqual({ bundle: null, revision: null });

		await store.write("espaco1", bundleOf([change("1", "a", "Mercado")]), null);
		expect(service.changes.size).toBe(1);

		const back = await store.read("espaco1");
		expect(back.bundle?.changes).toHaveLength(1);
		expect(back.bundle?.changes[0]?.payload).toEqual({ description: "Mercado" });
		expect(back.bundle?.changes[0]?.actorId).toBe("ana");
		expect(back.bundle?.changes[0]?.createdAt).toBe(1_700_000_000_000);
	});

	it("takes two devices in either order and loses nothing", async () => {
		const service = fakeLibsql();
		const options = { url: "https://cofre-ana.turso.io", token: "segredo" };
		const one = createLibsqlStore({ ...options, fetcher: service.fetcher });
		const two = createLibsqlStore({ ...options, fetcher: service.fetcher });

		// Both read an empty database, both write, neither knowing about the other.
		await one.read("espaco1");
		await two.read("espaco1");
		await one.write("espaco1", bundleOf([change("1", "a", "Mercado")]), null);
		await two.write("espaco1", bundleOf([change("2", "b", "Aluguel")]), null);

		// A file destination would have lost one of those two. A log cannot.
		const back = await one.read("espaco1");
		expect(back.bundle?.changes.map((one) => one.payload.description)).toEqual([
			"Mercado",
			"Aluguel",
		]);
	});

	it("sends only what the other side does not have yet", async () => {
		const service = fakeLibsql();
		const store = createLibsqlStore({
			url: "https://cofre-ana.turso.io",
			token: "segredo",
			fetcher: service.fetcher,
		});

		const first = [change("1", "a", "Mercado"), change("2", "b", "Aluguel")];
		await store.read("espaco1");
		await store.write("espaco1", bundleOf(first), null);
		await store.read("espaco1");

		const before = service.statements;
		// The bundle carries the whole log every time, so writing it again has to cost
		// one new row and not the history of the space.
		await store.write("espaco1", bundleOf([...first, change("3", "c", "Luz")]), null);
		// The three statements that make the tables, and one row.
		expect(service.statements - before).toBe(3 + 1);
		expect(service.changes.size).toBe(3);
	});

	it("keeps the newest name of a person and not the first", async () => {
		const service = fakeLibsql();
		const store = createLibsqlStore({
			url: "https://cofre-ana.turso.io",
			token: "segredo",
			fetcher: service.fetcher,
		});

		await store.read("espaco1");
		await store.write("espaco1", bundleOf([], [person("ana", "Ana", 10)]), null);

		const other = createLibsqlStore({
			url: "https://cofre-ana.turso.io",
			token: "segredo",
			fetcher: service.fetcher,
		});
		await other.read("espaco1");
		await other.write("espaco1", bundleOf([], [person("ana", "Ana Maria", 20)]), null);

		expect(service.people.get("ana")?.name).toBe("Ana Maria");
	});

	it("carries the token and speaks to the pipeline of that database", async () => {
		const service = fakeLibsql();
		let seen: { url: string; authorization: string } | null = null;
		const watching = (async (url: string | URL | Request, init?: RequestInit) => {
			const headers = (init?.headers ?? {}) as Record<string, string>;
			seen = { url: String(url), authorization: headers.Authorization ?? "" };
			return service.fetcher(url, init);
		}) as typeof globalThis.fetch;

		const store = createLibsqlStore({
			url: "https://cofre-ana.turso.io/",
			token: "segredo",
			fetcher: watching,
		});
		await store.read("espaco1");

		expect(seen).toEqual({
			url: "https://cofre-ana.turso.io/v2/pipeline",
			authorization: "Bearer segredo",
		});
	});

	it("raises what the database refused instead of answering nothing", async () => {
		const angry = (async () =>
			new Response(
				JSON.stringify({ results: [{ type: "error", error: { message: "no such table" } }] }),
				{
					status: 200,
				},
			)) as typeof globalThis.fetch;

		const store = createLibsqlStore({
			url: "https://cofre-ana.turso.io",
			token: "segredo",
			fetcher: angry,
		});

		await expect(store.read("espaco1")).rejects.toThrow("no such table");
	});
});
