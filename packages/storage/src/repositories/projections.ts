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
	type CalendarMonth,
	type MonthlyAmounts,
	occurrencesBetween,
	type ProjectedMonth,
	project,
	type RecurrenceSpec,
} from "@cofre/core";
import { assertCan, seesOwnRowsOnly } from "../actor.ts";
import type { SqlValue } from "../driver.ts";
import { asNumber } from "../driver.ts";
import { toRecurrence } from "../models.ts";
import type { RepositoryContext } from "./context.ts";

export type ProjectionInput = {
	spaceId: string;
	/** The first month ahead, which is usually the one the person is in. */
	from: CalendarMonth;
	months: number;
	/** How many months behind to read the habit from. */
	window?: number;
};

export type Projection = {
	months: ProjectedMonth[];
	opening: number;
	/** What the habit was worked out from, so the screen can show it. */
	history: MonthlyAmounts[];
};

function lastDayOf(month: CalendarMonth): string {
	const [year, index] = month.split("-").map(Number);
	const last = new Date(Date.UTC(year ?? 2026, index ?? 1, 0)).getUTCDate();
	return `${month}-${String(last).padStart(2, "0")}`;
}

export function createProjectionsRepository(context: RepositoryContext) {
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
		options: { onlyPlanned?: boolean } = {},
	): Promise<MonthlyAmounts[]> {
		const only = mine(spaceId);
		const rows = await context.driver.all(
			`SELECT SUBSTR("happened_on", 1, 7) AS month,
			        SUM(CASE WHEN "kind" = 'income' THEN "amount_in_base" ELSE 0 END) AS income,
			        SUM(CASE WHEN "kind" = 'expense' THEN -"amount_in_base" ELSE 0 END) AS expense
			 FROM "transactions"
			 WHERE "space_id" = ? AND "deleted_at" IS NULL AND "kind" <> 'transfer'
			   AND "happened_on" >= ? AND "happened_on" <= ?
			   ${options.onlyPlanned ? `AND "status" = 'planned'` : ""}
			   ${only.clause}
			 GROUP BY SUBSTR("happened_on", 1, 7)
			 ORDER BY month`,
			[spaceId, `${from}-01`, lastDayOf(to), ...only.params],
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

		const rules = (
			await context.driver.all(
				`SELECT "id", "space_id", "description", "kind", "amount", "currency", "account_id",
				        "counter_account_id", "category_id", "priority", "frequency", "interval_count",
				        "day_of_month", "weekday", "month_of_year", "starts_on", "ends_on",
				        "notes", "paused_at", "created_by", "created_at", "updated_at"
				 FROM "recurrences"
				 WHERE "space_id" = ? AND "deleted_at" IS NULL AND "paused_at" IS NULL`,
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

			// The opening balances of the accounts belong to the space and not to a person,
			// so for somebody who only sees their own records this starts at nothing and
			// what follows is the shape of their own spending rather than the household's
			// money. Counting the household's opening balance and then only their rows
			// would be the worst of both.
			const onlyMine = seesOwnRowsOnly(context.actor(), input.spaceId);
			// A card and a benefit card are both out of the opening, for opposite reasons.
			// A card is a debt that the months ahead pay off invoice by invoice, and
			// counting it here would take it off twice. A benefit card is an allowance that
			// buys lunch and will not pay the rent, so a month that started with it in
			// would be a month that thinks it has more than it has.
			const balances = onlyMine
				? []
				: await context.driver.all(
						`SELECT COALESCE(SUM(a."initial_balance"), 0) AS opening FROM "accounts" a
						 WHERE a."space_id" = ? AND a."deleted_at" IS NULL AND a."archived_at" IS NULL
						   AND a."kind" NOT IN ('credit', 'voucher')`,
						[input.spaceId],
					);

			const only = mine(input.spaceId, "t");
			const settled = await context.driver.all(
				`SELECT COALESCE(SUM(CASE WHEN t."kind" = 'transfer' THEN 0 ELSE t."amount_in_base" END), 0) AS moved
				 FROM "transactions" t
				 JOIN "accounts" a ON a."id" = t."account_id"
				 WHERE t."space_id" = ? AND t."deleted_at" IS NULL AND t."status" = 'settled'
				   AND a."kind" NOT IN ('credit', 'voucher') AND a."deleted_at" IS NULL
				   ${only.clause}`,
				[input.spaceId, ...only.params],
			);

			const opening = asNumber(balances[0]?.opening ?? 0) + asNumber(settled[0]?.moved ?? 0);

			const behindFrom = addMonthsToMonth(input.from, -window);
			const behindTo = addMonthsToMonth(input.from, -1);

			const history = await amountsByMonth(input.spaceId, behindFrom, behindTo);
			const written = await amountsByMonth(input.spaceId, input.from, to, { onlyPlanned: true });
			const recurring = await recurringByMonth(input.spaceId, input.from, to);

			return {
				opening,
				history,
				months: project({
					opening,
					from: input.from,
					months,
					written,
					recurring,
					history,
					window,
				}),
			};
		},
	};
}

export type ProjectionsRepository = ReturnType<typeof createProjectionsRepository>;
