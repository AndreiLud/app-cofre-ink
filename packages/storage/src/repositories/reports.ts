// The sums behind every chart.
//
// Adding money up is the database's job, not the browser's: a year of records is a
// thousand rows to send over the wire and one number to compute here. Every query in
// this file obeys the same two rules as everything else, which is that a space is only
// read by its members and a logger only ever sees what they wrote.
//
// A report with no space is the consolidated view: everything this person can read,
// added together. That is the one place in the product where money from different
// spaces is counted in the same number, and it exists because a person with a personal
// space and a house still has one life.

import { type CalendarDate, todayIn } from "@cofre/core";
import { assertCan, readableSpaceIds, seesOwnRowsOnly } from "../actor.ts";
import { asNumber, type SqlValue } from "../driver.ts";
import { happenedBy } from "../happened.ts";
import type { SpendingPriority } from "../models.ts";
import { marks } from "../sql.ts";
import type { RepositoryContext } from "./context.ts";
import { benefitLandingsIn } from "./voucherReading.ts";

export type ReportRange = {
	/** Empty for the consolidated view, which is every space this person can read. */
	spaceId?: string;
	from: CalendarDate;
	to: CalendarDate;
	/**
	 * What has not happened yet is left out by default, because a report is about what
	 * happened: a promise from before 1.1.0, and a fact whose day has not come.
	 */
	includePlanned?: boolean;
};

export type CategoryTotal = {
	categoryId: string | null;
	name: string | null;
	parentId: string | null;
	parentName: string | null;
	priority: SpendingPriority | null;
	/** Positive minor units. What left, added up. */
	total: number;
};

export type PriorityTotal = { priority: SpendingPriority | null; total: number };

export type MonthTotal = {
	month: string;
	/** What was written as income that month. */
	income: number;
	expense: number;
	/**
	 * What landed on the benefit cards that month, counted beside the income and never in it,
	 * the same figure `totals` gives for a range. The months had none, so the comparison of
	 * the month screen, the twelve months of the reports and the month on paper said less came
	 * in than the overview did for the same month, against spending that included the lunches.
	 */
	benefits: number;
};

export type DayTotal = { day: CalendarDate; total: number };

/** What landed on one benefit card over a period. */
export type CardBenefit = { accountId: string; name: string; amount: number };

export type PeriodTotals = {
	income: number;
	expense: number;
	/**
	 * What the benefit cards were credited with, which is money that came in and is not a
	 * record: nobody writes down a meal card being credited, because nothing of theirs
	 * moved. It is its own number rather than part of the income, because a household
	 * does not put a meal card aside and nothing asking what can be saved should read it.
	 */
	benefits: number;
	/** What came in, benefits included, minus what went out. */
	left: number;
};

