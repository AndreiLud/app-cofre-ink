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

import { MIGRATIONS } from "@cofre/db";
import { describe, expect, it } from "vitest";
import type { Driver } from "../driver.ts";
import { migrate } from "../migrate.ts";
import { repairEverySpace } from "../repairEverySpace.ts";
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

				// And the upgrade, for real: only the ones that are new, in order, once, the three
				// of 1.1.0 first.
				const ran = await migrate(driver);
				expect(ran).toEqual(idsAfter(AS_OF_105));
				expect(ran.slice(0, 3)).toEqual([
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

		// Releases 1.1.0 to 1.2.1 wrote a record dated ahead, every occurrence of a series and
		// the payment of the month screen as promises, and nothing ever made one a fact. So a
		// database those releases wrote is full of promises called late that should have
		// counted on their day. Release 1.0 wrote promises as well, on purpose, and those stay.
		it("makes the promises 1.1.0 to 1.2.1 wrote facts, and keeps the ones of 1.0", async () => {
			const driver = await adapter.open();
			try {
				await migrate(driver, { stopAfter: AS_OF_105 });
				const ana = await createUser(driver, { email: "ana@exemplo.com", name: "Ana" });
				await fillAsOf105(driver, ana.id);
				// A promise of release 1.0, written on the first of September.
				await promiseAsWritten(driver, ana.id, {
					id: "promiseOf105",
					kind: "expense",
					amount: -18_000,
					happenedOn: "2026-09-05",
					description: "Conta de luz",
					accountId: IDS.checking,
					createdAt: WHEN,
				});

				// The database as 1.2.1 left it, upgraded to 1.1.0 on the second of September.
				await migrate(driver, { stopAfter: AS_OF_121 });
				await driver.run(
					`UPDATE "schema_migrations" SET "applied_at" = ? WHERE "id" IN (?, ?, ?)`,
					[WHEN + DAY, "0013_benefit_quota", "0014_invoice_by_hand", AS_OF_121],
				);

				// What 1.2.1 wrote as promises on the twentieth: a record dated ahead from the
				// form, the October occurrence of the series, and the payment of the month screen.
				const later = WHEN + 19 * DAY;
				await promiseAsWritten(driver, ana.id, {
					id: "promiseOfForm",
					kind: "expense",
					amount: -9_900,
					happenedOn: "2026-09-25",
					description: "Academia",
					accountId: IDS.checking,
					createdAt: later,
				});
				await promiseAsWritten(driver, ana.id, {
					id: "promiseOfSeries",
					kind: "expense",
					amount: -3990,
					happenedOn: "2026-10-10",
					description: "Streaming",
					accountId: IDS.card,
					recurrenceId: IDS.series,
					invoiceMonth: "2026-10",
					createdAt: later,
				});
				await promiseAsWritten(driver, ana.id, {
					id: "promiseOfPayment",
					kind: "transfer",
					amount: 15_990,
					happenedOn: "2026-10-05",
					description: "Pagamento da fatura",
					accountId: IDS.checking,
					counterAccountId: IDS.card,
					invoiceMonth: "2026-09",
					createdAt: later,
				});

				const ranTo200 = await migrate(driver);
				expect(ranTo200).toEqual(idsAfter(AS_OF_121));
				expect(ranTo200[0]).toBe("0016_release_2_0_0");

				const session = await openSession({ driver, userId: ana.id, deviceId: "deviceAna" });
				const done = await session.repairs.runEverywhere();
				expect(done).toEqual([
					{ spaceId: IDS.space, promisesMadeFacts: 3, paymentsGivenTheirInvoice: 0 },
				]);

				const records = await session.transactions.list({ spaceId: IDS.space });
				const status = (id: string) => records.find((row) => row.id === id)?.status;
				expect(status("promiseOfForm")).toBe("settled");
				expect(status("promiseOfSeries")).toBe("settled");
				expect(status("promiseOfPayment")).toBe("settled");
				expect(status("promiseOf105")).toBe("planned");

				// Written as a change, so a copy kept elsewhere and the other devices learn it,
				// and an older copy of the row arriving later does not undo it.
				const logged = await driver.all(
					`SELECT "entity_id" FROM "changes" WHERE "entity" = 'transactions'
					   AND "operation" = 'update' ORDER BY "entity_id"`,
				);
				expect(logged.map((row) => String(row.entity_id))).toEqual([
					"promiseOfForm",
					"promiseOfPayment",
					"promiseOfSeries",
				]);

				// The September invoice is paid on the fifth of October, by itself.
				const invoice = await session.invoices.get(IDS.card, "2026-09", "2026-10-05");
				expect(invoice.paid).toBe(15_990);
				expect(invoice.left).toBe(0);

				// The record of the twenty fifth counts on its day, and the promise of 1.0 is
				// still the one thing waiting for an answer.
				const balances = await session.transactions.balances(IDS.space, "2026-09-30");
				expect(balances.find((one) => one.accountId === IDS.checking)?.settled).toBe(
					250_000 - 9_900,
				);
				const late = await session.transactions.list({
					spaceId: IDS.space,
					status: "planned",
					to: "2026-09-30",
				});
				expect(late.map((row) => row.id)).toEqual(["promiseOf105"]);

				// And it does nothing the second time.
				expect(await session.repairs.runEverywhere()).toEqual([
					{ spaceId: IDS.space, promisesMadeFacts: 0, paymentsGivenTheirInvoice: 0 },
				]);
			} finally {
				await driver.close();
			}
		});

		// Part 1, A.4 of the request for 2.0.0. A card from release 1.0 carries the debt it had
		// the day it was written down as an opening balance, and the invoices never read it:
		// the payment that settled that debt, written by hand with no invoice named, paid the
		// newest purchases instead, and their invoice came out paid without having been.
		it("puts the debt a card was written down with on an invoice of its own", async () => {
			const driver = await adapter.open();
			try {
				await migrate(driver, { stopAfter: AS_OF_105 });
				const ana = await createUser(driver, { email: "ana@exemplo.com", name: "Ana" });
				await fillAsOf105(driver, ana.id);

				// Written down on the first of September owing 1,500, which a payment of 1,500 on
				// the fourth settled, and a purchase of 400 on the tenth since.
				const card = async (id: string, opening: number) =>
					driver.run(
						`INSERT INTO "accounts" ("id", "space_id", "kind", "name", "currency",
						   "initial_balance", "closing_day", "due_day", "created_by", "created_at",
						   "updated_at", "deleted_at", "hlc")
						 VALUES (?, ?, 'credit', ?, 'BRL', ?, 28, 5, ?, ?, ?, NULL, 'stamp1')`,
						[id, IDS.space, id, opening, ana.id, WHEN, WHEN],
					);
				await card("cardWithPayment", -150_000);
				await card("cardStillOwing", -50_000);
				await driver.run(
					`INSERT INTO "transactions" ("id", "space_id", "kind", "status", "amount", "currency",
					   "amount_in_base", "happened_on", "description", "account_id",
					   "counter_account_id", "created_by", "created_at", "updated_at", "hlc")
					 VALUES ('paymentByHand', ?, 'transfer', 'settled', 150000, 'BRL', 150000,
					   '2026-09-04', 'Pagamento do cartão', ?, 'cardWithPayment', ?, ?, ?, 'stamp1')`,
					[IDS.space, IDS.checking, ana.id, WHEN, WHEN],
				);
				await driver.run(
					`INSERT INTO "transactions" ("id", "space_id", "kind", "status", "amount", "currency",
					   "amount_in_base", "happened_on", "description", "account_id", "invoice_month",
					   "created_by", "created_at", "updated_at", "hlc")
					 VALUES ('purchase', ?, 'expense', 'settled', -40000, 'BRL', -40000, '2026-09-10',
					   'Mercado', 'cardWithPayment', '2026-09', ?, ?, ?, 'stamp1')`,
					[IDS.space, ana.id, WHEN, WHEN],
				);

				await migrate(driver);
				const session = await openSession({ driver, userId: ana.id, deviceId: "deviceAna" });

				// The debt is the invoice that had closed on the day the card was written down,
				// August's, and the payment by hand settled it. September's purchase is still owed.
				const invoices = await session.invoices.list("cardWithPayment", "2026-09-30");
				expect(
					invoices.map((one) => [one.month, one.charged, one.opening, one.paid, one.left]),
				).toEqual([
					["2026-08", 150_000, 150_000, 150_000, 0],
					["2026-09", 40_000, 0, 0, 40_000],
				]);

				// Which is what the balance of the card has said all along.
				const balances = await session.transactions.balances(IDS.space, "2026-09-30");
				expect(balances.find((one) => one.accountId === "cardWithPayment")?.settled).toBe(-40_000);

				// And a debt nobody paid is owed, in what falls due and in the months ahead.
				const standing = await session.invoices.standing(IDS.space, "2026-09-30");
				const owing = standing.find((one) => one.account.id === "cardStillOwing")?.owing;
				expect(owing?.map((one) => [one.month, one.left, one.late])).toEqual([
					["2026-08", 50_000, true],
				]);
				const ahead = await session.projections.monthsAhead({
					spaceId: IDS.space,
					from: "2026-10",
					months: 1,
					today: "2026-09-30",
				});
				// The debt still owed, September's purchase on the first card, and the invoice of
				// the card from the first test, all due by October.
				expect(ahead.months[0]?.expenseFrom.written).toBe(50_000 + 40_000 + 3990 + 12_000);
			} finally {
				await driver.close();
			}
		});

		// A server has nobody in front of it, so it repairs each space as its owner when it
		// starts, from a device that says it is the server.
		it("repairs every space on a server, as the owner of each", async () => {
			const driver = await adapter.open();
			try {
				await migrate(driver, { stopAfter: AS_OF_105 });
				const ana = await createUser(driver, { email: "ana@exemplo.com", name: "Ana" });
				await fillAsOf105(driver, ana.id);
				await migrate(driver, { stopAfter: AS_OF_121 });
				await driver.run(`UPDATE "schema_migrations" SET "applied_at" = ? WHERE "id" = ?`, [
					WHEN + DAY,
					"0013_benefit_quota",
				]);
				await promiseAsWritten(driver, ana.id, {
					id: "promiseOfForm",
					kind: "expense",
					amount: -9_900,
					happenedOn: "2026-09-25",
					description: "Academia",
					accountId: IDS.checking,
					createdAt: WHEN + 19 * DAY,
				});
				await migrate(driver);

				expect(await repairEverySpace(driver)).toEqual([
					{ spaceId: IDS.space, promisesMadeFacts: 1, paymentsGivenTheirInvoice: 0 },
				]);
				const logged = await driver.all(
					`SELECT "device_id", "actor_id" FROM "changes" WHERE "entity_id" = 'promiseOfForm'`,
				);
				expect(logged).toEqual([{ device_id: "server", actor_id: ana.id }]);
				expect(await repairEverySpace(driver)).toEqual([
					{ spaceId: IDS.space, promisesMadeFacts: 0, paymentsGivenTheirInvoice: 0 },
				]);
			} finally {
				await driver.close();
			}
		});
	});
}

