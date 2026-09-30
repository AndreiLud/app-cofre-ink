// Carrying a database that already has money in it from one release to the next.
//
// The suite has always checked that the migrations end with the schema that is described,
// which is a check over an empty database. It says nothing about the one thing a release
// can actually break for somebody: their own file, written by the release before, opened
// by this one. Three of the migrations of 1.1.0 are exactly that risk. Two add columns
// that everything written before them has empty, and the third rewrites rows.
//
// So this builds the database as 1.0.5 left it, by running the migrations that release
// had and no more, fills it with the rows that release would have written, and then
// upgrades it for real and reads the whole thing back through the repositories of today.

import { describe, expect, it } from "vitest";
import type { Driver } from "../driver.ts";
import { migrate } from "../migrate.ts";
import { createUser } from "../repositories/users.ts";
import { openSession } from "../session.ts";
import type { AdapterUnderTest } from "./setup.ts";

/** The last migration release 1.0.5 carried. */
const AS_OF_105 = "0012_one_food_benefit";

/** Identifiers written by hand, because the rows are written by hand. */
const IDS = {
	space: "spaceOfAna",
	member: "memberAna",
	checking: "accountChecking",
	card: "accountCard",
	voucher: "accountVoucher",
	series: "recurrenceStreaming",
	subscription: "transactionSubscription",
	lunch: "transactionLunch",
	shopping: "transactionShopping",
};

/** The first of September 2026, in the timezone every one of these rows lives in. */
const WHEN = 1_788_264_000_000;

/**
 * The rows release 1.0.5 wrote, in its own shape.
 *
 * Written as SQL rather than through the repositories on purpose. The repositories of
 * today name the columns of today, so they cannot write into the database of a release
 * that did not have them, and it is the old shape that has to be tested.
 */
async function fillAsOf105(driver: Driver, userId: string): Promise<void> {
	const scope = (id: string) => [id, IDS.space, WHEN, WHEN, null, "stamp1"];

	await driver.run(
		`INSERT INTO "spaces" ("id", "kind", "name", "colour", "icon", "base_currency", "timezone",
		   "created_by", "created_at", "updated_at", "hlc")
		 VALUES (?, 'personal', 'Pessoal', 'clay', 'wallet', 'BRL', 'America/Sao_Paulo', ?, ?, ?, ?)`,
		[IDS.space, userId, WHEN, WHEN, "stamp1"],
	);

	await driver.run(
		`INSERT INTO "space_members" ("id", "space_id", "user_id", "role", "state", "accepted_at",
		   "created_at", "updated_at", "hlc")
		 VALUES (?, ?, ?, 'owner', 'active', ?, ?, ?, ?)`,
		[IDS.member, IDS.space, userId, WHEN, WHEN, WHEN, "stamp1"],
	);

	// A current account, a credit card with a cycle, and a meal voucher carrying what was
	// on it the day somebody wrote it down.
	const account = (
		id: string,
		kind: string,
		name: string,
		opening: number,
		closing: number | null,
		due: number | null,
		benefit: string | null,
	) =>
		driver.run(
			`INSERT INTO "accounts" ("id", "space_id", "kind", "name", "currency", "initial_balance",
			   "closing_day", "due_day", "benefit", "created_by", "created_at", "updated_at",
			   "deleted_at", "hlc")
			 VALUES (?, ?, ?, ?, 'BRL', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[id, IDS.space, kind, name, opening, closing, due, benefit, userId, ...scope(id).slice(2)],
		);

	await account(IDS.checking, "checking", "Conta", 250_000, null, null, null);
	await account(IDS.card, "credit", "Cartão", 0, 28, 5, null);
	await account(IDS.voucher, "voucher", "Vale refeição", 40_000, null, null, "meal");

	// A series that charges the card every month, which is the row migration 0015 repairs.
	await driver.run(
		`INSERT INTO "recurrences" ("id", "space_id", "description", "kind", "amount", "currency",
		   "account_id", "frequency", "interval_count", "day_of_month", "starts_on",
		   "created_by", "created_at", "updated_at", "deleted_at", "hlc")
		 VALUES (?, ?, 'Streaming', 'expense', 3990, 'BRL', ?, 'monthly', 1, 10, '2026-08-10', ?, ?, ?, ?, ?)`,
		[IDS.series, IDS.space, IDS.card, userId, WHEN, WHEN, null, "stamp1"],
	);

	const record = (
		id: string,
		accountId: string,
		amount: number,
		happenedOn: string,
		description: string,
		recurrenceId: string | null,
		invoiceMonth: string | null,
	) =>
		driver.run(
			`INSERT INTO "transactions" ("id", "space_id", "kind", "status", "amount", "currency",
			   "amount_in_base", "happened_on", "description", "account_id", "recurrence_id",
			   "invoice_month", "created_by", "created_at", "updated_at", "deleted_at", "hlc")
			 VALUES (?, ?, 'expense', 'settled', ?, 'BRL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				id,
				IDS.space,
				amount,
				amount,
				happenedOn,
				description,
				accountId,
				recurrenceId,
				invoiceMonth,
				userId,
				WHEN,
				WHEN,
				null,
				"stamp1",
			],
		);

	// What 1.0.5 wrote: a series on a card with no invoice on it at all, which is the bug
	// 0015 repairs, and an ordinary purchase on the same card that did reach one.
	await record(IDS.subscription, IDS.card, -3990, "2026-09-10", "Streaming", IDS.series, null);
	await record(IDS.shopping, IDS.card, -12_000, "2026-09-12", "Mercado", null, "2026-09");
	await record(IDS.lunch, IDS.voucher, -2500, "2026-09-11", "Almoço", null, null);
}

