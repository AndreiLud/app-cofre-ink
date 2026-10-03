// Repairs that travel.
//
// A release that wrote a row the next release reads differently leaves the next one two
// ways to put it right: change the rows where they lie, or write the change. Changing them
// where they lie is what a migration does, and it does not travel. The change log still
// holds each row as it was, so a restore, a copy kept somewhere else and the exchange
// between devices write the old row back, and the repair is undone the next time any of
// them runs. So a repair is written here instead, through the writer every change made by
// a person goes through, by somebody allowed to change the space, and it enters the log
// like anything else. Its stamp is newer than the row it repairs, so an older copy of that
// row arriving later loses to it.
//
// Every repair is safe to run on every opening: it looks for the rows it has not repaired
// yet, and a database with none costs one query per space.

import { readMonthMark } from "@cofre/core";
import { MIGRATIONS_TABLE, transactions } from "@cofre/db";
import { assertCan } from "../actor.ts";
import { asNumber } from "../driver.ts";
import { updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

/** The first migration release 1.1.0 brought. */
const FIRST_OF_RELEASE_1_1_0 = "0013_benefit_quota";

/** The migration that marks the moment a database moved to release 2.0.0. */
const RELEASE_2_0_0 = "0016_release_2_0_0";

export type RepairOutcome = {
	spaceId: string;
	/** Promises written by releases 1.1.0 to 1.2.1, which are facts now. */
	promisesMadeFacts: number;
	/** Payments of the month screen a server wrote with no invoice, given the invoice of their month. */
	paymentsGivenTheirInvoice: number;
};

async function appliedAt(context: RepositoryContext, id: string): Promise<number | null> {
	const rows = await context.driver.all(
		`SELECT "applied_at" FROM "${MIGRATIONS_TABLE}" WHERE "id" = ?`,
		[id],
	);
	const found = rows[0]?.applied_at;
	return found === undefined || found === null ? null : asNumber(found);
}

/**
 * Promises written by releases 1.1.0 to 1.2.1 become facts.
 *
 * Those releases wrote a record dated ahead as a promise, every occurrence of a series as
 * one, and the payment of the month screen as one when its day had not come, and nothing
 * ever turned any of them into a fact: on its day it stayed out of the balance, and the day
 * after it was called late. A promise is now only what release 1.0 wrote, which is decision
 * 1 of 2.0.0, so the ones written since are made facts, and their day holds them back like
 * any other.
 *
 * Which release wrote a row is not stored. The moments this database took two migrations
 * are: the first of 1.1.0, and the one that marks 2.0.0. A promise written between the two
 * was written by 1.1.0, 1.2.0 or 1.2.1, and nothing written after the second is a promise
 * unless it came from somewhere else. A restore is somewhere else: it writes every row at
 * the moment of the restore, so a promise restored from a file is left as it is, because
 * nothing here can tell which release made the file. The overview lists those to be
 * answered in one go.
 *
 * Strictly between the two: a database whose clock never moved, which is the browser
 * tests, takes both at the same instant and so has nothing to repair.
 */
async function promisesOfOneOneToOneTwo(
	context: RepositoryContext,
	spaceId: string,
): Promise<number> {
	const from = await appliedAt(context, FIRST_OF_RELEASE_1_1_0);
	const to = await appliedAt(context, RELEASE_2_0_0);
	if (from === null || to === null || to <= from) return 0;

	const rows = await context.driver.all(
		`SELECT "id" FROM "transactions"
		 WHERE "space_id" = ? AND "status" = 'planned' AND "deleted_at" IS NULL
		   AND "created_at" > ? AND "created_at" < ?`,
		[spaceId, from, to],
	);
	for (const row of rows) {
		await updateRow(context.write(), {
			table: transactions,
			spaceId,
			id: String(row.id),
			values: { status: "settled" },
		});
	}
	return rows.length;
}

/**
 * Payments of the month screen written on a server with no invoice named.
 *
 * The route that writes a record dropped the field that names the invoice a payment pays,
 * so on a server the payment the month screen writes for a card arrived with none, and a
 * payment that names none pays the oldest invoice still owed rather than the month it was
 * written for. The mark it carries says which month that was, and the invoice of a month
 * written by that screen is the invoice named after the month.
 */
async function paymentsWithoutTheirInvoice(
	context: RepositoryContext,
	spaceId: string,
): Promise<number> {
	const rows = await context.driver.all(
		`SELECT t."id" AS id, t."external_id" AS mark
		 FROM "transactions" t
		 JOIN "accounts" a ON a."id" = t."counter_account_id"
		 WHERE t."space_id" = ? AND t."deleted_at" IS NULL AND t."kind" = 'transfer'
		   AND t."invoice_month" IS NULL AND a."kind" = 'credit'
		   AND t."external_id" LIKE 'mes:%'`,
		[spaceId],
	);
	let repaired = 0;
	for (const row of rows) {
		const mark = readMonthMark(String(row.mark));
		if (mark?.part !== "payment") continue;
		await updateRow(context.write(), {
			table: transactions,
			spaceId,
			id: String(row.id),
			values: { invoice_month: mark.month, invoice_month_by_hand: 1 },
		});
		repaired += 1;
	}
	return repaired;
}

async function repairSpace(context: RepositoryContext, spaceId: string): Promise<RepairOutcome> {
	return {
		spaceId,
		promisesMadeFacts: await promisesOfOneOneToOneTwo(context, spaceId),
		paymentsGivenTheirInvoice: await paymentsWithoutTheirInvoice(context, spaceId),
	};
}

export function createRepairsRepository(context: RepositoryContext) {
	return {
		/** Every repair, in one space. Changing what a space holds is for who may change it. */
		async run(spaceId: string): Promise<RepairOutcome> {
			assertCan(context.actor(), spaceId, "space.update");
			return repairSpace(context, spaceId);
		},

		/**
		 * Every space this person may change, and none of the others.
		 *
		 * What the application calls when it opens. A space this person only reads is left
		 * for somebody who may change it, which on a server is the server itself.
		 */
		async runEverywhere(): Promise<RepairOutcome[]> {
			const done: RepairOutcome[] = [];
			for (const membership of context.actor().memberships) {
				if (membership.state !== "active") continue;
				if (!context.can(membership.spaceId, "space.update")) continue;
				done.push(await repairSpace(context, membership.spaceId));
			}
			return done;
		},
	};
}

export type RepairsRepository = ReturnType<typeof createRepairsRepository>;
