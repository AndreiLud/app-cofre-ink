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

import type { CalendarDate } from "@cofre/core";
import { assertCan, readableSpaceIds, seesOwnRowsOnly } from "../actor.ts";
import { asNumber, type SqlValue } from "../driver.ts";
import type { SpendingPriority } from "../models.ts";
import { marks } from "../sql.ts";
import type { RepositoryContext } from "./context.ts";

export type ReportRange = {
	/** Empty for the consolidated view, which is every space this person can read. */
	spaceId?: string;
	from: CalendarDate;
	to: CalendarDate;
	/** Planned records are left out by default: a report is about what happened. */
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

export type MonthTotal = { month: string; income: number; expense: number };

export type DayTotal = { day: CalendarDate; total: number };

export type PeriodTotals = {
	income: number;
	expense: number;
	/** What came in minus what went out. Negative means the period ate into savings. */
	left: number;
};

export function createReportsRepository(context: RepositoryContext) {
	/** The spaces a report may read, and the filter that keeps a logger to their own. */
	function scope(range: ReportRange): { where: string[]; params: SqlValue[] } {
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
			where.push(`t."status" = 'settled'`);
		}

		const hidden = spaceIds.filter((id) => seesOwnRowsOnly(actor, id));
		if (hidden.length > 0) {
			where.push(`(t."space_id" NOT IN (${marks(hidden.length)}) OR t."created_by" = ?)`);
			params.push(...hidden, actor.userId);
		}

		return { where, params };
	}

	return {
		/** What came in, what went out, and what was left over. */
		async totals(range: ReportRange): Promise<PeriodTotals> {
			const { where, params } = scope(range);
			if (where.length === 0) return { income: 0, expense: 0, left: 0 };

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
			return { income, expense, left: income - expense };
		},

		/**
		 * Where the money went, one line per category, biggest first. A record with no
		 * category is a line of its own rather than being dropped, because money nobody
		 * sorted is exactly the money worth looking at.
		 */
		async byCategory(range: ReportRange): Promise<CategoryTotal[]> {
			const { where, params } = scope(range);
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
			const { where, params } = scope(range);
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
			const { where, params } = scope(range);
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

			return rows.map((row) => ({
				month: String(row.month),
				income: asNumber(row.income),
				expense: Math.abs(asNumber(row.expense)),
			}));
		},

		/** Day by day, for the map that shows which days money leaves. */
		async byDay(range: ReportRange): Promise<DayTotal[]> {
			const { where, params } = scope(range);
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
			const { where, params } = scope(range);
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
