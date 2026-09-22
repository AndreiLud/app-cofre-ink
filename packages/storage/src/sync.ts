// Replication: making two databases agree.
//
// The change log is the unit of replication, as registry 0003 decided. A device asks
// for everything after the highest stamp it has seen, writes those entries into its own
// log, and then rebuilds every row they touched by folding its whole history in stamp
// order. Folding rather than patching is what makes the result independent of the order
// the entries arrived in: the same set of changes always produces the same rows, which
// is the property the replay test checks.
//
// Two things are deliberately not replicated. Membership and invitations are decided by
// a server, because a change log entry that grants a role would be a way to promote
// yourself. And anything outside a space is not part of a space to begin with.

import { tableByName } from "@cofre/db";
import type { Driver, Row, SqlValue } from "./driver.ts";
import { type Change, toChange } from "./models.ts";
import { quoted } from "./sql.ts";

export type RejectedChange = {
	changeId: string;
	entity: string;
	/** Named so the interface can say why in the language of the person. */
	reason: "entityIsNotReplicated" | "wrongSpace";
};

export type ApplyResult = {
	applied: number;
	/** Entries that were already here, which is the usual case when a pull overlaps. */
	skipped: number;
	rejected: RejectedChange[];
	/**
	 * Entries that cannot be written yet because what they belong to is not here. The
	 * protocol sends a contiguous range from a stamp, so this stays empty in practice;
	 * it exists so that a partial set is a number to report rather than a crash.
	 */
	deferred: number;
};

const CHANGE_COLUMNS = [
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
] as const;

const SELECT_CHANGES = `SELECT "id", "space_id", "entity", "entity_id", "operation", "payload",
	"hlc", "device_id", "actor_id", "created_at"
	FROM "changes"`;

/**
 * What a change log entry is allowed to touch: the tables that belong to a space and
 * carry the replication columns. Everything else is either global or decided by a
 * server, and an entry naming one of those is refused rather than ignored, so the other
 * side learns that it was refused.
 */
export function isReplicated(entity: string): boolean {
	try {
		const table = tableByName(entity);
		if (!table.replicated || table.name === "changes") return false;
		if (table.scope === "space") return true;
		// The space row itself travels, because a space that exists on one device and
		// not on the other is not a shared space. Who belongs to it does not travel.
		return table.name === "spaces";
	} catch {
		return false;
	}
}

/** What is worth sending: the rest would only be refused at the other end. */
export function replicableOnly(changes: readonly Change[]): Change[] {
	return changes.filter((change) => isReplicated(change.entity));
}

/** Sorted the way resolution reads them: by stamp, and by device when stamps tie. */
function inOrder(changes: readonly Change[]): Change[] {
	return [...changes].sort(
		(left, right) =>
			left.hlc.localeCompare(right.hlc) || left.deviceId.localeCompare(right.deviceId),
	);
}

export async function changesSince(
	driver: Driver,
	spaceId: string,
	after?: string | null,
	limit = 5000,
): Promise<Change[]> {
	const rows = await driver.all(
		`${SELECT_CHANGES} WHERE "space_id" = ?${after ? ` AND "hlc" > ?` : ""}
		 ORDER BY "hlc", "device_id" LIMIT ${Math.max(1, Math.min(limit, 20_000))}`,
		after ? [spaceId, after] : [spaceId],
	);
	return rows.map(toChange);
}

export async function latestStampOf(driver: Driver, spaceId: string): Promise<string | null> {
	const rows = await driver.all(`SELECT MAX("hlc") AS stamp FROM "changes" WHERE "space_id" = ?`, [
		spaceId,
	]);
	const stamp = rows[0]?.stamp;
	return stamp === null || stamp === undefined ? null : String(stamp);
}

/**
 * Folds the whole history of one row into the row itself.
 *
 * A deletion is treated as a write to the tombstone column at its own stamp, so an edit
 * that arrives later does not bring a deleted row back: it wins on the fields it names,
 * and nobody named the tombstone again.
 */