export function runUpgradeConformance(adapter: AdapterUnderTest): void {
	describe("a database written by the release before", () => {
		it("carries its rows across the upgrade and reads them all back", async () => {
			const driver = await adapter.open();
			try {
				// The database as 1.0.5 left it.
				const first = await migrate(driver, { stopAfter: AS_OF_105 });
				expect(first.at(-1)).toBe(AS_OF_105);
				expect(first).not.toContain("0013_benefit_quota");

				const ana = await createUser(driver, { email: "ana@exemplo.com", name: "Ana" });
				await fillAsOf105(driver, ana.id);

				// And the upgrade, for real: only the three that are new, in order, once.
				const ran = await migrate(driver);
				expect(ran).toEqual([
					"0013_benefit_quota",
					"0014_invoice_by_hand",
					"0015_subscriptions_reach_their_invoice",
				]);
				// Idempotent, which is what a device that syncs and then opens again does.
				expect(await migrate(driver)).toEqual([]);

				const session = await openSession({ driver, userId: ana.id, deviceId: "deviceAna" });

				// Every account is still there, and the two new answers about a voucher are
				// empty rather than invented.
				const accounts = await session.accounts.list(IDS.space);
				expect(accounts.map((account) => account.name).sort()).toEqual([
					"Cartão",
					"Conta",
					"Vale refeição",
				]);
				const voucher = accounts.find((account) => account.id === IDS.voucher);
				expect(voucher?.quotaAmount).toBeNull();
				expect(voucher?.quotaDay).toBeNull();
				// The opening balance is untouched, which is where the money that was already
				// on that card lives.
				expect(voucher?.initialBalance).toBe(40_000);

				// And nothing is invented from it. A card with no allowance written down has
				// no answer to what is left in a period, because the period is the allowance,
				// so it says nothing and the screen asks for one.
				expect(await session.accounts.benefitLeft(IDS.voucher, "2026-09-30")).toBeNull();

				// Once the allowance is filled in, which is what the screen asks for, the
				// opening balance is the starting point it was always meant to be: what was on
				// the card, plus the one landing since it was written down on the first, less
				// the lunch on the eleventh.
				await session.accounts.update(IDS.voucher, {
					quotaAmount: 60_000,
					quotaDay: 5,
					quotaCarries: true,
				});
				const left = await session.accounts.benefitLeft(IDS.voucher, "2026-09-30");
				expect(left?.landed).toBe(1);
				expect(left?.left).toBe(40_000 + 60_000 - 2500);

				// The subscription reached the invoice it belonged to all along. The tenth is
				// before the twenty eighth, so it is September's invoice.
				const records = await session.transactions.list({ spaceId: IDS.space });
				const subscription = records.find((row) => row.id === IDS.subscription);
				expect(subscription?.invoiceMonth).toBe("2026-09");
				// And it was not chosen by a person, so editing the record may still move it.
				expect(subscription?.invoiceMonthByHand).toBe(false);

				// The purchase that already had an invoice was left exactly as it was.
				expect(records.find((row) => row.id === IDS.shopping)?.invoiceMonth).toBe("2026-09");

				// The invoice adds both of them up, which is what the card was hiding before.
				const invoice = await session.invoices.get(IDS.card, "2026-09", "2026-09-30");
				expect(invoice.charged).toBe(3990 + 12_000);
				expect(invoice.paid).toBe(0);
				expect(invoice.left).toBe(3990 + 12_000);
				// Closes on the twenty eighth of September and falls due on the fifth of October.
				expect(invoice.closesOn).toBe("2026-09-28");
				expect(invoice.dueOn).toBe("2026-10-05");

				// The balances read, the money on hand is the current account, and the card is
				// a debt rather than a smaller balance.
				const balances = await session.transactions.balances(IDS.space, "2026-09-30");
				const of = (id: string) => balances.find((one) => one.accountId === id)?.settled;
				expect(of(IDS.checking)).toBe(250_000);
				expect(of(IDS.card)).toBe(-(3990 + 12_000));

				// And the months ahead open with the money and count the invoice in October.
				const ahead = await session.projections.monthsAhead({
					spaceId: IDS.space,
					from: "2026-09",
					months: 3,
					today: "2026-09-30",
				});
				expect(ahead.opening).toBe(250_000);
				expect(ahead.months[1]?.expenseFrom.written).toBe(3990 + 12_000);
			} finally {
				await driver.close();
			}
		});
	});
}
