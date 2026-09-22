// The change log, read from two places later: the activity screen of a space, and the
// replication engine of phase 6. Both ask the same question, "what happened after
// this stamp", which is why the log is ordered by the hybrid clock and not by a date.

import { assertCan } from "../actor.ts";
import { type Change, toChange } from "../models.ts";
import { type Compaction, compactChanges, compactedBefore } from "../sync.ts";
import type { RepositoryContext } from "./context.ts";

const SELECT = `SELECT "id", "space_id", "entity", "entity_id", "operation", "payload", "hlc",
	"device_id", "actor_id", "created_at"
	FROM "changes"`;

export type ListChangesInput = {
	spaceId: string;
	/** Everything written after this stamp, which is what a device asks when it reconnects. */
	after?: string;
	limit?: number;
};

export function createChangesRepository(context: RepositoryContext) {
	return {
		async list(input: ListChangesInput): Promise<Change[]> {
			assertCan(context.actor(), input.spaceId, "activity.read");
			const limit = Math.min(Math.max(input.limit ?? 100, 1), 1000);

			if (input.after === undefined) {
				const rows = await context.driver.all(
					`${SELECT} WHERE "space_id" = ? ORDER BY "hlc" LIMIT ${limit}`,
					[input.spaceId],
				);
				return rows.map(toChange);
			}

			const rows = await context.driver.all(
				`${SELECT} WHERE "space_id" = ? AND "hlc" > ? ORDER BY "hlc" LIMIT ${limit}`,
				[input.spaceId, input.after],
			);
			return rows.map(toChange);
		},

		/** The newest stamp this space has seen, which a device stores to ask for the rest. */
		async latestStamp(spaceId: string): Promise<string | null> {
			assertCan(context.actor(), spaceId, "activity.read");
			const rows = await context.driver.all(
				`SELECT "hlc" FROM "changes" WHERE "space_id" = ? ORDER BY "hlc" DESC LIMIT 1`,
				[spaceId],
			);
			const first = rows[0];
			return first ? String(first.hlc) : null;
		},

		/** How long the log is, and how much of it is already folded. */
		async size(spaceId: string): Promise<{ entries: number; foldedBefore: string | null }> {
			assertCan(context.actor(), spaceId, "activity.read");
			const rows = await context.driver.all(
				`SELECT COUNT(*) AS entries FROM "changes" WHERE "space_id" = ?`,
				[spaceId],
			);
			return {
				entries: Number(rows[0]?.entries ?? 0),
				foldedBefore: await compactedBefore(context.driver, spaceId),
			};
		},

		/**
		 * Folds the settled part of the log into one entry per row.
		 *
		 * It changes the history rather than the money, so it takes the permission that
		 * decides what a space is, not the one that reads it.
		 */
		async compact(input: { spaceId: string; before: string }): Promise<Compaction> {
			assertCan(context.actor(), input.spaceId, "space.update");
			return compactChanges(context.driver, input.spaceId, { before: input.before });
		},
	};
}

export type ChangesRepository = ReturnType<typeof createChangesRepository>;