function fold(history: readonly Change[]): Record<string, SqlValue> {
	const values: Record<string, SqlValue> = {};

	for (const change of inOrder(history)) {
		if (change.operation === "delete") {
			values.deleted_at = change.createdAt;
			values.updated_at = change.createdAt;
			if (change.actorId !== null) values.updated_by = change.actorId;
			continue;
		}
		for (const [column, value] of Object.entries(change.payload)) {
			values[column] = value as SqlValue;
		}
	}

	return values;
}

async function historyOf(driver: Driver, entity: string, entityId: string): Promise<Change[]> {
	const rows = await driver.all(
		`${SELECT_CHANGES} WHERE "entity" = ? AND "entity_id" = ? ORDER BY "hlc", "device_id"`,
		[entity, entityId],
	);
	return rows.map(toChange);
}

async function rowExists(driver: Driver, table: string, id: string): Promise<boolean> {
	const rows = await driver.all(`SELECT "id" FROM ${quoted(table)} WHERE "id" = ?`, [id]);
	return rows.length > 0;
}

/**
 * Which space a row already belongs to, for the tables that belong to one.
 *
 * Null means the row is not here. It is read before anything is written over it,
 * because a row is found by its identifier alone and an identifier says nothing about
 * who owns it.
 */
async function spaceOfRow(driver: Driver, table: string, id: string): Promise<string | null> {
	const rows = await driver.all(`SELECT "space_id" FROM ${quoted(table)} WHERE "id" = ?`, [id]);
	const found = rows[0]?.space_id;
	return found === undefined || found === null ? null : String(found);
}

/**
 * Writes the entries into the local log and rebuilds what they touch.
 *
 * Nothing here goes through the writer that the repositories use, on purpose: applying
 * somebody else's change must not produce a change of its own, or two devices would
 * talk forever.
 */
