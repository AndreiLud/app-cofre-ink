// Gathering what the months ahead are made of.
//
// The arithmetic lives in the core package and knows nothing about databases. This is
// the part that goes and gets the three things it adds up: what is already written for
// each month ahead, what the recurring rules will add beyond that, and what the months
// behind actually cost.
//
// The middle one is the fiddly one. A recurrence writes its records ahead of time, so
// the rent for next month may already be in the table. Counting the rule as well would
// count the rent twice, and the way out is the column that says which recurrence wrote
// a record: what a rule owes for a month is what it says minus what it has written.

import {
	addMonthsToMonth,
	type CalendarDate,
	type CalendarMonth,
	lastWholeMonth,
	type MonthlyAmounts,
	moneyOnHand,
	monthOf,
	occurrencesBetween,
	type ProjectedMonth,
	project,
	type RecurrenceSpec,
} from "@cofre/core";
import { assertCan, seesOwnRowsOnly } from "../actor.ts";
import { notOnABenefitCard } from "../benefitCards.ts";
import type { SqlValue } from "../driver.ts";
import { asNumber } from "../driver.ts";
import { stillToComeOn } from "../happened.ts";
import { toRecurrence } from "../models.ts";
import type { AccountsRepository } from "./accounts.ts";
import type { RepositoryContext } from "./context.ts";
import type { InvestmentsRepository } from "./investments.ts";
import type { InvoicesRepository } from "./invoices.ts";
import type { TransactionsRepository } from "./transactions.ts";

export type ProjectionInput = {
	spaceId: string;
	/** The first month ahead, which is usually the one the person is in. */
	from: CalendarMonth;
	months: number;
	/** How many months behind to read the habit from. */
	window?: number;
	/**
	 * The day the reading is made on, in the timezone of the space.
	 *
	 * Passed in rather than read from a clock here, the way the balances, the budget and
	 * the check up already take it. It is what the opening balance is counted up to, and
	 * it is what decides which invoices are still owed, so a report on a month that has
	 * gone is a report as that month ended rather than as today.
	 */
	today: CalendarDate;
};

export type Projection = {
	months: ProjectedMonth[];
	opening: number;
	/**
	 * What the cards still charge after the last month read, and the month of the last of it:
	 * a plan of forty eight parts runs on past thirty six months. Nothing when nothing does.
	 */
	after: { amount: number; last: CalendarMonth | null } | null;
	/** What the habit was worked out from, so the screen can show it. */
	history: MonthlyAmounts[];
};

function lastDayOf(month: CalendarMonth): string {
	const [year, index] = month.split("-").map(Number);
	const last = new Date(Date.UTC(year ?? 2026, index ?? 1, 0)).getUTCDate();
	return `${month}-${String(last).padStart(2, "0")}`;
}

/**
 * The repositories this one reads through, handed in rather than reached for.
 *
 * What the accounts hold today and where each card's invoices stand are both worked out
 * elsewhere, with their own permission checks and their own tests. Asking them is how this
 * stays a gatherer rather than a second copy of arithmetic that would drift from the first,
 * which is exactly what happened: this file had its own opening balance, and it disagreed
 * with the overview by every invoice anybody had ever paid.
 */
export type ProjectionNeeds = {
	accounts: AccountsRepository;
	transactions: TransactionsRepository;
	invoices: InvoicesRepository;
	investments: InvestmentsRepository;
};

