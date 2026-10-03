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
	addMonthsToMonth,
	amountToPay,
	type CalendarDate,
	type CalendarMonth,
	type CardCycle,
	compareCalendarDates,
	daysBetween,
	type InvoiceState,
	invoiceMonthOf,
	invoiceStateOf,
	invoicesInTurn,
	limitLeftOf,
	parseCalendarDate,
	parseCalendarMonth,
	todayIn,
} from "@cofre/core";
import { assertCan, seesOwnRowsOnly } from "../actor.ts";
import { asNumber } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { happenedBy, stillToComeOn } from "../happened.ts";
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
	/**
	 * The limit less what is charged and not yet paid, when a limit is written down.
	 *
	 * Nothing when the card's account is in another currency than the space counts in. The
	 * limit is a figure in the account's currency and what is owed is now a figure in the
	 * currency of the space, and the stored rate of a record converts one way only, to the
	 * base currency, so there is no honest subtraction between the two.
	 */
	available: number | null;
	/** Why there is no headroom, when there is a limit and no figure. */
	limitInAnotherCurrency: boolean;
	/**
	 * A card from before 2.0.0 written down without the day it closes or the day it falls due,
	 * which has no invoices to show. Its open invoice is an empty one dated today, so the card
	 * still sorts and adds up as a card with nothing on it, and the screen says what to fill in.
	 */
	cycleMissing: boolean;
};