export async function applyChanges(
	driver: Driver,
	changes: readonly Change[],
	options: { spaceId?: string } = {},
): Promise<ApplyResult> {
	const rejected: RejectedChange[] = [];
	const accepted: Change[] = [];

	for (const change of changes) {
		if (options.spaceId && change.spaceId !== options.spaceId) {
			rejected.push({ changeId: change.id, entity: change.entity, reason: "wrongSpace" });
			continue;
		}
		if (!isReplicated(change.entity)) {
			rejected.push({
				changeId: change.id,
				entity: change.entity,
				reason: "entityIsNotReplicated",
			});
			continue;
		}
		// The row of a space is the space, so an entry that says it is about space A
		// while naming space B is an entry trying to reach somewhere it was not sent.
		if (change.entity === "spaces" && change.entityId !== change.spaceId) {
			rejected.push({ changeId: change.id, entity: change.entity, reason: "wrongSpace" });
			continue;
		}
		accepted.push(change);
	}

	if (accepted.length === 0) return { applied: 0, skipped: 0, rejected, deferred: 0 };

	let applied = 0;
	let skipped = 0;
	let deferred = 0;
	/** Entries turned away once the row they name turned out to belong elsewhere. */
	const refused = new Set<string>();

	await driver.transaction(async (tx) => {
		// A space nobody here knows about cannot receive anything, and the entry itself
		// points at it, so the whole set waits for the range that creates it.
		const spaces = new Set(
			accepted.filter((change) => change.entity === "spaces").map((change) => change.entityId),
		);
		const knownSpaces = new Set<string>();
		for (const spaceId of new Set(accepted.map((change) => change.spaceId))) {
			if (spaces.has(spaceId) || (await rowExists(tx, "spaces", spaceId))) {
				knownSpaces.add(spaceId);
			}
		}

		// How far each space has been folded. An entry from before that mark about a row
		// this database already has is an entry that has already been counted.
		const marks = new Map<string, string | null>();
		for (const spaceId of knownSpaces) {
			marks.set(spaceId, await compactedBefore(tx, spaceId));
		}

		const fresh: Change[] = [];
		for (const change of inOrder(accepted)) {
			if (!knownSpaces.has(change.spaceId)) {
				deferred += 1;
				continue;
			}

			const mark = marks.get(change.spaceId) ?? null;
			if (mark !== null && change.hlc <= mark) {
				const known = await tx.all(
					`SELECT "id" FROM "changes" WHERE "entity" = ? AND "entity_id" = ? LIMIT 1`,
					[change.entity, change.entityId],
				);
				if (known.length > 0) {
					skipped += 1;
					continue;
				}
			}

			const already = await tx.all(`SELECT "id" FROM "changes" WHERE "id" = ?`, [change.id]);
			if (already.length > 0) skipped += 1;
			else fresh.push(change);
		}

		// Group by row, and rebuild in the order the rows were born. A change log entry
		// points at its space, and a row points at the rows it depends on, so writing
		// them out of order would break a reference. The stamp is that order.
		const groups = new Map<
			string,
			{ entity: string; entityId: string; spaceId: string; changes: Change[] }
		>();
		for (const change of fresh) {
			const key = `${change.entity}:${change.entityId}`;
			const group = groups.get(key) ?? {
				entity: change.entity,
				entityId: change.entityId,
				spaceId: change.spaceId,
				changes: [],
			};
			group.changes.push(change);
			groups.set(key, group);
		}

		const ordered = [...groups.values()].sort((left, right) => {
			const first = (group: { changes: Change[] }) => inOrder(group.changes)[0]?.hlc ?? "";
			return first(left).localeCompare(first(right));
		});

		// The rows first, then the entries that describe them. The other way round is
		// impossible: an entry names a space that would not exist yet.
		for (const group of ordered) {
			const table = tableByName(group.entity);
			const known = new Set(table.columns.map((column) => column.name));
			const history = [...(await historyOf(tx, group.entity, group.entityId)), ...group.changes];
			const folded = fold(history);

			// Which space a row belongs to is decided by the entry that carried it and
			// never by what the entry contains. Without this, somebody who is in one
			// space can name another in a payload and write a row into it, and somebody
			// who was removed from a space can keep writing to the rows they remember.
			if (table.scope === "space") {
				const owner = await spaceOfRow(tx, group.entity, group.entityId);
				if (owner !== null && owner !== group.spaceId) {
					for (const change of group.changes) {
						rejected.push({ changeId: change.id, entity: change.entity, reason: "wrongSpace" });
						refused.add(change.id);
					}
					continue;
				}
				folded.space_id = group.spaceId;
			}

			const columns = Object.keys(folded).filter((column) => known.has(column));
			if (columns.length === 0) continue;

			const exists = await rowExists(tx, group.entity, group.entityId);

			// A row whose creation has not arrived cannot be written: the entries that
			// did arrive are kept, and the row appears when the rest of the range does.
			const missing = table.columns.filter(
				(column) =>
					column.notNull &&
					column.defaultTo === undefined &&
					column.name !== "id" &&
					!(column.name in folded),
			);
			if (!exists && missing.length > 0) continue;

			if (exists) {
				const writable = columns.filter((column) => column !== "id");
				if (writable.length === 0) continue;
				await tx.run(
					`UPDATE ${quoted(group.entity)}
					 SET ${writable.map((column) => `${quoted(column)} = ?`).join(", ")}
					 WHERE "id" = ?`,
					[...writable.map((column) => folded[column] ?? null), group.entityId],
				);
			} else {
				const withId = columns.includes("id") ? columns : ["id", ...columns];
				await tx.run(
					`INSERT INTO ${quoted(group.entity)} (${withId.map(quoted).join(", ")})
					 VALUES (${withId.map(() => "?").join(", ")})`,
					withId.map((column) => (column === "id" ? group.entityId : (folded[column] ?? null))),
				);
			}
		}

		// An entry that was refused above never enters the log, or this device would
		// hand it on to the next one as if it had been accepted.
		for (const change of fresh.filter((one) => !refused.has(one.id))) {
			await tx.run(
				`INSERT INTO "changes" (${CHANGE_COLUMNS.map(quoted).join(", ")})
				 VALUES (${CHANGE_COLUMNS.map(() => "?").join(", ")})`,
				[
					change.id,
					change.spaceId,
					change.entity,
					change.entityId,
					change.operation,
					JSON.stringify(change.payload),
					change.hlc,
					change.deviceId,
					change.actorId,
					change.createdAt,
				],
			);
			applied += 1;
		}
	});

	return { applied, skipped, rejected, deferred };
}

