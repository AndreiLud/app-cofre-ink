// Every write goes through here.
//
// Two things happen for each row that changes: the row itself is written with the
// bookkeeping that replication needs (stamp, authorship, tombstone), and a line is
// appended to the change log. Nothing reads that log yet. The engine of phase 6 will,
// and so will the activity screen, and neither will have to migrate a year of real
// data to get it.

import { type HybridClock, uuidV7 } from "@cofre/core";
import type { Table } from "@cofre/db";
import type { Actor } from "./actor.ts";
import type { Driver, SqlValue } from "./driver.ts";
import { quoted } from "./sql.ts";

export type WriteContext = {
	driver: Driver;
	actor: Actor;
	clock: HybridClock;
	now: () => number;
};

export type Values = Record<string, SqlValue>;

function placeholders(count: number): string {
	return new Array(count).fill("?").join(", ");
}

async function recordChange(
	context: WriteContext,
	spaceId: string,
	entity: string,
	entityId: string,
	operation: "insert" | "update" | "delete",
	payload: Values,
	stamp: string,
): Promise<void> {
	await context.driver.run(
		`INSERT INTO "changes" ("id", "space_id", "entity", "entity_id", "operation", "payload", "hlc", "device_id", "actor_id", "created_at")
		 VALUES (${placeholders(10)})`,
		[
			uuidV7(),
			spaceId,
			entity,
			entityId,
			operation,
			JSON.stringify(payload),
			stamp,
			context.actor.deviceId,
			context.actor.userId,
			context.now(),
		],
	);
}

export type InsertInput = {
	table: Table;
	spaceId: string;
	values: Values;
	/** Given only when the identifier comes from somewhere else, such as an import. */
	id?: string;
};

export async function insertRow(context: WriteContext, input: InsertInput): Promise<string> {
	const id = input.id ?? uuidV7();
	const stamp = context.clock.next();
	const moment = context.now();

	const row: Values = { id, ...input.values };
	if (input.table.scope !== "global") row.space_id = input.spaceId;
	if (input.table.replicated) {
		row.created_at = moment;
		row.updated_at = moment;
		row.updated_by = context.actor.userId;
		row.deleted_at = null;
		row.hlc = stamp;
	}

	const columns = Object.keys(row);
	await context.driver.run(
		`INSERT INTO ${quoted(input.table.name)} (${columns.map(quoted).join(", ")})
		 VALUES (${placeholders(columns.length)})`,
		columns.map((column) => row[column] ?? null),
	);

	if (input.table.replicated) {
		await recordChange(context, input.spaceId, input.table.name, id, "insert", row, stamp);
	}
	return id;
}

export type UpdateInput = {
	table: Table;
	spaceId: string;
	id: string;
	values: Values;
};

export async function updateRow(context: WriteContext, input: UpdateInput): Promise<void> {
	const stamp = context.clock.next();
	const row: Values = { ...input.values };
	if (input.table.replicated) {
		row.updated_at = context.now();
		row.updated_by = context.actor.userId;
		row.hlc = stamp;
	}

	const columns = Object.keys(row);
	if (columns.length === 0) return;

	await context.driver.run(
		`UPDATE ${quoted(input.table.name)}
		 SET ${columns.map((column) => `${quoted(column)} = ?`).join(", ")}
		 WHERE "id" = ?`,
		[...columns.map((column) => row[column] ?? null), input.id],
	);

	if (input.table.replicated) {
		await recordChange(context, input.spaceId, input.table.name, input.id, "update", row, stamp);
	}
}

/**
 * Deletion leaves a tombstone instead of removing the row, because a device that was
 * offline has to learn that the row is gone. A job compacts old tombstones later.
 */
export async function softDeleteRow(
	context: WriteContext,
	input: { table: Table; spaceId: string; id: string },
): Promise<void> {
	const stamp = context.clock.next();
	const moment = context.now();

	await context.driver.run(
		`UPDATE ${quoted(input.table.name)}
		 SET "deleted_at" = ?, "updated_at" = ?, "updated_by" = ?, "hlc" = ?
		 WHERE "id" = ?`,
		[moment, moment, context.actor.userId, stamp, input.id],
	);

	await recordChange(context, input.spaceId, input.table.name, input.id, "delete", {}, stamp);
}
