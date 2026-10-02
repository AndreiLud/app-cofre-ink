// A card invoice, as a thing with a state rather than a filter over records.
//
// Before this, an invoice was every record stamped with a month, added up. That answers
// what was spent and not whether it was paid, which is the question somebody has in front
// of a card, and it is why the money left the accounts on the day of the purchase instead
// of on the day the invoice was paid.
//
// A payment is an ordinary transfer into the card account, marked with the invoice it
// pays. Nothing new is stored about invoices themselves: which month an invoice is, and
// what it charged, were always in the records, and what is added is only the other half
// of the subtraction.

import {
	type CalendarDate,
	type CalendarMonth,
	type CardCycle,
	compareCalendarDates,
	type InvoiceState,
	invoiceMonthOf,
	invoiceStateOf,
	limitLeftOf,
} from "@cofre/core";
import { assertCan, seesOwnRowsOnly } from "../actor.ts";
import { asNumber } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import type { Account, Transaction } from "../models.ts";
import type { AccountsRepository } from "./accounts.ts";
import type { RepositoryContext } from "./context.ts";
import type { TransactionsRepository } from "./transactions.ts";

/** One card, and where its invoices stand today. */
export type CardStanding = {
	account: Account;
	/** The invoice still taking purchases. */
	open: InvoiceState;
	/**
	 * Every invoice that has closed and is still owed, oldest first.
	 *
	 * A list and not one invoice. It used to answer with the newest only, so a household two
	 * invoices behind saw one of them, while the headroom of the card took both off: the two
	 * figures on the same screen disagreed, and the one that was invisible was the older debt.
	 */
	owing: InvoiceState[];
	/**
	 * The newest of those, when there is one.
	 *
	 * Kept beside the list because the question "and the one before this" is a question a
	 * card screen asks, and because the newest is the one most likely to be a surprise.
	 */
	unpaid: InvoiceState | null;
	/** What is charged to invoices after the open one, which is instalments still to come. */
	later: number;
	/** The limit less what is charged and not yet paid, when a limit is written down. */
	available: number | null;
};

function cycleOf(account: Account): CardCycle | undefined {
	if (account.kind !== "credit") return undefined;
	if (account.closingDay === null || account.dueDay === null) return undefined;
	return { closingDay: account.closingDay, dueDay: account.dueDay };
}

export type InvoicesNeeds = {
	accounts: AccountsRepository;
	transactions: TransactionsRepository;
};