export function createProjectionsRepository(context: RepositoryContext, needs: ProjectionNeeds) {
	/**
	 * Whether this reading is narrowed to one person's own records.
	 *
	 * A logger only ever sees what they wrote. Every query that reads the transactions
	 * table has to hold that, and the ones behind this screen did not, so a logger was
	 * shown the whole household's months ahead while the limits beside them counted only
	 * their own rows.
	 */
	function mine(spaceId: string, alias = ""): { clause: string; params: SqlValue[] } {
		if (!seesOwnRowsOnly(context.actor(), spaceId)) return { clause: "", params: [] };
		const column = alias === "" ? `"created_by"` : `${alias}."created_by"`;
		return { clause: `AND ${column} = ?`, params: [context.actor().userId] };
	}

	/** Income and expense per month, from the records themselves. */
	async function amountsByMonth(
		spaceId: string,
		from: CalendarMonth,
		to: CalendarMonth,
		options: { notCountedYet?: CalendarDate; withoutCards?: boolean } = {},
	): Promise<MonthlyAmounts[]> {
		const only = mine(spaceId, "t");

		/**
		 * Everything the opening balance has not already counted, and nothing else.
		 *
		 * The opening balance is what the accounts hold on the day the projection is made,
		 * which is every record that is a fact and whose day has come. So what the months
		 * ahead still have to count is the other two: a day that has not arrived, whatever
		 * it is marked, and a day that has passed with nobody saying it happened.
		 *
		 * This asked for planned records alone, which misses a record dated ahead and
		 * written as a fact. A purchase in six parts is exactly that, and so is a month
		 * somebody filled in from the month screen before it arrived: until this release the
		 * opening balance counted every settled row whatever its date, so the money was at
		 * least somewhere, and cutting the opening at today without widening this left it
		 * counted nowhere at all.
		 */
		const notCounted =
			options.notCountedYet === undefined
				? { clause: "", params: [] as SqlValue[] }
				: {
						clause: `AND ${stillToComeOn("t")}`,
						params: [options.notCountedYet] as SqlValue[],
					};

		const rows = await context.driver.all(
			`SELECT SUBSTR(t."happened_on", 1, 7) AS month,
			        SUM(CASE WHEN t."kind" = 'income' THEN t."amount_in_base" ELSE 0 END) AS income,
			        SUM(CASE WHEN t."kind" = 'expense' THEN -t."amount_in_base" ELSE 0 END) AS expense
			 FROM "transactions" t
			 JOIN "accounts" a ON a."id" = t."account_id"
			 WHERE t."space_id" = ? AND t."deleted_at" IS NULL AND t."kind" <> 'transfer'
			   AND a."deleted_at" IS NULL
			   AND t."happened_on" >= ? AND t."happened_on" <= ?
			   AND ${notOnABenefitCard('t."account_id"')}
			   ${notCounted.clause}
			   ${options.withoutCards ? `AND a."kind" <> 'credit'` : ""}
			   ${only.clause}
			 GROUP BY SUBSTR(t."happened_on", 1, 7)
			 ORDER BY month`,
			[spaceId, `${from}-01`, lastDayOf(to), ...notCounted.params, ...only.params],
		);

		return rows.map((row) => ({
			month: String(row.month) as CalendarMonth,
			income: asNumber(row.income ?? 0),
			expense: asNumber(row.expense ?? 0),
		}));
	}

	/** What the rules owe each month, beyond the records they have already written. */
	async function recurringByMonth(
		spaceId: string,
		from: CalendarMonth,
		to: CalendarMonth,
	): Promise<MonthlyAmounts[]> {
		// Nothing, for somebody who only sees their own records. A series belongs to the
		// space and is set by the people who may write one, and the rows it writes are
		// theirs and not this person's, so counting what it will owe would put the
		// household's bills into a projection of one person's own spending.
		if (seesOwnRowsOnly(context.actor(), spaceId)) return [];

		// Not a series charged to a benefit card, whose lunches are not the household's money
		// leaving, for the same reason the records behind are read without them.
		const rules = (
			await context.driver.all(
				`SELECT "id", "space_id", "description", "kind", "amount", "currency", "account_id",
				        "counter_account_id", "category_id", "priority", "frequency", "interval_count",
				        "day_of_month", "weekday", "month_of_year", "starts_on", "ends_on",
				        "notes", "paused_at", "created_by", "created_at", "updated_at"
				 FROM "recurrences"
				 WHERE "space_id" = ? AND "deleted_at" IS NULL AND "paused_at" IS NULL
				   AND ${notOnABenefitCard('"recurrences"."account_id"')}`,
				[spaceId],
			)
		).map(toRecurrence);

		// What each rule has already put in the table, per month, so it is not counted
		// twice. The column that says which rule wrote a record is what makes this exact.
		const written = await context.driver.all(
			`SELECT "recurrence_id", SUBSTR("happened_on", 1, 7) AS month, COUNT(*) AS how_many
			 FROM "transactions"
			 WHERE "space_id" = ? AND "deleted_at" IS NULL AND "recurrence_id" IS NOT NULL
			   AND "happened_on" >= ? AND "happened_on" <= ?
			 GROUP BY "recurrence_id", SUBSTR("happened_on", 1, 7)`,
			[spaceId, `${from}-01`, lastDayOf(to)],
		);

		const already = new Map<string, number>();
		for (const row of written) {
			already.set(`${String(row.recurrence_id)}:${String(row.month)}`, asNumber(row.how_many));
		}

		const byMonth = new Map<string, MonthlyAmounts>();

		for (const rule of rules) {
			const spec: RecurrenceSpec = {
				frequency: rule.frequency,
				intervalCount: rule.intervalCount,
				startsOn: rule.startsOn,
				endsOn: rule.endsOn,
				dayOfMonth: rule.dayOfMonth,
				monthOfYear: rule.monthOfYear,
			};

			const days = occurrencesBetween(spec, `${from}-01`, lastDayOf(to));
			const counted = new Map<string, number>();
			for (const day of days) {
				const month = day.slice(0, 7);
				counted.set(month, (counted.get(month) ?? 0) + 1);
			}

			for (const [month, times] of counted) {
				const owed = Math.max(0, times - (already.get(`${rule.id}:${month}`) ?? 0));
				if (owed === 0) continue;

				const entry = byMonth.get(month) ?? {
					month: month as CalendarMonth,
					income: 0,
					expense: 0,
				};
				// A transfer between two accounts of the same person is not money coming
				// or going, so it changes no total here.
				if (rule.kind === "income") entry.income += rule.amount * owed;
				if (rule.kind === "expense") entry.expense += rule.amount * owed;
				byMonth.set(month, entry);
			}
		}

		return [...byMonth.values()].sort((one, other) => one.month.localeCompare(other.month));
	}

	/**
	 * What the cards will take out of the bank, month by month, by the day each invoice
	 * falls due.
	 *
	 * A card purchase is not money leaving on the afternoon of the purchase. It joins an
	 * invoice, and the invoice leaves the account on one day, which is often in a month
	 * after the one the purchase happened in. So the months ahead never saw any of it: the
	 * purchases are marked as facts and dated in months to come, and the only records this
	 * screen counted ahead were the ones still waiting to be confirmed.
	 *
	 * What is counted is what is left on each invoice and not what it charged, because a
	 * part already paid has already left. An invoice that closed and fell due before today
	 * and is still owed counts in the first month ahead, because it is money that has to go
	 * and there is no earlier month to put it in.
	 *
	 * Nothing for somebody who only sees their own records, the same as the card screen:
	 * an invoice built from one person's purchases is not the invoice.
	 */
	async function invoicesByMonth(
		spaceId: string,
		from: CalendarMonth,
		to: CalendarMonth,
		today: CalendarDate,
	): Promise<{ months: MonthlyAmounts[]; beyond: { amount: number; last: CalendarMonth | null } }> {
		const beyond = { amount: 0, last: null as CalendarMonth | null };
		if (seesOwnRowsOnly(context.actor(), spaceId)) return { months: [], beyond };

		// Archived cards too, whose last invoice is still money that has to go: only what is
		// left on an invoice is counted, so one paid in full adds nothing.
		const accounts = await needs.accounts.list(spaceId, { includeArchived: true });
		const cards = accounts.filter(
			(account) =>
				account.kind === "credit" && account.closingDay !== null && account.dueDay !== null,
		);

		const byMonth = new Map<string, MonthlyAmounts>();
		for (const card of cards) {
			for (const state of await needs.invoices.list(card.id, today)) {
				if (state.left <= 0) continue;
				const falls = monthOf(state.dueOn);
				const month = falls < from ? from : falls;
				// Past the months read, said apart rather than skipped: a plan of forty eight parts
				// runs on after the horizon, and what is left of it was in no figure at all.
				if (month > to) {
					beyond.amount += state.left;
					if (beyond.last === null || month > beyond.last) beyond.last = month as CalendarMonth;
					continue;
				}

				const entry = byMonth.get(month) ?? {
					month: month as CalendarMonth,
					income: 0,
					expense: 0,
				};
				entry.expense += state.left;
				byMonth.set(month, entry);
			}
		}

		return {
			months: [...byMonth.values()].sort((one, other) => one.month.localeCompare(other.month)),
			beyond,
		};
	}

	/** Two lists of monthly amounts added together, month by month. */
	function together(
		one: readonly MonthlyAmounts[],
		other: readonly MonthlyAmounts[],
	): MonthlyAmounts[] {
		const byMonth = new Map<string, MonthlyAmounts>();
		for (const entry of [...one, ...other]) {
			const found = byMonth.get(entry.month) ?? { month: entry.month, income: 0, expense: 0 };
			found.income += entry.income;
			found.expense += entry.expense;
			byMonth.set(entry.month, found);
		}
		return [...byMonth.values()].sort((first, second) => first.month.localeCompare(second.month));
	}

	return {
		/**
		 * The months ahead.
		 *
		 * The opening balance is what the accounts add up to today, counting only what
		 * has actually happened, because what is planned is already one of the three
		 * things the months ahead are made of.
		 */
		async monthsAhead(input: ProjectionInput): Promise<Projection> {
			assertCan(context.actor(), input.spaceId, "transaction.read");

			const months = Math.max(1, Math.min(Math.floor(input.months), 36));
			const window = Math.max(1, Math.min(input.window ?? 6, 24));
			const to = addMonthsToMonth(input.from, months - 1);

			// Where the money stands today, from the one place that works it out.
			//
			// The opening balances of the accounts belong to the space and not to a person,
			// so for somebody who only sees their own records this starts at nothing and what
			// follows is the shape of their own spending rather than the household's money.
			// That is held by the balances themselves and not here.
			//
			// This file used to add the opening balances up and then add every settled
			// record that was not a transfer, and the second half of that is wrong: a
			// transfer nets to nothing only when both of its accounts are in the total.
			// Paying a card invoice is a transfer into an account that is deliberately out
			// of it, so the money left the bank and the projection never noticed, and it
			// opened over by every invoice the household had ever paid.
			//
			// A card and a benefit card stay out of the total, for opposite reasons. A card
			// is a debt that the months ahead pay off invoice by invoice, and counting it
			// here would take it off twice. A benefit card is an allowance that buys lunch
			// and will not pay the rent, so a month that started with it in would be a
			// month that thinks it has more than it has. Both are what `moneyOnHand` means.
			// Not for somebody who sees only their own records: their balances are made of their
			// own rows and the holdings are the household's, so the two together were neither
			// their number nor the household's. Without them their investment account counts
			// what they themselves moved into it.
			const narrowed = seesOwnRowsOnly(context.actor(), input.spaceId);
			const [accounts, balances, holdings] = await Promise.all([
				needs.accounts.list(input.spaceId),
				needs.transactions.balances(input.spaceId, input.today),
				// What was owned on the day the projection starts from, at the price of that day:
				// the months after a September that has gone open from the money of September.
				narrowed
					? Promise.resolve([])
					: needs.investments.list(input.spaceId, { onDay: input.today }),
			]);

			// What the investment accounts are worth, by the prices somebody typed, which is
			// the whole reason `moneyOnHand` takes them: a holding is priced by hand and a
			// price is not a movement, so the balance of a broker account is what was paid
			// into it. Without this the projection opened at the money put in while the
			// overview showed what it is worth, which is two answers to one question.
			const worth: Record<string, number> = {};
			for (const holding of holdings) {
				worth[holding.accountId] = (worth[holding.accountId] ?? 0) + holding.value;
			}

			const opening = moneyOnHand({ accounts, balances, worth });

			/**
			 * The months the habit is read from, and never a month that is not over.
			 *
			 * The habit is a median of whole months. Reading up to the month before the first
			 * projected one is right when the projection starts where the money stands, which is
			 * the usual case: the month before this one is over. It is wrong for a reading that
			 * starts further ahead, which the month on paper does, because then the month before
			 * the first projected one is the one somebody is standing in, and a month that is
			 * eleven days old enters the median as a cheap month and drags the habit down.
			 *
			 * A month counts as over once today has reached its last day, which is what a report
			 * about a month that has gone asks for: it is read as that month stood on its last
			 * day, so that month is whole and belongs in the history.
			 */
			const lastWhole = lastWholeMonth(input.today);
			const behindTo =
				addMonthsToMonth(input.from, -1) < lastWhole ? addMonthsToMonth(input.from, -1) : lastWhole;
			const behindFrom = addMonthsToMonth(behindTo, -(window - 1));

			const history = await amountsByMonth(input.spaceId, behindFrom, behindTo);
			const recurring = await recurringByMonth(input.spaceId, input.from, to);

			// What is written for each month ahead, and what the cards will charge.
			//
			// The two are separate reads of separate things: a record still waiting to be
			// confirmed, and an invoice that has to be paid. They are added together here
			// because both are things somebody can point at, which is what the written part
			// of a projected month means, and the habit shrinks by exactly as much as they
			// account for.
			//
			// A card purchase is left out of the first one and counted only in the second, so
			// it is money leaving on the day the invoice falls due and not on the day of the
			// purchase. The months behind still count the purchase in the month it happened,
			// because the habit is about what a household spends and not about when the bank
			// notices.
			const planned = await amountsByMonth(input.spaceId, input.from, to, {
				notCountedYet: input.today,
				withoutCards: true,
			});
			const invoices = await invoicesByMonth(input.spaceId, input.from, to, input.today);
			const written = together(planned, invoices.months);

			return {
				opening,
				history,
				after: invoices.beyond.amount > 0 ? invoices.beyond : null,
				months: project({
					opening,
					from: input.from,
					months,
					written,
					recurring,
					history,
					window,
					// The habit of the month this is read in counts only the days still to
					// come, because the opening balance already holds the ones that have gone.
					today: input.today,
				}),
			};
		},
	};
}

export type ProjectionsRepository = ReturnType<typeof createProjectionsRepository>;