/** An invoice with nothing on it, closing and falling due today, for a card with no cycle. */
function nothingOn(today: CalendarDate): InvoiceState {
	return {
		month: today.slice(0, 7) as CalendarMonth,
		from: today,
		to: today,
		closesOn: today,
		dueOn: today,
		charged: 0,
		paid: 0,
		scheduled: 0,
		scheduledOn: null,
		opening: 0,
		carriedIn: 0,
		carriedOut: 0,
		left: 0,
		standing: "open",
		closed: false,
		daysToClose: 0,
		daysToDue: 0,
		late: false,
		inOtherCurrencies: 0,
		withoutRate: 0,
	};
}

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
	/** The currency a space counts in, which is the one every total here is summed in. */
	async function baseCurrencyOf(spaceId: string): Promise<string> {
		const rows = await context.driver.all(
			`SELECT "base_currency" FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
			[spaceId],
		);
		return String(rows[0]?.base_currency ?? "BRL");
	}

	async function timezoneOf(spaceId: string): Promise<string> {
		const rows = await context.driver.all(
			`SELECT "timezone" FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
			[spaceId],
		);
		return String(rows[0]?.timezone ?? "America/Sao_Paulo");
	}

	/**
	 * The debt a card already had when it was written down, as an invoice of its own.
	 *
	 * A card from release 1.0 carries what it owed that day as an opening balance, and
	 * nothing in this file read it: the balance of the card counted the debt while the
	 * invoices, and everything made from them, did not. Worse, the payment that settled that
	 * debt, written by hand with no invoice named, paid down the oldest invoice there was
	 * instead, so recent invoices came out paid without having been.
	 *
	 * So the opening balance is an invoice, closed and owed: the last one that had closed on
	 * the day the card was written down, which is the one that debt was on. It is the first
	 * thing a payment with no invoice named pays down. A positive opening balance is money
	 * the card held in its favour, which is an invoice in credit.
	 */
	async function openingOf(
		account: Account,
		cycle: CardCycle,
		baseCurrency: string,
	): Promise<{ month: CalendarMonth; amount: number; withoutRate: number } | null> {
		if (account.initialBalance === 0) return null;
		const writtenOn = todayIn(await timezoneOf(account.spaceId), new Date(account.createdAt));
		return {
			month: addMonthsToMonth(invoiceMonthOf(writtenOn, cycle), -1),
			amount: -account.initialBalance,
			// An opening balance in another currency has no rate stored with it, so the invoice
			// it opens says it does not know rather than adding minor units of two currencies.
			withoutRate: account.currency === baseCurrency ? 0 : 1,
		};
	}

	type InvoiceSum = {
		charged: number;
		paid: number;
		scheduled: number;
		scheduledOn: CalendarDate | null;
		inOtherCurrencies: number;
		withoutRate: number;
	};

	/**
	 * What each invoice of one card charged and what has been paid against it.
	 *
	 * Two sums over the same table. What was charged is every record whose account is the
	 * card, which is how a purchase reaches an invoice; what was paid is every transfer
	 * whose destination is the card and which names the invoice it pays.
	 *
	 * Both in the currency of the space, from the figure worked out at the rate of the day
	 * each purchase was written. It used to sum the amount as written, so a dinner of forty
	 * dollars and a market of a hundred reais came back as fourteen thousand, a number in no
	 * currency at all, and the screens labelled it with whatever currency the card's account
	 * carried. Worse, the overview adds that figure to a total in the currency of the space
	 * and hands the result to what is left to spend this month.
	 *
	 * The two counts are how an invoice can say it does not know. A record in another currency
	 * with no rate written down has no honest figure in the base currency, and a total that
	 * silently leaves it out is worse than no total.
	 *
	 * A payment pays from its own day, by the one rule for what has happened. Before that it
	 * is scheduled: the money is still in the bank, so the invoice is still owed. Every
	 * transfer into the card counted at once, whatever its day, and paying on the due day,
	 * which is what the payment dialog suggests, took the invoice off what falls due a week
	 * before the bank lost the money.
	 *
	 * A transfer that leaves the card is a purchase on it, with the sign of a purchase, which
	 * is decision 2 of 2.0.0. It was added the other way round, so taking 500 out of a credit
	 * card made its invoice 500 smaller and its limit 500 larger while the balance of the
	 * card owed 500 more. And a transfer that arrives from another card is not a payment of
	 * the invoice its row names, because that invoice is the one of the card it left, so it
	 * is a payment with no invoice named, like one written by hand.
	 */
	async function sums(
		accountId: string,
		baseCurrency: string,
		today: CalendarDate,
		asItStood: boolean,
	): Promise<Map<CalendarMonth, InvoiceSum>> {
		const payment = `t."counter_account_id" = ? AND COALESCE(src."kind", '') <> 'credit'`;
		// As it stood on a day that has gone, only what existed by then: a record whose day had
		// come, and every part of a purchase in parts whose first part had, because the bank
		// puts the whole plan on the card the day of the purchase. A payment dated later had
		// not been made, so it is neither paid nor scheduled.
		const stood = asItStood
			? `AND (CASE WHEN t."installment_group" IS NULL THEN t."happened_on"
			     ELSE (SELECT MIN(p."happened_on") FROM "transactions" p
			           WHERE p."installment_group" = t."installment_group" AND p."deleted_at" IS NULL)
			     END) <= ?`
			: "";
		const rows = await context.driver.all(
			`SELECT t."invoice_month" AS month,
			   COALESCE(SUM(CASE WHEN t."account_id" = ?
			     THEN CASE WHEN t."kind" = 'transfer' THEN t."amount_in_base" ELSE -t."amount_in_base" END
			     ELSE 0 END), 0) AS charged,
			   COALESCE(SUM(CASE WHEN ${payment} AND ${happenedBy("t")}
			     THEN t."amount_in_base" ELSE 0 END), 0) AS paid,
			   COALESCE(SUM(CASE WHEN ${payment} AND ${stillToComeOn("t")}
			     THEN t."amount_in_base" ELSE 0 END), 0) AS scheduled,
			   MAX(CASE WHEN ${payment} AND ${stillToComeOn("t")}
			     THEN t."happened_on" ELSE NULL END) AS scheduled_on,
			   COALESCE(SUM(CASE WHEN t."currency" <> ? THEN 1 ELSE 0 END), 0) AS in_other_currencies,
			   COALESCE(SUM(CASE WHEN t."currency" <> ? AND t."fx_rate" IS NULL THEN 1 ELSE 0 END), 0)
			     AS without_rate
			 FROM "transactions" t
			 LEFT JOIN "accounts" src ON src."id" = t."account_id"
			 WHERE t."deleted_at" IS NULL AND t."invoice_month" IS NOT NULL
			   AND (t."account_id" = ? OR ${payment})
			   ${stood}
			 GROUP BY t."invoice_month"`,
			[
				accountId,
				accountId,
				today,
				accountId,
				today,
				accountId,
				today,
				baseCurrency,
				baseCurrency,
				accountId,
				accountId,
				...(asItStood ? [today] : []),
			],
		);

		const found = new Map<CalendarMonth, InvoiceSum>();
		for (const row of rows) {
			found.set(String(row.month), {
				charged: asNumber(row.charged),
				paid: asNumber(row.paid),
				scheduled: asNumber(row.scheduled),
				scheduledOn:
					row.scheduled_on === null || row.scheduled_on === undefined
						? null
						: String(row.scheduled_on),
				inOtherCurrencies: asNumber(row.in_other_currencies),
				withoutRate: asNumber(row.without_rate),
			});
		}
		return found;
	}

	/**
	 * A transfer into the card that names no invoice, oldest first, once its day has come.
	 * Until then it is money still in the bank, and it pays nothing down.
	 *
	 * A transfer from another card names an invoice, and it is the invoice of the card it
	 * left, so for this card it names none.
	 */
	async function unmarkedPayments(accountId: string, today: CalendarDate): Promise<Transaction[]> {
		const rows = await context.driver.all(
			// In the currency of the space, like the sums it pays down.
			`SELECT t."id", t."amount_in_base" AS "amount", t."happened_on" FROM "transactions" t
			 LEFT JOIN "accounts" src ON src."id" = t."account_id"
			 WHERE t."counter_account_id" = ? AND t."deleted_at" IS NULL AND t."kind" = 'transfer'
			   AND (t."invoice_month" IS NULL OR COALESCE(src."kind", '') = 'credit')
			   AND ${happenedBy("t")}
			 ORDER BY t."happened_on", t."created_at"`,
			[accountId, today],
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
	 * ask somebody to remember which month they meant. The debt the card was written down
	 * with comes before every other, because it is older than anything charged since.
	 */
	async function statesOf(
		accountId: string,
		today: CalendarDate,
		asItStood = false,
	): Promise<InvoiceState[]> {
		const { account, cycle } = await cardAccount(accountId);
		const baseCurrency = await baseCurrencyOf(account.spaceId);
		const totals = await sums(account.id, baseCurrency, today, asItStood);

		const opening = await openingOf(account, cycle, baseCurrency);
		if (opening) {
			const sum = totals.get(opening.month) ?? emptySum();
			totals.set(opening.month, {
				...sum,
				charged: sum.charged + opening.amount,
				withoutRate: sum.withoutRate + opening.withoutRate,
			});
		}

		let loose = 0;
		for (const payment of await unmarkedPayments(account.id, today)) {
			loose += asNumber((payment as unknown as { amount: number }).amount);
		}

		const months = [...totals.keys()].sort();
		const inTurn = opening
			? [opening.month, ...months.filter((month) => month !== opening.month)]
			: months;
		const paidOf = new Map<CalendarMonth, number>();
		for (const month of inTurn) {
			const sum = totals.get(month) ?? emptySum();
			let paid = sum.paid;
			if (loose > 0) {
				const owed = Math.max(0, sum.charged - paid);
				const used = Math.min(loose, owed);
				paid += used;
				loose -= used;
			}
			paidOf.set(month, paid);
		}
		// More paid with no invoice named than every invoice owes is credit, like any other
		// payment beyond what was charged, and it was simply dropped.
		const last = months.at(-1);
		if (loose > 0 && last !== undefined) paidOf.set(last, (paidOf.get(last) ?? 0) + loose);

		// What was paid too much on one invoice pays the next, which the core works out for
		// the whole card at once.
		return invoicesInTurn(
			months.map((month) => {
				const sum = totals.get(month) ?? emptySum();
				return {
					month,
					cycle,
					charged: sum.charged,
					paid: paidOf.get(month) ?? sum.paid,
					scheduled: sum.scheduled,
					scheduledOn: sum.scheduledOn,
					opening: opening?.month === month ? opening.amount : 0,
					today,
					inOtherCurrencies: sum.inOtherCurrencies,
					withoutRate: sum.withoutRate,
				};
			}),
		);
	}

	function emptySum(): InvoiceSum {
		return {
			charged: 0,
			paid: 0,
			scheduled: 0,
			scheduledOn: null,
			inOtherCurrencies: 0,
			withoutRate: 0,
		};
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
			parseCalendarMonth(month);
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
		async standing(
			spaceId: string,
			today: CalendarDate,
			options: { asItStood?: boolean } = {},
		): Promise<CardStanding[]> {
			assertCan(context.actor(), spaceId, "transaction.read");
			if (seesOwnRowsOnly(context.actor(), spaceId)) return [];
			const asItStood = options.asItStood === true;

			// The archived ones too: a card put away with its last invoice still owed vanished
			// from the overview, the months ahead and the invoices while the bank still wanted it.
			const accounts = await needs.accounts.list(spaceId, { includeArchived: true });
			const cards = accounts.filter((account) => account.kind === "credit");
			const baseCurrency = await baseCurrencyOf(spaceId);
			const zone = asItStood ? await timezoneOf(spaceId) : "";
			const dayOf = (instant: number) => todayIn(zone, new Date(instant));

			const standing: CardStanding[] = [];
			for (const original of cards) {
				// As it stood, a card put away after the day was still in use on it.
				const account =
					asItStood && original.archivedAt !== null && dayOf(original.archivedAt) > today
						? { ...original, archivedAt: null }
						: original;
				const cycle = cycleOf(account);
				// A card from before 2.0.0 written without its two days has no invoices to show,
				// and it used to vanish with nothing said. It comes back marked, with nothing on
				// it, for the screen to say what is missing.
				if (!cycle) {
					if (account.archivedAt !== null) continue;
					standing.push({
						account,
						open: nothingOn(today),
						owing: [],
						unpaid: null,
						later: 0,
						available: null,
						limitInAnotherCurrency: false,
						cycleMissing: true,
					});
					continue;
				}
				const states = await statesOf(account.id, today, asItStood);
				// Archived, it stays only while something on it is still owed, the debt it was
				// written down with included.
				if (account.archivedAt !== null && !states.some((state) => state.left > 0)) continue;
				// As it stood, a card written down after the day with nothing on it by then did not
				// exist yet. It came out as an open invoice of nought, as if it had been in the wallet.
				if (
					asItStood &&
					dayOf(account.createdAt) > today &&
					states.every((state) => state.charged === 0 && state.paid === 0)
				) {
					continue;
				}
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

				const limitComparable = account.currency === baseCurrency;
				standing.push({
					account,
					open,
					owing,
					unpaid,
					later,
					// The headroom is counted in one place, which is the core, because the invoice
					// screen asks the same question about the same card and two subtractions in
					// two packages are how two screens come to disagree.
					available: limitComparable
						? limitLeftOf({ creditLimit: account.creditLimit, states })
						: null,
					limitInAnotherCurrency: !limitComparable && account.creditLimit !== null,
					cycleMissing: false,
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
		 * Marking every invoice before a month as paid, in one action.
		 *
		 * Somebody who has been using this since before invoices had a state has every
		 * invoice they ever had sitting open, and asking them to pay each one by hand to
		 * say so would be asking them to write down money that already moved years ago. So
		 * this writes one payment per open invoice, dated on the day that invoice fell due,
		 * out of the account they name.
		 *
		 * Strictly before the month given, which is the invoice on screen. The button and the
		 * dialog count the ones before it, and this paid the one on screen as well, which
		 * always had something on it, because that was the only time the button showed.
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
			/**
			 * What each month is called, by its code, for the hole above. The code itself when a
			 * month is missing: the screen spells the months it knows, and this package cannot.
			 */
			monthNames?: Record<string, string>;
		}): Promise<number> {
			parseCalendarMonth(input.month);
			parseCalendarDate(input.today);
			const { account } = await cardAccount(input.accountId);
			assertCan(context.actor(), account.spaceId, "transaction.create");
			refuseIfNarrowed(account.spaceId);

			const states = await statesOf(input.accountId, input.today);
			// What a payment already waiting for its day covers is not paid again.
			const owing = states.filter((state) => state.month < input.month && amountToPay(state) > 0);

			for (const state of owing) {
				await needs.transactions.create({
					spaceId: account.spaceId,
					kind: "transfer",
					amount: amountToPay(state),
					happenedOn: state.dueOn,
					description: input.description.replace(
						"{{month}}",
						input.monthNames?.[state.month] ?? state.month,
					),
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
		 * The part chosen and every part after it move with it, one invoice in the same
		 * direction, which is decision 7 of 2.0.0. It moved the whole plan, the parts behind
		 * included, so moving the fourth part of ten rewrote three invoices already closed and
		 * maybe paid. The parts before it stay where they were charged.
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
				? (
						await needs.transactions.list({
							spaceId: record.spaceId,
							installmentGroup: record.installmentGroup,
						})
					).filter((part) => (part.installmentNumber ?? 0) >= (record.installmentNumber ?? 0))
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
		 *
		 * Only what is on this invoice or the next one, only what nobody put on an invoice by
		 * hand, and only the first part of a purchase in instalments, which takes the rest of
		 * its plan along one invoice in the same direction. It took every purchase on the card
		 * in the window: a plan bought on the fourth of July, on a card that closes on the
		 * third, has a part on the fourth of September that belongs to October, and saying
		 * September closed on the fifth put that part beside the one already on September.
		 *
		 * And only a day near the one expected. A bank moves a closing by a weekend or a
		 * holiday, and the field took any day at all, so a year typed wrong moved a year of
		 * purchases.
		 */
		async closedOn(input: {
			accountId: string;
			month: CalendarMonth;
			day: CalendarDate;
		}): Promise<number> {
			parseCalendarMonth(input.month);
			parseCalendarDate(input.day);
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
			if (Math.abs(daysBetween(expected, input.day)) > CLOSING_MOVES_BY_AT_MOST) {
				throw new RuleError(
					"closingDayTooFar",
					`an invoice closes within ${CLOSING_MOVES_BY_AT_MOST} days of the day expected`,
				);
			}

			// The days between the two, whichever way round they are, and which invoice the
			// records on them belong to. Closing later than expected pulls purchases back
			// onto this invoice; closing earlier pushes them onto the next one.
			const earlier = compareCalendarDates(input.day, expected) < 0;
			const from = earlier ? input.day : expected;
			const to = earlier ? expected : input.day;
			const next = shiftMonth(input.month, 1);

			const rows = await context.driver.all(
				`SELECT "id", "invoice_month", "installment_group", "installment_number"
				 FROM "transactions"
				 WHERE "account_id" = ? AND "deleted_at" IS NULL AND "kind" <> 'transfer'
				   AND "happened_on" >= ? AND "happened_on" < ?
				   AND "invoice_month" IN (?, ?)
				   AND COALESCE("invoice_month_by_hand", 0) = 0
				   AND COALESCE("installment_number", 1) = 1`,
				[input.accountId, from, to, input.month, next],
			);

			const wanted = earlier ? next : input.month;
			const moves: { id: string; month: CalendarMonth }[] = [];
			for (const row of rows) {
				const current = String(row.invoice_month);
				if (current === wanted) continue;
				const step = earlier ? 1 : -1;
				const group = row.installment_group === null ? null : String(row.installment_group);
				if (group === null) {
					moves.push({ id: String(row.id), month: wanted });
					continue;
				}
				// The first part brings its plan, each part one invoice along, which keeps them
				// one invoice apart. A part somebody put somewhere by hand stays there.
				const parts = await needs.transactions.list({
					spaceId: account.spaceId,
					installmentGroup: group,
				});
				for (const part of parts) {
					if (part.invoiceMonth === null || part.invoiceMonthByHand) continue;
					moves.push({ id: part.id, month: shiftMonth(part.invoiceMonth, step) });
				}
			}

			// All of them or none of them. One purchase in the window already ticked off
			// against the bank used to move the ones before it and then refuse, which leaves
			// a card's own month split between two invoices with nothing saying how far it got.
			return needs.transactions.setInvoiceMonths(moves);
		},
	};
}

/**
 * How far from the expected day a bank moves a closing: a weekend, a holiday, a change of
 * a day or two that nobody announced. A week either side covers all of them, and a year
 * typed wrong is not one of them.
 */
const CLOSING_MOVES_BY_AT_MOST = 7;

/** One month forwards or backwards, on the calendar month a card invoice is named by. */
function shiftMonth(month: CalendarMonth, step: number): CalendarMonth {
	const [year, index] = month.split("-").map(Number);
	const total = (year ?? 0) * 12 + (index ?? 1) - 1 + step;
	const shiftedYear = Math.floor(total / 12);
	const shiftedMonth = total - shiftedYear * 12 + 1;
	return `${String(shiftedYear).padStart(4, "0")}-${String(shiftedMonth).padStart(2, "0")}`;
}

export type InvoicesRepository = ReturnType<typeof createInvoicesRepository>;
