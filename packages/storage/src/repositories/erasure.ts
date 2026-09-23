// Taking the data away, for real.
//
// Everything else in this layer deletes softly: a row gets a tombstone so the deletion
// can travel to another device, and the bytes stay where they were. That is right for
// deleting one record and wrong for somebody who has decided they are done. "The data
// stays where you put it" is only half a promise if there is no way to take it back.
//
// So this file is the other half, and it is the only place in the project that writes
// DELETE. It is not logged and it does not replicate, because a change log entry about
// erasing a space would be the one row left saying what used to be there.
//
// Two things it deliberately does not claim. It cannot reach into a copy somebody else
// already has, which is what sharing means. And on a database that holds more than one
// person, it touches only what belongs to the person asking.

import { SCHEMA } from "@cofre/db";
import { assertCan, roleIn } from "../actor.ts";
import type { Driver } from "../driver.ts";
import { NotFoundError } from "../errors.ts";
import { quoted } from "../sql.ts";
import type { RepositoryContext } from "./context.ts";

export type EraseResult = {
	spaceId: string;
	name: string;
	/** How many rows went, so the screen can say something true afterwards. */
	rows: number;
	/** False for the personal space, which is emptied and stays. */
	spaceRemoved: boolean;
};

export type EraseEverythingResult = {
	erased: EraseResult[];
	/** Spaces of other people, which are left rather than erased. */
	left: number;
};

type ToErase = {
	table: string;
	/**
	 * The column a row uses to point at another row of the same table, when there is
	 * one. Categories are the only case today: a child points at its parent, and the
	 * pointer refuses to be left dangling, so one DELETE over the lot trips over itself
	 * the moment a parent goes before its children. They go in two passes instead, which
	 * is enough because the model allows two levels and never three.
	 */
	selfReference: string | null;
};

/**
 * Every table that holds rows of a space, children before parents.
 *
 * The schema declares a table only after the tables it points at, so walking it
 * backwards deletes a child before its parent and never trips a foreign key. The two at
 * the end are in the membership scope but carry a space, and the log is one of them: a
 * space erased with its history still in the log is a space that left a shadow.
 */
const INSIDE_A_SPACE: ToErase[] = [
	...SCHEMA.filter((table) => table.scope === "space")
		.map((table) => ({
			table: table.name,
			selfReference:
				table.columns.find((column) => column.references?.table === table.name)?.name ?? null,
		}))
		.reverse(),
	{ table: "space_invitations", selfReference: null },
	{ table: "changes", selfReference: null },
];

export function createErasureRepository(context: RepositoryContext) {
	async function spaceRow(spaceId: string): Promise<{ name: string; kind: string }> {
		const rows = await context.driver.all(
			`SELECT "name", "kind" FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
			[spaceId],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("space", spaceId);
		return { name: String(first.name), kind: String(first.kind) };
	}

	async function countIn(driver: Driver, table: string, spaceId: string): Promise<number> {
		const rows = await driver.all(
			`SELECT COUNT(*) AS how_many FROM ${quoted(table)} WHERE "space_id" = ?`,
			[spaceId],
		);
		return Number(rows[0]?.how_many ?? 0);
	}

	/** Every row that belongs to a space, and the count of what went. */
	async function eraseRowsOf(driver: Driver, spaceId: string): Promise<number> {
		let gone = 0;
		for (const { table, selfReference } of INSIDE_A_SPACE) {
			gone += await countIn(driver, table, spaceId);
			if (selfReference !== null) {
				await driver.run(
					`DELETE FROM ${quoted(table)} WHERE "space_id" = ? AND ${quoted(selfReference)} IS NOT NULL`,
					[spaceId],
				);
			}
			await driver.run(`DELETE FROM ${quoted(table)} WHERE "space_id" = ?`, [spaceId]);
		}
		return gone;
	}

	/**
	 * Spaces that were thrown away before this existed.
	 *
	 * Removing a space marks it deleted so the deletion can reach another device, and
	 * leaves its rows on disk, unreachable but present. Erasing everything would walk
	 * past them, because a deleted space is not a membership any more. So they are swept
	 * here, and only when nobody else was ever in them: rows of a space somebody else
	 * shares are not this person's to throw away, whatever state the space is in.
	 */
	async function abandoned(userId: string): Promise<string[]> {
		const rows = await context.driver.all(
			`SELECT DISTINCT m."space_id" AS space_id
			 FROM "space_members" m
			 JOIN "spaces" s ON s."id" = m."space_id"
			 WHERE m."user_id" = ? AND s."deleted_at" IS NOT NULL
			   AND NOT EXISTS (
			     SELECT 1 FROM "space_members" other
			     WHERE other."space_id" = m."space_id" AND other."user_id" <> ?
			   )`,
			[userId, userId],
		);
		return rows.map((row) => String(row.space_id));
	}

	return {
		/**
		 * Everything inside one space, gone.
		 *
		 * A shared space goes with it, members and all, because a shared space with
		 * nothing in it and nobody in it is not a thing anybody wants to keep. The
		 * personal space stays and comes back empty: the application needs one, and
		 * making the person walk through onboarding again to get it would be a worse
		 * answer than an empty screen.
		 */
		async eraseSpace(spaceId: string): Promise<EraseResult> {
			// Read before the check, so somebody who is not a member is told the space
			// does not exist rather than that they may not touch it.
			const space = await spaceRow(spaceId);
			assertCan(context.actor(), spaceId, "space.delete");

			const rows = await context.driver.transaction(async (tx) => {
				const gone = await eraseRowsOf(tx, spaceId);

				if (space.kind !== "personal") {
					await tx.run(`DELETE FROM "space_members" WHERE "space_id" = ?`, [spaceId]);
					// Deleting the space would cascade into everything above anyway, in
					// both dialects. The loop runs first all the same: the erasure of a
					// space is not a thing to leave to a setting that can be off.
					await tx.run(`DELETE FROM "spaces" WHERE "id" = ?`, [spaceId]);
				}
				return gone;
			});

			await context.refreshActor();
			return {
				spaceId,
				name: space.name,
				rows,
				spaceRemoved: space.kind !== "personal",
			};
		},

		/**
		 * Every space this person owns, erased, and every space of somebody else, left.
		 *
		 * Leaving rather than erasing is the only honest move on a space that is not
		 * theirs: the records in it belong to the people who stayed, and one member
		 * walking out does not get to empty the shared drawer.
		 */
		async eraseEverything(): Promise<EraseEverythingResult> {
			const memberships = context
				.actor()
				.memberships.filter((membership) => membership.state === "active");

			const erased: EraseResult[] = [];
			let left = 0;

			for (const membership of memberships) {
				if (roleIn(context.actor(), membership.spaceId) === "owner") {
					erased.push(await this.eraseSpace(membership.spaceId));
					continue;
				}
				await context.driver.run(
					`DELETE FROM "space_members" WHERE "space_id" = ? AND "user_id" = ?`,
					[membership.spaceId, context.actor().userId],
				);
				left += 1;
			}

			for (const spaceId of await abandoned(context.actor().userId)) {
				await context.driver.transaction(async (tx) => {
					await eraseRowsOf(tx, spaceId);
					await tx.run(`DELETE FROM "space_members" WHERE "space_id" = ?`, [spaceId]);
					await tx.run(`DELETE FROM "spaces" WHERE "id" = ?`, [spaceId]);
				});
			}

			await context.refreshActor();
			return { erased, left };
		},
	};
}

export type ErasureRepository = ReturnType<typeof createErasureRepository>;