/** The last migration release 1.2.1 carried. */
const AS_OF_121 = "0015_subscriptions_reach_their_invoice";

/** Every migration after one, in order, which is what upgrading from it runs. */
function idsAfter(id: string): string[] {
	const all = MIGRATIONS.map((migration) => migration.id);
	return all.slice(all.indexOf(id) + 1);
}

const DAY = 24 * 60 * 60 * 1000;

/** A promise written by hand in the shape 1.2.1 left, which has the invoice columns. */
async function promiseAsWritten(
	driver: Driver,
	userId: string,
	row: {
		id: string;
		kind: "expense" | "transfer";
		amount: number;
		happenedOn: string;
		description: string;
		accountId: string;
		counterAccountId?: string;
		recurrenceId?: string;
		invoiceMonth?: string;
		createdAt: number;
	},
): Promise<void> {
	await driver.run(
		`INSERT INTO "transactions" ("id", "space_id", "kind", "status", "amount", "currency",
		   "amount_in_base", "happened_on", "description", "account_id", "counter_account_id",
		   "recurrence_id", "invoice_month", "created_by", "created_at", "updated_at",
		   "deleted_at", "hlc")
		 VALUES (?, ?, ?, 'planned', ?, 'BRL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			row.id,
			IDS.space,
			row.kind,
			row.amount,
			row.amount,
			row.happenedOn,
			row.description,
			row.accountId,
			row.counterAccountId ?? null,
			row.recurrenceId ?? null,
			row.invoiceMonth ?? null,
			userId,
			row.createdAt,
			row.createdAt,
			null,
			"stamp1",
		],
	);
}
