// Limits, and how they are doing.
//
// A limit is either on everything, on a level of priority or on one category, and it
// is either standing (every month) or written for one month in particular. The reading
// of it lives in the core package, so this file is about storing them and handing the
// core the numbers it needs.

import {
	type BudgetProgress,
	budgetsForMonth,
	progressOf,
	type SpendingPriority,
} from "@cofre/core";
import { budgets } from "@cofre/db";
import { assertCan, readableSpaceIds, seesOwnRowsOnly } from "../actor.ts";
import type { SqlValue } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { type Budget, type BudgetScope, toBudget } from "../models.ts";
import { marks } from "../sql.ts";
import { insertRow, softDeleteRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

export type CreateBudgetInput = {
	spaceId: string;
	scope: BudgetScope;
	amount: number;
	categoryId?: string | null;
	priority?: SpendingPriority | null;
	/** Empty for a limit that holds every month. */
	month?: string | null;
};

export type UpdateBudgetInput = {
	amount?: number;
	month?: string | null;
};

export type BudgetWithProgress = Budget & { progress: BudgetProgress };

const SELECT = `SELECT "id", "space_id", "scope", "category_id", "priority", "month", "amount",
	"created_by", "created_at", "updated_at"
	FROM "budgets"`;

const MONTH = /^\d{4}-\d{2}$/;

export function createBudgetsRepository(context: RepositoryContext) {
	async function reachable(id: string): Promise<Budget> {
		const spaceIds = readableSpaceIds(context.actor());
		if (spaceIds.length === 0) throw new NotFoundError("budget", id);
		const rows = await context.driver.all(
			`${SELECT} WHERE "id" = ? AND "space_id" IN (${marks(spaceIds.length)}) AND "deleted_at" IS NULL`,
			[id, ...spaceIds],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("budget", id);
		return toBudget(first);
	}

	function checkAmount(amount: number): number {
		if (!Number.isSafeInteger(amount) || amount <= 0) {
			throw new RuleError(
				"amountIsPositiveInteger",
				"a limit is a positive integer of minor units",
			);
		}
		return amount;
	}

	function checkMonth(month: string | null | undefined): string | null {
		if (!month) return null;
		if (!MONTH.test(month)) {
			throw new RuleError(
				"monthIsNotAMonth",
				"a month is written as four digits, a dash, two digits",
			);
		}
		return month;
	}

	async function listIn(spaceId: string): Promise<Budget[]> {
		assertCan(context.actor(), spaceId, "plan.read");
		const rows = await context.driver.all(
			`${SELECT} WHERE "space_id" = ? AND "deleted_at" IS NULL ORDER BY "scope", "month"`,
			[spaceId],
		);
		return rows.map(toBudget);
	}

	return {
		list: listIn,

		async create(input: CreateBudgetInput): Promise<Budget> {
			assertCan(context.actor(), input.spaceId, "plan.write");
			checkAmount(input.amount);
			const month = checkMonth(input.month);

			if (input.scope === "category" && !input.categoryId) {
				throw new RuleError("budgetNeedsCategory", "a limit on a category needs the category");
			}
			if (input.scope === "priority" && !input.priority) {
				throw new RuleError("budgetNeedsPriority", "a limit on a priority needs the priority");
			}

			if (input.categoryId) {
				const found = await context.driver.all(
					`SELECT "id" FROM "categories" WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL`,
					[input.categoryId, input.spaceId],
				);
				if (found.length === 0) throw new NotFoundError("category", input.categoryId);
			}

			// The same thing cannot have two limits for the same month. Writing one again
			// changes what is there, which is what the screen is doing anyway.
			//
			// The comparison is built rather than parameterised because a column against a
			// value that may be empty reads differently in the two dialects, and one
			// spelling that works in both is worth three lines here.
			const sameAs = (column: string, value: string | null) =>
				value === null ? `"${column}" IS NULL` : `"${column}" = ?`;
			const categoryId = input.scope === "category" ? (input.categoryId ?? null) : null;
			const priority = input.scope === "priority" ? (input.priority ?? null) : null;

			const existing = await context.driver.all(
				`SELECT "id" FROM "budgets" WHERE "space_id" = ? AND "deleted_at" IS NULL
				 AND "scope" = ? AND ${sameAs("category_id", categoryId)}
				 AND ${sameAs("priority", priority)} AND ${sameAs("month", month)}`,
				[
					input.spaceId,
					input.scope,
					...(categoryId === null ? [] : [categoryId]),
					...(priority === null ? [] : [priority]),
					...(month === null ? [] : [month]),
				],
			);
			const already = existing[0];
			if (already) {
				await updateRow(context.write(), {
					table: budgets,
					spaceId: input.spaceId,
					id: String(already.id),
					values: { amount: input.amount },
				});
				return reachable(String(already.id));
			}

			const id = await insertRow(context.write(), {
				table: budgets,
				spaceId: input.spaceId,
				values: {
					scope: input.scope,
					category_id: input.scope === "category" ? (input.categoryId ?? null) : null,
					priority: input.scope === "priority" ? (input.priority ?? null) : null,
					month,
					amount: input.amount,
					created_by: context.actor().userId,
				},
			});
			return reachable(id);
		},

		async update(id: string, input: UpdateBudgetInput): Promise<Budget> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "plan.write");

			const values: Record<string, SqlValue> = {};
			if (input.amount !== undefined) values.amount = checkAmount(input.amount);
			if (input.month !== undefined) values.month = checkMonth(input.month);

			await updateRow(context.write(), { table: budgets, spaceId: found.spaceId, id, values });
			return reachable(id);
		},

		async remove(id: string): Promise<void> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "plan.write");
			await softDeleteRow(context.write(), { table: budgets, spaceId: found.spaceId, id });
		},

		/**
		 * Every limit that applies to a month, with what has been spent against it. The
		 * day of the month matters, because the same number means something different on
		 * the third and on the twenty eighth.
		 */
		async progress(input: {
			spaceId: string;
			month: string;
			today?: string;
		}): Promise<BudgetWithProgress[]> {
			assertCan(context.actor(), input.spaceId, "plan.read");
			assertCan(context.actor(), input.spaceId, "transaction.read");
			checkMonth(input.month);

			const all = await listIn(input.spaceId);
			const applying = budgetsForMonth(all, input.month);
			if (applying.length === 0) return [];

			const [year, month] = input.month.split("-").map(Number);
			const daysInMonth = new Date(Date.UTC(year ?? 2026, month ?? 1, 0)).getUTCDate();
			const from = `${input.month}-01`;
			const to = `${input.month}-${String(daysInMonth).padStart(2, "0")}`;

			// The priority that counts is the one of the record, and otherwise the one of
			// its category, which is exactly what the join below reads.
			const where = [
				`t."space_id" = ?`,
				`t."deleted_at" IS NULL`,
				`t."happened_on" >= ?`,
				`t."happened_on" <= ?`,
			];
			const params: SqlValue[] = [input.spaceId, from, to];
			if (seesOwnRowsOnly(context.actor(), input.spaceId)) {
				where.push(`t."created_by" = ?`);
				params.push(context.actor().userId);
			}

			const rows = await context.driver.all(
				`SELECT t."amount" AS amount, t."kind" AS kind, t."category_id" AS category_id,
				        COALESCE(t."priority", c."priority") AS priority
				 FROM "transactions" t
				 LEFT JOIN "categories" c ON c."id" = t."category_id"
				 WHERE ${where.join(" AND ")}`,
				params,
			);

			const spending = rows.map((row) => ({
				amount: Number(row.amount),
				kind: String(row.kind),
				categoryId: row.category_id === null ? null : String(row.category_id),
				priority: row.priority === null ? null : String(row.priority),
			}));

			const today = input.today ?? `${input.month}-${String(daysInMonth).padStart(2, "0")}`;
			const dayOfMonth = today.startsWith(input.month) ? Number(today.slice(8)) : daysInMonth;

			return applying.map((budget) => ({
				...budget,
				progress: progressOf(budget, spending, { dayOfMonth, daysInMonth }),
			}));
		},
	};
}

export type BudgetsRepository = ReturnType<typeof createBudgetsRepository>;