/** Everything one device has to send, which is everything the other one has not seen. */
export async function changesToPush(
	driver: Driver,
	spaceId: string,
	theirStamp: string | null,
): Promise<Change[]> {
	return replicableOnly(await changesSince(driver, spaceId, theirStamp));
}

export type Person = {
	id: string;
	email: string;
	name: string;
	image: string | null;
	createdAt: number;
	updatedAt: number;
};

/** Everybody who belongs to a space, which is who its records point at. */
export async function peopleInSpace(driver: Driver, spaceId: string): Promise<Person[]> {
	const rows = await driver.all(
		`SELECT u."id", u."email", u."name", u."image", u."created_at", u."updated_at"
		 FROM "users" u
		 JOIN "space_members" m ON m."user_id" = u."id"
		 WHERE m."space_id" = ? AND m."deleted_at" IS NULL`,
		[spaceId],
	);
	return rows.map((row) => ({
		id: String(row.id),
		email: String(row.email),
		name: String(row.name),
		image: row.image === null ? null : String(row.image),
		createdAt: Number(row.created_at),
		updatedAt: Number(row.updated_at),
	}));
}

/**
 * Writes the people a space needs, and no more than that.
 *
 * Identity is decided by whoever runs the server, never by a change log, so this only
 * fills in somebody who is missing. It never changes an address or a name that is
 * already here, which is the difference between learning who somebody is and being
 * told who you are.
 */
export async function applyPeople(driver: Driver, people: readonly Person[]): Promise<number> {
	let written = 0;
	for (const person of people) {
		const already = await driver.all(`SELECT "id" FROM "users" WHERE "id" = ?`, [person.id]);
		if (already.length > 0) continue;

		// An address already in use belongs to somebody, and a second row claiming it
		// would fail the unique index and take the whole exchange down with it. The
		// person is skipped instead: learning who somebody is never overwrites anybody.
		const taken = await driver.all(`SELECT "id" FROM "users" WHERE "email" = ?`, [person.email]);
		if (taken.length > 0) continue;

		// The people table is not replicated and carries no sync columns: identity comes
		// from a server, and this only writes down who somebody is.
		await driver.run(
			`INSERT INTO "users" ("id", "email", "name", "image", "email_verified", "created_at",
			 "updated_at")
			 VALUES (?, ?, ?, ?, 0, ?, ?)`,
			[person.id, person.email, person.name, person.image, person.createdAt, person.updatedAt],
		);
		written += 1;
	}
	return written;
}

export type SyncSummary = {
	spaceId: string;
	pushed: number;
	pulled: number;
	rejected: RejectedChange[];
	/** The highest stamp this device has seen for the space, after the exchange. */
	stamp: string | null;
};

export type SyncPeer = {
	/**
	 * Sends what this device has and returns what the other side has. One round trip,
	 * because two would leave a window where a device is half synced.
	 */
	exchange: (input: {
		spaceId: string;
		since: string | null;
		changes: Change[];
	}) => Promise<{ changes: Change[]; people?: Person[] }>;
};

/**
 * One exchange with one peer for one space: send what they have not seen, apply what
 * this device has not seen. Safe to run again at any time, because both sides are
 * idempotent by change identifier.
 */
export async function syncSpace(
	driver: Driver,
	peer: SyncPeer,
	input: { spaceId: string; since: string | null },
): Promise<SyncSummary> {
	const mine = await changesToPush(driver, input.spaceId, input.since);
	const answer = await peer.exchange({
		spaceId: input.spaceId,
		since: input.since,
		changes: mine,
	});

	// The people first: every record points at somebody, and a record whose author is
	// unknown here is a record that cannot be written.
	if (answer.people && answer.people.length > 0) await applyPeople(driver, answer.people);

	const result = await applyChanges(driver, answer.changes, { spaceId: input.spaceId });

	return {
		spaceId: input.spaceId,
		pushed: mine.length,
		pulled: result.applied,
		rejected: result.rejected,
		stamp: await latestStampOf(driver, input.spaceId),
	};
}

