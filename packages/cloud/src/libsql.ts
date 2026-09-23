// A database, rather than a folder with a file in it.
//
// Every other destination in this package keeps a space as one file: read the whole
// thing, merge, write the whole thing back, and hope nobody wrote it in between. That
// is what a drive can do, and it is why each of them has to say something about two
// devices saving at once.
//
// This one keeps the change log as rows. Two devices appending rows to a log cannot
// lose each other's writes, whatever order they arrive in, because a log entry is
// already immutable and already carries the stamp that orders it. So there is no
// version to compare, no file to overwrite and nothing to be unlucky about.
//
// It speaks the libSQL HTTP protocol, which is SQLite over a POST. Turso answers it,
// and so does a `sqld` somebody runs on their own machine: the same destination, the
// same code, and the choice of who holds the data stays with the owner, which is the
// whole point of this project. The endpoint answers browsers directly, so nothing here
// needs a server of ours in between.

import type { Change, Person, StoredBundle, SyncBundle, SyncStore } from "@cofre/storage";
import { BUNDLE_FORMAT, BUNDLE_VERSION } from "@cofre/storage";
import { callJson, type Fetcher } from "./http.ts";

export type LibsqlOptions = {
	/**
	 * The address of the database, such as https://cofre-ana.turso.io, or whatever a
	 * self hosted sqld answers on. The path of the protocol is added here.
	 */
	url: string;
	/** A token for that database. It lives on this device and goes nowhere else. */
	token: string;
	fetcher?: Fetcher;
	name?: string;
	/** How many statements travel in one call. Ten thousand rows at once is a timeout. */
	batch?: number;
};

type Value =
	| { type: "null" }
	| { type: "integer"; value: string }
	| { type: "float"; value: number }
	| { type: "text"; value: string };

type Statement = { sql: string; args: Value[] };

type Answer = {
	results?: {
		type: string;
		response?: { result?: { cols: { name: string }[]; rows: Value[][] } };
		error?: { message: string };
	}[];
};

const CHANGES = "cofre_changes";
const PEOPLE = "cofre_people";

/**
 * The tables, made on first use. They are named apart from anything else that may live
 * in the same database, and they hold exactly what a bundle holds, so that somebody
 * opening this database with any SQLite tool sees their own history and not a blob.
 */