export function createInvoicesRepository(context: RepositoryContext, needs: InvoicesNeeds) {
	/**
	 * What each invoice of one card charged and what has been paid against it.
	 *
	 * Two sums over the same table. What was charged is every record whose account is the
	 * card, which is how a purchase reaches an invoice; what was paid is every transfer
	 * whose destination is the card and which names the invoice it pays.
	 */
	async function sums(
		accountId: string,
	): Promise<Map<CalendarMonth, { charged: number; paid: number }>> {
		const rows = await context.driver.all(
			`SELECT "invoice_month" AS month,
			   COALESCE(SUM(CASE WHEN "account_id" = ? THEN -"amount" ELSE 0 END), 0) AS charged,
			   COALESCE(SUM(CASE WHEN "counter_account_id" = ? THEN "amount" ELSE 0 END), 0) AS paid
			 FROM "transactions"
			 WHERE "deleted_at" IS NULL AND "invoice_month" IS NOT NULL
			   AND ("account_id" = ? OR "counter_account_id" = ?)
			 GROUP BY "invoice_month"`,
			[accountId, accountId, accountId, accountId],
		);

		const found = new Map<CalendarMonth, { charged: number; paid: number }>();
		for (const row of rows) {
			found.set(String(row.month), {
				charged: asNumber(row.charged),
				paid: asNumber(row.paid),
			});
		}
		return found;
	}

	/** A transfer into the card that names no invoice, oldest first. */
	async function unmarkedPayments(accountId: string): Promise<Transaction[]> {
		const rows = await context.driver.all(
			`SELECT "id", "amount", "happened_on" FROM "transactions"
			 WHERE "counter_account_id" = ? AND "deleted_at" IS NULL AND "kind" = 'transfer'
			   AND "invoice_month" IS NULL
			 ORDER BY "happened_on", "created_at"`,
			[accountId],
		);
		return rows as unknown as Transaction[];
	}

	async function cardAccount(accountId: string): Promise<{ account: Account; cycle: CardCycle }> {
		const account = await needs.accounts.get(accountId);
		const cycle = cycleOf(account);
		if (!cycle) {
			throw new RuleError(
				"notACardWithACycle",
				"an invoice belongs to a credit card that has a closing day and a due day",
			);
		}
		return { account, cycle };
	}

	/**
	 * An invoice is the card's, so it closes to somebody who only sees their own records.
	 *
	 * Every sum in this file is over every purchase on the card whoever wrote it, which is
	 * what an invoice is: the bank does not send one per person. Narrowing it would produce a
	 * number that is not the invoice and not anything else, and leaving it whole reads the
	 * household's spending to somebody who may not see it. `standing` said so from the start
	 * and refused; the rest of the file asked only for `transaction.read`, which every role
	 * holds, so a logger read the real bill above a list holding one purchase of their own,
	 * with a button offering to pay it.
	 */
	function refuseIfNarrowed(spaceId: string): void {
		if (!seesOwnRowsOnly(context.actor(), spaceId)) return;
		throw new RuleError(
			"invoiceBelongsToTheCard",
			"an invoice is the whole of what the card will charge, so it is not read one person at a time",
		);
	}

	/**
	 * Every invoice of one card that has anything on it, oldest first.
	 *
	 * A payment with no invoice named on it, which is what a transfer made by hand or
	 * brought in from a statement is, pays down the oldest invoice still owing. That is
	 * what a bank does with an unexplained payment and it is the only answer that does not
	 * ask somebody to remember which month they meant.
	 */
	async function statesOf(accountId: string, today: CalendarDate): Promise<InvoiceState[]> {
		const { account, cycle } = await cardAccount(accountId);
		const totals = await sums(account.id);

		let loose = 0;
		for (const payment of await unmarkedPayments(account.id)) {
			loose += asNumber((payment as unknown as { amount: number }).amount);
		}

		const months = [...totals.keys()].sort();
		const states: InvoiceState[] = [];
		for (const month of months) {
			const sum = totals.get(month) ?? { charged: 0, paid: 0 };
			let paid = sum.paid;
			if (loose > 0) {
				const owed = Math.max(0, sum.charged - paid);
				const used = Math.min(loose, owed);
				paid += used;
				loose -= used;
			}
			states.push(invoiceStateOf({ month, cycle, charged: sum.charged, paid, today }));
		}
		return states;
	}

	return {
		/** Every invoice of one card, oldest first. */
		async list(accountId: string, today: CalendarDate): Promise<InvoiceState[]> {
			const account = await needs.accounts.get(accountId);
			assertCan(context.actor(), account.spaceId, "transaction.read");
			refuseIfNarrowed(account.spaceId);
			return statesOf(accountId, today);
		},

		/** One invoice of one card, whether or not anything is on it. */
		async get(accountId: string, month: CalendarMonth, today: CalendarDate): Promise<InvoiceState> {
			const account = await needs.accounts.get(accountId);
			assertCan(context.actor(), account.spaceId, "transaction.read");
			refuseIfNarrowed(account.spaceId);
			const { cycle } = await cardAccount(accountId);
			const states = await statesOf(accountId, today);
			return (
				states.find((state) => state.month === month) ??
				invoiceStateOf({ month, cycle, charged: 0, paid: 0, today })
			);
		},

		/**
		 * Where every card of a space stands today.
		 *
		 * Nothing comes back for somebody who only sees their own records: an invoice built
		 * from one person's purchases is not the invoice, and a button that pays it would
		 * be paying a number that is not the card's.
		 */
		async standing(spaceId: string, today: CalendarDate): Promise<CardStanding[]> {
			assertCan(context.actor(), spaceId, "transaction.read");
			if (seesOwnRowsOnly(context.actor(), spaceId)) return [];

			const accounts = await needs.accounts.list(spaceId);
			const cards = accounts.filter((account) => cycleOf(account) !== undefined);

			const standing: CardStanding[] = [];
			for (const account of cards) {
				const cycle = cycleOf(account);
				if (!cycle) continue;
				const states = await statesOf(account.id, today);
				const openMonth = invoiceMonthOf(today, cycle);

				const open =
					states.find((state) => state.month === openMonth) ??
					invoiceStateOf({ month: openMonth, cycle, charged: 0, paid: 0, today });

				const owing = states.filter(
					(state) => state.closed && state.left > 0 && state.month !== openMonth,
				);
				const unpaid = owing[owing.length - 1] ?? null;

				const later = states
					.filter((state) => state.month > openMonth)
					.reduce((total, state) => total + state.charged, 0);

				standing.push({
					account,
					open,
					owing,
					unpaid,
					later,
					// The headroom is counted in one place, which is the core, because the invoice
					// screen asks the same question about the same card and two subtractions in
					// two packages are how two screens come to disagree.
					available: limitLeftOf({ creditLimit: account.creditLimit, states, openMonth }),
				});
			}
			return standing;
		},

		/**
		 * Paying an invoice, which is a transfer into the card marked with what it pays.
		 *
		 * The amount is what somebody types and not what the invoice says, because paying
		 * part of one is a thing people do and the card does not refuse it. What is left
		 * stays on that invoice, with no interest added: this application does not model
		 * revolving credit and says so on the screen rather than inventing a number.
		 */
		async pay(input: {
			accountId: string;
			fromAccountId: string;
			amount: number;
			happenedOn: CalendarDate;
			month: CalendarMonth;
			/**
			 * What the record is called.
			 *
			 * Passed in rather than written here, because this package holds no copy and has
			 * no language: a record the application writes has to read in the language the
			 * person chose, and the screen is what knows which that is.
			 */
			description: string;
		}): Promise<Transaction> {
			const { account } = await cardAccount(input.accountId);
			assertCan(context.actor(), account.spaceId, "transaction.create");
			refuseIfNarrowed(account.spaceId);

			if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
				throw new RuleError("amountIsPositiveInteger", "paying an invoice is a positive amount");
			}

			const [written] = await needs.transactions.create({
				spaceId: account.spaceId,
				kind: "transfer",
				amount: input.amount,
				happenedOn: input.happenedOn,
				description: input.description,
				accountId: input.fromAccountId,
				counterAccountId: input.accountId,
				invoiceMonth: input.month,
			});
			if (!written) throw new NotFoundError("transaction", input.month);
			return written;
		},

		/**
		 * Marking every invoice up to a month as paid, in one action.
		 *
		 * Somebody who has been using this since before invoices had a state has every
		 * invoice they ever had sitting open, and asking them to pay each one by hand to
		 * say so would be asking them to write down money that already moved years ago. So
		 * this writes one payment per open invoice, dated on the day that invoice fell due,
		 * out of the account they name.
		 */
		async markPaidUntil(input: {
			accountId: string;
			month: CalendarMonth;
			fromAccountId: string;
			today: CalendarDate;
			/**
			 * What each record is called, with `{{month}}` where the month goes.
			 *
			 * A pattern and not a function, because in server mode this call is an HTTP
			 * request and a function does not travel. Same reason as the one above: this
			 * package holds no copy and the screen is what knows the language.
			 */
			description: string;
		}): Promise<number> {
			const { account } = await cardAccount(input.accountId);
			assertCan(context.actor(), account.spaceId, "transaction.create");
			refuseIfNarrowed(account.spaceId);

			const states = await statesOf(input.accountId, input.today);
			const owing = states.filter((state) => state.month <= input.month && state.left > 0);

			for (const state of owing) {
				await needs.transactions.create({
					spaceId: account.spaceId,
					kind: "transfer",
					amount: state.left,
					happenedOn: state.dueOn,
					description: input.description.replace("{{month}}", state.month),
					accountId: input.fromAccountId,
					counterAccountId: input.accountId,
					invoiceMonth: state.month,
				});
			}
			return owing.length;
		},

		/**
		 * Moving a purchase to the invoice before or after the one it landed on.
		 *
		 * The bank closes a day either side of the day this application expected, because
		 * of a weekend or a holiday or a change nobody announced, and the purchase lands on
		 * the wrong invoice. Once moved it stays moved: correcting the closing day of the
		 * account afterwards does not drag it back.
		 *
		 * Every part of a purchase in instalments moves with it, one invoice in the same
		 * direction, because they are one purchase and the bank moved the whole of it.
		 */
		async move(id: string, towards: "earlier" | "later"): Promise<number> {
			const record = await needs.transactions.get(id);
			assertCan(context.actor(), record.spaceId, "transaction.update");
			refuseIfNarrowed(record.spaceId);
			if (record.invoiceMonth === null) {
				throw new RuleError(
					"notOnAnInvoice",
					"only a record that is on an invoice can be moved to another one",
				);
			}

			const parts = record.installmentGroup
				? await needs.transactions.list({
						spaceId: record.spaceId,
						installmentGroup: record.installmentGroup,
					})
				: [record];

			// Every part of the plan or none of it, which is what makes this a correction
			// rather than a thing to be finished by hand afterwards.
			const step = towards === "earlier" ? -1 : 1;
			return needs.transactions.setInvoiceMonths(
				parts
					.filter((part) => part.invoiceMonth !== null)
					.map((part) => ({ id: part.id, month: shiftMonth(part.invoiceMonth ?? "", step) })),
			);
		},

		/**
		 * Saying which day an invoice actually closed on.
		 *
		 * Everything charged between the day the application expected it to close and the
		 * day it really did belongs to the other invoice, and this moves all of them at
		 * once rather than asking somebody to find them.
		 */
		async closedOn(input: {
			accountId: string;
			month: CalendarMonth;
			day: CalendarDate;
		}): Promise<number> {
			const { account, cycle } = await cardAccount(input.accountId);
			assertCan(context.actor(), account.spaceId, "transaction.update");
			refuseIfNarrowed(account.spaceId);

			const expected = invoiceStateOf({
				month: input.month,
				cycle,
				charged: 0,
				paid: 0,
				today: input.day,
			}).closesOn;
			if (input.day === expected) return 0;

			// The days between the two, whichever way round they are, and which invoice the
			// records on them belong to. Closing later than expected pulls purchases back
			// onto this invoice; closing earlier pushes them onto the next one.
			const earlier = compareCalendarDates(input.day, expected) < 0;
			const from = earlier ? input.day : expected;
			const to = earlier ? expected : input.day;

			const rows = await context.driver.all(
				`SELECT "id", "invoice_month" FROM "transactions"
				 WHERE "account_id" = ? AND "deleted_at" IS NULL AND "kind" <> 'transfer'
				   AND "happened_on" >= ? AND "happened_on" < ?`,
				[input.accountId, from, to],
			);

			// All of them or none of them. One purchase in the window already ticked off
			// against the bank used to move the ones before it and then refuse, which leaves
			// a card's own month split between two invoices with nothing saying how far it got.
			const wanted = earlier ? shiftMonth(input.month, 1) : input.month;
			return needs.transactions.setInvoiceMonths(
				rows
					.filter((row) => String(row.invoice_month) !== wanted)
					.map((row) => ({ id: String(row.id), month: wanted })),
			);
		},
	};
}

/** One month forwards or backwards, on the calendar month a card invoice is named by. */
function shiftMonth(month: CalendarMonth, step: number): CalendarMonth {
	const [year, index] = month.split("-").map(Number);
	const total = (year ?? 0) * 12 + (index ?? 1) - 1 + step;
	const shiftedYear = Math.floor(total / 12);
	const shiftedMonth = total - shiftedYear * 12 + 1;
	return `${String(shiftedYear).padStart(4, "0")}-${String(shiftedMonth).padStart(2, "0")}`;
}

export type InvoicesRepository = ReturnType<typeof createInvoicesRepository>;
