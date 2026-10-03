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

import { invoiceMonthOf, parseCalendarMonth, readMonthMark } from "@cofre/core";
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
	/** Records naming the invoice of a month that does not exist, such as "2026-13". */
	impossibleMonthsCleared: number;
	/** Occurrences of a series on a card that releases before 1.1.0 wrote with no invoice. */
	seriesGivenTheirInvoice: number;
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

/**
 * A series charged to a card, written with no invoice.
 *
 * Releases before 1.1.0 never worked out which invoice an occurrence of a series belonged
 * to, so a subscription on a credit card was on no invoice and the card showed less than it
 * would charge. Migration 0015 put that right where the rows lie, and it did not last: the
 * change log still held each of those rows with no invoice, so a restore, the exchange
 * between devices and "keep theirs" wrote the empty invoice back. Written here, the stamp
 * is a change like any other, newer than the row it repairs.
 *
 * The rule is the one every other writer of the column uses, the closing day of the card
 * the record is charged to.
 */
async function seriesWithoutTheirInvoice(
	context: RepositoryContext,
	spaceId: string,
): Promise<number> {
	const rows = await context.driver.all(
		`SELECT t."id" AS id, t."happened_on" AS day, a."closing_day" AS closing_day,
		        a."due_day" AS due_day
		 FROM "transactions" t
		 JOIN "accounts" a ON a."id" = t."account_id"
		 WHERE t."space_id" = ? AND t."deleted_at" IS NULL AND t."invoice_month" IS NULL
		   AND t."recurrence_id" IS NOT NULL AND a."kind" = 'credit'
		   AND a."closing_day" IS NOT NULL AND a."due_day" IS NOT NULL`,
		[spaceId],
	);
	for (const row of rows) {
		await updateRow(context.write(), {
			table: transactions,
			spaceId,
			id: String(row.id),
			values: {
				invoice_month: invoiceMonthOf(String(row.day), {
					closingDay: asNumber(row.closing_day),
					dueDay: asNumber(row.due_day),
				}),
			},
		});
	}
	return rows.length;
}

/**
 * Invoices named after a month that does not exist.
 *
 * The route that pays an invoice took "2026-13" and wrote it, and from then on every reading
 * of an invoice in the space failed, because no invoice can be built for that month. Which
 * month was meant cannot be told, so the name is put back the way it is when nobody chose
 * one: a purchase on a card takes the invoice of its day, and a payment names none, which
 * pays the oldest invoice still owed.
 */
async function monthsThatDoNotExist(context: RepositoryContext, spaceId: string): Promise<number> {
	const rows = await context.driver.all(
		`SELECT t."id" AS id, t."invoice_month" AS month, t."happened_on" AS day,
		        a."kind" AS account_kind, a."closing_day" AS closing_day, a."due_day" AS due_day
		 FROM "transactions" t
		 JOIN "accounts" a ON a."id" = t."account_id"
		 WHERE t."space_id" = ? AND t."deleted_at" IS NULL AND t."invoice_month" IS NOT NULL`,
		[spaceId],
	);
	let cleared = 0;
	for (const row of rows) {
		if (isAMonth(String(row.month))) continue;
		const onTheCard =
			String(row.account_kind) === "credit" && row.closing_day !== null && row.due_day !== null;
		const month = onTheCard
			? invoiceMonthOf(String(row.day), {
					closingDay: asNumber(row.closing_day),
					dueDay: asNumber(row.due_day),
				})
			: null;
		await updateRow(context.write(), {
			table: transactions,
			spaceId,
			id: String(row.id),
			values: { invoice_month: month, invoice_month_by_hand: null },
		});
		cleared += 1;
	}
	return cleared;
}

function isAMonth(value: string): boolean {
	try {
		parseCalendarMonth(value);
		return true;
	} catch {
		return false;
	}
}

async function repairSpace(context: RepositoryContext, spaceId: string): Promise<RepairOutcome> {
	return {
		spaceId,
		promisesMadeFacts: await promisesOfOneOneToOneTwo(context, spaceId),
		paymentsGivenTheirInvoice: await paymentsWithoutTheirInvoice(context, spaceId),
		impossibleMonthsCleared: await monthsThatDoNotExist(context, spaceId),
		seriesGivenTheirInvoice: await seriesWithoutTheirInvoice(context, spaceId),
	};
}

/**
 * The repairs, after something wrote rows from somewhere else.
 *
 * A restore writes every row of the file at the moment of the restore, and the exchange
 * between devices and "keep theirs" write the rows of another log, so what a repair put right
 * can arrive again as it was before. Whoever just did that may change the space or they could
 * not have done it, and the repairs are asked again of each space it touched. A space this
 * person only reads is left for somebody who may change it.
 */
export async function repairAfterArrival(
	context: RepositoryContext,
	spaceIds: readonly string[],
): Promise<RepairOutcome[]> {
	const done: RepairOutcome[] = [];
	for (const spaceId of spaceIds) {
		if (!context.can(spaceId, "space.update")) continue;
		done.push(await repairSpace(context, spaceId));
	}
	return done;
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
		/**
		 * Every repair again, in the spaces rows just arrived in from somewhere else, which
		 * this person may change. What a copy kept elsewhere sends back is the rows as they
		 * were, so the repairs are asked again after it.
		 */
		async afterArrival(spaceIds: readonly string[]): Promise<RepairOutcome[]> {
			return repairAfterArrival(context, spaceIds);
		},

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