const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS "${CHANGES}" (
		"id" TEXT PRIMARY KEY NOT NULL,
		"space_id" TEXT NOT NULL,
		"entity" TEXT NOT NULL,
		"entity_id" TEXT NOT NULL,
		"operation" TEXT NOT NULL,
		"payload" TEXT NOT NULL,
		"hlc" TEXT NOT NULL,
		"device_id" TEXT NOT NULL,
		"actor_id" TEXT,
		"created_at" INTEGER NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS "${CHANGES}_by_space" ON "${CHANGES}" ("space_id", "hlc")`,
	`CREATE TABLE IF NOT EXISTS "${PEOPLE}" (
		"id" TEXT PRIMARY KEY NOT NULL,
		"email" TEXT NOT NULL,
		"name" TEXT NOT NULL,
		"image" TEXT,
		"created_at" INTEGER NOT NULL,
		"updated_at" INTEGER NOT NULL
	)`,
];

function text(value: string): Value {
	return { type: "text", value };
}

function whole(value: number): Value {
	// The protocol carries an integer as a string, because JSON numbers stop being
	// exact before a database does.
	return { type: "integer", value: String(Math.trunc(value)) };
}

function maybe(value: string | null): Value {
	return value === null ? { type: "null" } : text(value);
}

function readText(value: Value | undefined): string {
	if (!value || value.type === "null") return "";
	return value.type === "integer" || value.type === "text"
		? String(value.value)
		: String(value.value);
}

function readNumber(value: Value | undefined): number {
	if (!value || value.type === "null") return 0;
	return Number(value.value);
}

function readMaybe(value: Value | undefined): string | null {
	return !value || value.type === "null" ? null : readText(value);
}

/** One row of an answer, as a record keyed by column name. */
function asRecords(
	result: { cols: { name: string }[]; rows: Value[][] } | undefined,
): Record<string, Value>[] {
	if (!result) return [];
	return result.rows.map((row) => {
		const record: Record<string, Value> = {};
		result.cols.forEach((col, index) => {
			const cell = row[index];
			if (cell) record[col.name] = cell;
		});
		return record;
	});
}

export function createLibsqlStore(options: LibsqlOptions): SyncStore {
	const base = options.url.replace(/\/+$/, "");
	const where = options.name ?? "banco de dados";
	const batch = options.batch ?? 200;

	/**
	 * What the other side already had when this device last read it. A bundle carries
	 * the whole log every time, and sending a log that is already there would mean the
	 * cost of a sync growing with the age of the space rather than with what changed.
	 *
	 * Only the log. People are not skipped this way, and the first version of this file
	 * did skip them, which meant somebody who changed their name was never seen to have
	 * changed it: a log entry is written once and never again, a person is not. There
	 * are a handful of them in a space, so sending all of them costs nothing worth
	 * saving.
	 */
	const known = new Set<string>();

	async function run(statements: Statement[]): Promise<Record<string, Value>[][]> {
		if (statements.length === 0) return [];

		const answer = await callJson<Answer>(`${base}/v2/pipeline`, {
			where,
			method: "POST",
			fetcher: options.fetcher,
			headers: {
				Authorization: `Bearer ${options.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				requests: [...statements.map((stmt) => ({ type: "execute", stmt })), { type: "close" }],
			}),
		});

		// The protocol answers 200 with the failure inside, so a statement that was
		// refused has to be found and raised rather than quietly returning nothing.
		const results = answer.results ?? [];
		for (const result of results) {
			if (result.type === "error" || result.error) {
				throw new Error(result.error?.message ?? `${where} refused a statement`);
			}
		}

		return results.slice(0, statements.length).map((result) => asRecords(result.response?.result));
	}

	async function inBatches(statements: Statement[]): Promise<void> {
		for (let at = 0; at < statements.length; at += batch) {
			await run(statements.slice(at, at + batch));
		}
	}

	return {
		name: options.name ?? "Banco de dados",

		async read(spaceId: string): Promise<StoredBundle> {
			const answers = await run([
				...SCHEMA.map((sql) => ({ sql, args: [] })),
				{
					sql: `SELECT "id", "space_id", "entity", "entity_id", "operation", "payload", "hlc",
					             "device_id", "actor_id", "created_at"
					      FROM "${CHANGES}" WHERE "space_id" = ? ORDER BY "hlc"`,
					args: [text(spaceId)],
				},
				{
					sql: `SELECT "id", "email", "name", "image", "created_at", "updated_at"
					      FROM "${PEOPLE}"`,
					args: [],
				},
			]);

			const changeRows = answers[SCHEMA.length] ?? [];
			const peopleRows = answers[SCHEMA.length + 1] ?? [];

			known.clear();

			const changes: Change[] = changeRows.map((row) => {
				const id = readText(row.id);
				known.add(id);
				return {
					id,
					spaceId: readText(row.space_id),
					entity: readText(row.entity),
					entityId: readText(row.entity_id),
					operation: readText(row.operation) as Change["operation"],
					payload: JSON.parse(readText(row.payload) || "{}") as Record<string, unknown>,
					hlc: readText(row.hlc),
					deviceId: readText(row.device_id),
					actorId: readMaybe(row.actor_id),
					createdAt: readNumber(row.created_at),
				};
			});

			const people: Person[] = peopleRows.map((row) => {
				const id = readText(row.id);
				return {
					id,
					email: readText(row.email),
					name: readText(row.name),
					image: readMaybe(row.image),
					createdAt: readNumber(row.created_at),
					updatedAt: readNumber(row.updated_at),
				};
			});

			// Nothing there yet is the ordinary state of the first exchange.
			if (changes.length === 0 && people.length === 0) return { bundle: null, revision: null };

			return {
				bundle: {
					format: BUNDLE_FORMAT,
					version: BUNDLE_VERSION,
					spaceId,
					changes,
					people,
					writtenAt: Date.now(),
				},
				revision: null,
			};
		},

		async write(spaceId: string, bundle: SyncBundle) {
			const fresh = bundle.changes.filter((change) => !known.has(change.id));

			await inBatches([
				...SCHEMA.map((sql) => ({ sql, args: [] })),
				...fresh.map((change) => ({
					// A log entry never changes, so an entry that is already there is the
					// same entry and there is nothing to decide.
					sql: `INSERT OR IGNORE INTO "${CHANGES}"
					      ("id", "space_id", "entity", "entity_id", "operation", "payload", "hlc",
					       "device_id", "actor_id", "created_at")
					      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					args: [
						text(change.id),
						text(change.spaceId),
						text(change.entity),
						text(change.entityId),
						text(change.operation),
						text(JSON.stringify(change.payload)),
						text(change.hlc),
						text(change.deviceId),
						maybe(change.actorId),
						whole(change.createdAt),
					],
				})),
				...bundle.people.map((person) => ({
					// A person can be renamed, so this one is the newest rather than the
					// first, which is what the engine does with them everywhere else.
					sql: `INSERT INTO "${PEOPLE}" ("id", "email", "name", "image", "created_at", "updated_at")
					      VALUES (?, ?, ?, ?, ?, ?)
					      ON CONFLICT("id") DO UPDATE SET
					        "email" = excluded."email", "name" = excluded."name",
					        "image" = excluded."image", "updated_at" = excluded."updated_at"
					      WHERE excluded."updated_at" >= "${PEOPLE}"."updated_at"`,
					args: [
						text(person.id),
						text(person.email),
						text(person.name),
						maybe(person.image),
						whole(person.createdAt),
						whole(person.updatedAt),
					],
				})),
			]);

			for (const change of fresh) known.add(change.id);

			void spaceId;
			// Rows in a log have no version to come back to, and need none: two devices
			// appending to it cannot lose each other's writes.
			return { revision: null };
		},
	};
}