export function createReportsRepository(context: RepositoryContext) {
	/** The spaces a report may read, and the filter that keeps a logger to their own. */
	async function scope(range: ReportRange): Promise<{ where: string[]; params: SqlValue[] }> {
		const actor = context.actor();
		const spaceIds = range.spaceId
			? [range.spaceId]
			: readableSpaceIds(actor).filter((id) => context.can(id, "transaction.read"));

		if (range.spaceId) assertCan(actor, range.spaceId, "transaction.read");
		if (spaceIds.length === 0) return { where: [], params: [] };

		const where = [
			`t."space_id" IN (${marks(spaceIds.length)})`,
			`t."deleted_at" IS NULL`,
			`t."happened_on" >= ?`,
			`t."happened_on" <= ?`,
		];
		const params: SqlValue[] = [...spaceIds, range.from, range.to];

		if (range.includePlanned !== true) {
			// What has happened, which is a fact whose day has come. A record dated for the
			// end of this month is written as a fact today and waits for its day, so a
			// report of the month in hand reads up to today. Today is a day in the timezone
			// of each space, and two spaces may disagree about which day it is.
			const zones = await context.driver.all(
				`SELECT "id", "timezone" FROM "spaces" WHERE "id" IN (${marks(spaceIds.length)})`,
				spaceIds,
			);
			const byDay = new Map<CalendarDate, string[]>();
			for (const row of zones) {
				const day = todayIn(String(row.timezone ?? "America/Sao_Paulo"));
				byDay.set(day, [...(byDay.get(day) ?? []), String(row.id)]);
			}
			const days = [...byDay];
			const only = days[0];
			if (days.length === 1 && only) {
				where.push(happenedBy("t"));
				params.push(only[0]);
			} else {
				where.push(
					`(${days
						.map(([, ids]) => `(t."space_id" IN (${marks(ids.length)}) AND ${happenedBy("t")})`)
						.join(" OR ")})`,
				);
				for (const [day, ids] of days) params.push(...ids, day);
			}
		}

		const hidden = spaceIds.filter((id) => seesOwnRowsOnly(actor, id));
		if (hidden.length > 0) {
			where.push(`(t."space_id" NOT IN (${marks(hidden.length)}) OR t."created_by" = ?)`);
			params.push(...hidden, actor.userId);
		}

		return { where, params };
	}

	/**
	 * What the benefit cards were credited with over a range of days.
	 *
	 * Worked out rather than read, because an allowance landing is not a record: it is an
	 * amount and a day on the account, and this counts the landings that fall inside the
	 * range. A voucher with no allowance written on it counts as nothing, which is what
	 * every voucher written before this release is.
	 */
	async function benefitsIn(range: ReportRange): Promise<number> {
		let total = 0;
		for (const landing of await landingsIn(range)) total += landing.amount;
		return total;
	}

	/**
	 * The landings of a range, from the spaces it reads.
	 *
	 * Nothing for somebody who only sees their own records, whether they named a space or
	 * not. An allowance belongs to the space and not to a person, and the rest of this reading
	 * is narrowed to their own rows, so counting it whole would put the household's meal card
	 * into a month made of one person's records.
	 */
	async function landingsIn(range: ReportRange) {
		const spaceIds = (range.spaceId ? [range.spaceId] : readableSpaceIds(context.actor())).filter(
			(id) => !seesOwnRowsOnly(context.actor(), id),
		);
		return benefitLandingsIn(context.driver, spaceIds, range.from, range.to);
	}

	return {
		/** What came in, what went out, and what was left over. */
		async totals(range: ReportRange): Promise<PeriodTotals> {
			const { where, params } = await scope(range);
			if (where.length === 0) return { income: 0, expense: 0, benefits: 0, left: 0 };

			const rows = await context.driver.all(
				`SELECT
				   COALESCE(SUM(CASE WHEN t."kind" = 'income' THEN t."amount_in_base" ELSE 0 END), 0) AS income,
				   COALESCE(SUM(CASE WHEN t."kind" = 'expense' THEN t."amount_in_base" ELSE 0 END), 0) AS expense
				 FROM "transactions" t WHERE ${where.join(" AND ")}`,
				params,
			);

			const income = asNumber(rows[0]?.income ?? 0);
			// Expenses are stored negative, and a report reads better in positive numbers.
			const expense = Math.abs(asNumber(rows[0]?.expense ?? 0));

			// What landed on the benefit cards, which is money that came in and is not a
			// record: nobody writes down a meal card being credited, because nothing of
			// theirs moved. Lunch bought on it is spending like any other, so a month with
			// the spending and without the credit closes worse by exactly what was eaten.
			//
			// It is its own number rather than part of the income, because a household does
			// not put a meal card aside and nothing that asks "what can be saved" should
			// read it. The screens name it; this package holds no copy.
			const benefits = await benefitsIn(range);

			return { income, expense, benefits, left: income + benefits - expense };
		},

		/**
		 * Where the money went, one line per category, biggest first. A record with no
		 * category is a line of its own rather than being dropped, because money nobody
		 * sorted is exactly the money worth looking at.
		 */
		async byCategory(range: ReportRange): Promise<CategoryTotal[]> {
			const { where, params } = await scope(range);
			if (where.length === 0) return [];

			const rows = await context.driver.all(
				`SELECT c."id" AS category_id, c."name" AS name, c."priority" AS priority,
				        p."id" AS parent_id, p."name" AS parent_name,
				        COALESCE(SUM(t."amount_in_base"), 0) AS total
				 FROM "transactions" t
				 LEFT JOIN "categories" c ON c."id" = t."category_id"
				 LEFT JOIN "categories" p ON p."id" = c."parent_id"
				 WHERE ${where.join(" AND ")} AND t."kind" = 'expense'
				 GROUP BY c."id", c."name", c."priority", p."id", p."name"
				 ORDER BY total`,
				params,
			);

			return rows.map((row) => ({
				categoryId: row.category_id === null ? null : String(row.category_id),
				name: row.name === null ? null : String(row.name),
				parentId: row.parent_id === null ? null : String(row.parent_id),
				parentName: row.parent_name === null ? null : String(row.parent_name),
				priority: row.priority === null ? null : (String(row.priority) as SpendingPriority),
				total: Math.abs(asNumber(row.total)),
			}));
		},

		/**
		 * What the money was needed for. The priority of a record wins over the one of
		 * its category, which is the whole reason a record may carry its own.
		 */
		async byPriority(range: ReportRange): Promise<PriorityTotal[]> {
			const { where, params } = await scope(range);
			if (where.length === 0) return [];

			const rows = await context.driver.all(
				`SELECT COALESCE(t."priority", c."priority") AS priority,
				        COALESCE(SUM(t."amount_in_base"), 0) AS total
				 FROM "transactions" t
				 LEFT JOIN "categories" c ON c."id" = t."category_id"
				 WHERE ${where.join(" AND ")} AND t."kind" = 'expense'
				 GROUP BY COALESCE(t."priority", c."priority")
				 ORDER BY total`,
				params,
			);

			return rows.map((row) => ({
				priority: row.priority === null ? null : (String(row.priority) as SpendingPriority),
				total: Math.abs(asNumber(row.total)),
			}));
		},

		/** Month by month, so a year reads as a shape rather than as a table. */
		async byMonth(range: ReportRange): Promise<MonthTotal[]> {
			const { where, params } = await scope(range);
			if (where.length === 0) return [];

			// Both engines cut the first seven characters the same way, which is the one
			// piece of date arithmetic this project needs from the database.
			const rows = await context.driver.all(
				`SELECT SUBSTR(t."happened_on", 1, 7) AS month,
				        COALESCE(SUM(CASE WHEN t."kind" = 'income' THEN t."amount_in_base" ELSE 0 END), 0) AS income,
				        COALESCE(SUM(CASE WHEN t."kind" = 'expense' THEN t."amount_in_base" ELSE 0 END), 0) AS expense
				 FROM "transactions" t
				 WHERE ${where.join(" AND ")}
				 GROUP BY SUBSTR(t."happened_on", 1, 7)
				 ORDER BY month`,
				params,
			);

			// The benefit of each month, from the same landings the totals count, and a month
			// that had only the allowance is a month too.
			const benefits = new Map<string, number>();
			for (const landing of await landingsIn(range)) {
				const month = landing.on.slice(0, 7);
				benefits.set(month, (benefits.get(month) ?? 0) + landing.amount);
			}
			const months = new Map<string, MonthTotal>();
			for (const row of rows) {
				const month = String(row.month);
				months.set(month, {
					month,
					income: asNumber(row.income),
					expense: Math.abs(asNumber(row.expense)),
					benefits: benefits.get(month) ?? 0,
				});
			}
			for (const [month, amount] of benefits) {
				if (!months.has(month))
					months.set(month, { month, income: 0, expense: 0, benefits: amount });
			}
			return [...months.values()].sort((one, other) => one.month.localeCompare(other.month));
		},

		/**
		 * What landed on each benefit card over the period, by the name of the card, from the
		 * same landings the totals count, so the lines add up to the benefit of the totals.
		 * The month on paper had one line for the benefit and none for each card.
		 */
		async benefitsByCard(range: ReportRange): Promise<CardBenefit[]> {
			const { where } = await scope(range);
			if (where.length === 0) return [];
			const byCard = new Map<string, CardBenefit>();
			for (const landing of await landingsIn(range)) {
				const found = byCard.get(landing.accountId) ?? {
					accountId: landing.accountId,
					name: landing.name,
					amount: 0,
				};
				found.amount += landing.amount;
				byCard.set(landing.accountId, found);
			}
			return [...byCard.values()].sort((one, other) => one.name.localeCompare(other.name));
		},

		/** Day by day, for the map that shows which days money leaves. */
		async byDay(range: ReportRange): Promise<DayTotal[]> {
			const { where, params } = await scope(range);
			if (where.length === 0) return [];

			const rows = await context.driver.all(
				`SELECT t."happened_on" AS day, COALESCE(SUM(t."amount_in_base"), 0) AS total
				 FROM "transactions" t
				 WHERE ${where.join(" AND ")} AND t."kind" = 'expense'
				 GROUP BY t."happened_on"
				 ORDER BY day`,
				params,
			);

			return rows.map((row) => ({
				day: String(row.day),
				total: Math.abs(asNumber(row.total)),
			}));
		},

		/** Where money came from, one line per category of income. */
		async incomeByCategory(range: ReportRange): Promise<CategoryTotal[]> {
			const { where, params } = await scope(range);
			if (where.length === 0) return [];

			const rows = await context.driver.all(
				`SELECT c."id" AS category_id, c."name" AS name, c."priority" AS priority,
				        p."id" AS parent_id, p."name" AS parent_name,
				        COALESCE(SUM(t."amount_in_base"), 0) AS total
				 FROM "transactions" t
				 LEFT JOIN "categories" c ON c."id" = t."category_id"
				 LEFT JOIN "categories" p ON p."id" = c."parent_id"
				 WHERE ${where.join(" AND ")} AND t."kind" = 'income'
				 GROUP BY c."id", c."name", c."priority", p."id", p."name"
				 ORDER BY total DESC`,
				params,
			);

			return rows.map((row) => ({
				categoryId: row.category_id === null ? null : String(row.category_id),
				name: row.name === null ? null : String(row.name),
				parentId: row.parent_id === null ? null : String(row.parent_id),
				parentName: row.parent_name === null ? null : String(row.parent_name),
				priority: null,
				total: asNumber(row.total),
			}));
		},
	};
}

export type ReportsRepository = ReturnType<typeof createReportsRepository>;