/** Reads a row as the sync engine sees it, which the tests and the repair job need. */
export async function rowOf(driver: Driver, entity: string, id: string): Promise<Row | null> {
	const rows = await driver.all(`SELECT * FROM ${quoted(entity)} WHERE "id" = ?`, [id]);
	return rows[0] ?? null;
}

export type Compaction = {
	/** How many entries were folded away. */
	removed: number;
	/** How many rows they were about. */
	rows: number;
	/** The stamp everything is settled up to, after this. */
	stamp: string | null;
};

/**
 * Folds the settled part of the log into one entry per row.
 *
 * A record that was written, corrected twice and reconciled is four entries saying, in
 * the end, one thing. Once nobody is going to argue about it any more, those four can
 * become the one thing they add up to: the same row, at the same stamp, written once.
 *
 * What makes it safe is that folding is how the log is read in the first place. The
 * entry that replaces a history carries the state that history produced, at the stamp
 * of its newest entry, so anything that arrives later still wins on the fields it
 * names, exactly as before.
 *
 * The space remembers how far it has been folded. An entry from before that mark about
 * a row this database already knows has already been counted, and is dropped rather
 * than added back, which is what stops a device that has not folded from undoing this.
 */
export async function compactChanges(
	driver: Driver,
	spaceId: string,
	options: { before: string },
): Promise<Compaction> {
	let removed = 0;
	let rows = 0;

	await driver.transaction(async (tx) => {
		const all = (
			await tx.all(
				`${SELECT_CHANGES} WHERE "space_id" = ? AND "hlc" <= ? ORDER BY "hlc", "device_id"`,
				[spaceId, options.before],
			)
		).map(toChange);

		const groups = new Map<string, Change[]>();
		for (const change of all) {
			const key = `${change.entity}:${change.entityId}`;
			groups.set(key, [...(groups.get(key) ?? []), change]);
		}

		for (const history of groups.values()) {
			// One entry is already the smallest a row can be.
			if (history.length < 2) continue;

			const ordered = inOrder(history);
			const newest = ordered[ordered.length - 1];
			if (!newest) continue;

			const folded = fold(ordered);
			// The identifier of the newest entry is kept, so a peer that already has it
			// does not take the folded entry as something new.
			await tx.run(
				`DELETE FROM "changes" WHERE "entity" = ? AND "entity_id" = ? AND "space_id" = ? AND "hlc" <= ?`,
				[newest.entity, newest.entityId, spaceId, options.before],
			);

			await tx.run(
				`INSERT INTO "changes" (${CHANGE_COLUMNS.map(quoted).join(", ")})
				 VALUES (${CHANGE_COLUMNS.map(() => "?").join(", ")})`,
				[
					newest.id,
					spaceId,
					newest.entity,
					newest.entityId,
					"insert",
					JSON.stringify({ id: newest.entityId, ...folded }),
					newest.hlc,
					newest.deviceId,
					newest.actorId,
					newest.createdAt,
				],
			);

			removed += history.length - 1;
			rows += 1;
		}

		await tx.run(`UPDATE "spaces" SET "compacted_before" = ? WHERE "id" = ?`, [
			options.before,
			spaceId,
		]);
	});

	return { removed, rows, stamp: options.before };
}

/** How far the log of a space has been folded, as the space itself records it. */
export async function compactedBefore(driver: Driver, spaceId: string): Promise<string | null> {
	const rows = await driver.all(`SELECT "compacted_before" FROM "spaces" WHERE "id" = ?`, [
		spaceId,
	]);
	const mark = rows[0]?.compacted_before;
	return mark === null || mark === undefined ? null : String(mark);
}
