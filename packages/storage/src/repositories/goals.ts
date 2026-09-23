// Money set aside on purpose.
//
// A goal points at the account the money sits in, and what has been saved is simply the
// balance of that account. No parallel ledger, no contributions to record: moving money
// into the account is the contribution. That is why one account holds one goal at a
// time, and the repository says so instead of quietly adding the same money twice.
//
// The savings rule is the promise to do that before anything else. There is one per
// space, and it is compared against what actually went in this month.

import { parseCalendarDate } from "@cofre/core";
import { goals, savingsRules } from "@cofre/db";
import { assertCan, readableSpaceIds } from "../actor.ts";
import { asNumber, type SqlValue } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { type Goal, type SavingsMode, type SavingsRule, toGoal, toSavingsRule } from "../models.ts";
import { marks } from "../sql.ts";
import { insertRow, softDeleteRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

export type CreateGoalInput = {
	spaceId: string;
	name: string;
	targetAmount: number;
	accountId: string;
	targetDate?: string | null;
	notes?: string | null;
};

export type UpdateGoalInput = {
	name?: string;
	targetAmount?: number;
	targetDate?: string | null;
	notes?: string | null;
	archived?: boolean;
};

export type GoalProgress = Goal & {
	/** What is in the account right now, which is what has been saved. */
	saved: number;
	left: number;
	share: number;
	/** What would have to go in every month to arrive on time, when there is a date. */
	monthlyNeeded: number | null;
};

export type SavingsProgress = {
	rule: SavingsRule | null;
	/** What came in this month. */
	earned: number;
	/** What the rule says should be put aside out of it. */
	expected: number;
	/** What actually went into the account the rule points at. */
	put: number;
};

const SELECT = `SELECT "id", "space_id", "name", "target_amount", "target_date", "account_id",
	"notes", "achieved_at", "archived_at", "created_by", "created_at", "updated_at"
	FROM "goals"`;

const RULE_SELECT = `SELECT "id", "space_id", "mode", "value", "account_id", "created_by",
	"created_at", "updated_at"
	FROM "savings_rules"`;

export function createGoalsRepository(context: RepositoryContext) {
	async function reachable(id: string): Promise<Goal> {
		const spaceIds = readableSpaceIds(context.actor());
		if (spaceIds.length === 0) throw new NotFoundError("goal", id);
		const rows = await context.driver.all(
			`${SELECT} WHERE "id" = ? AND "space_id" IN (${marks(spaceIds.length)}) AND "deleted_at" IS NULL`,
			[id, ...spaceIds],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("goal", id);
		return toGoal(first);
	}

	async function accountIn(spaceId: string, accountId: string): Promise<void> {
		const rows = await context.driver.all(
			`SELECT "id" FROM "accounts" WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL`,
			[accountId, spaceId],
		);
		if (rows.length === 0) throw new NotFoundError("account", accountId);
	}

	/** What an account is worth right now, counting only what has actually happened. */
	async function balanceOf(accountId: string): Promise<number> {
		const rows = await context.driver.all(
			`SELECT a."initial_balance" AS initial,
			  COALESCE((SELECT SUM(CASE WHEN t."kind" = 'transfer' THEN -t."amount" ELSE t."amount" END)
			            FROM "transactions" t
			            WHERE t."account_id" = a."id" AND t."deleted_at" IS NULL
			              AND t."status" = 'settled'), 0) AS out_settled,
			  COALESCE((SELECT SUM(t."amount") FROM "transactions" t
			            WHERE t."counter_account_id" = a."id" AND t."deleted_at" IS NULL
			              AND t."status" = 'settled'), 0) AS in_settled
			 FROM "accounts" a WHERE a."id" = ?`,
			[accountId],
		);
		const row = rows[0];
		if (!row) return 0;
		return asNumber(row.initial) + asNumber(row.out_settled) + asNumber(row.in_settled);
	}

	/** Whole months left, and never less than one: there is always this month. */
	function monthsUntil(from: string, to: string): number {
		const start = parseCalendarDate(from);
		const end = parseCalendarDate(to);
		return Math.max(1, (end.year - start.year) * 12 + (end.month - start.month));
	}

	async function currentRule(spaceId: string): Promise<SavingsRule | null> {
		assertCan(context.actor(), spaceId, "plan.read");
		const rows = await context.driver.all(
			`${RULE_SELECT} WHERE "space_id" = ? AND "deleted_at" IS NULL ORDER BY "created_at" LIMIT 1`,
			[spaceId],
		);
		const first = rows[0];
		return first ? toSavingsRule(first) : null;
	}

	return {
		async list(spaceId: string, options: { includeArchived?: boolean } = {}): Promise<Goal[]> {
			assertCan(context.actor(), spaceId, "plan.read");
			const archived = options.includeArchived === true ? "" : ` AND "archived_at" IS NULL`;
			const rows = await context.driver.all(
				`${SELECT} WHERE "space_id" = ? AND "deleted_at" IS NULL${archived} ORDER BY "created_at"`,
				[spaceId],
			);
			return rows.map(toGoal);
		},

		async create(input: CreateGoalInput): Promise<Goal> {
			assertCan(context.actor(), input.spaceId, "plan.write");
			if (input.name.trim() === "") {
				throw new RuleError("nameIsRequired", "a goal needs a name");
			}
			if (!Number.isSafeInteger(input.targetAmount) || input.targetAmount <= 0) {
				throw new RuleError(
					"amountIsPositiveInteger",
					"a goal is an amount to reach, so it is positive",
				);
			}
			if (input.targetDate) parseCalendarDate(input.targetDate);
			await accountIn(input.spaceId, input.accountId);

			// Two goals on one account would count the same money twice, so this refuses
			// instead of showing both of them as nearly done.
			const taken = await context.driver.all(
				`SELECT "id" FROM "goals" WHERE "account_id" = ? AND "deleted_at" IS NULL
				 AND "archived_at" IS NULL`,
				[input.accountId],
			);
			if (taken.length > 0) {
				throw new RuleError(
					"accountAlreadyHasGoal",
					"this account already holds a goal, and one account holds one at a time",
				);
			}

			const id = await insertRow(context.write(), {
				table: goals,
				spaceId: input.spaceId,
				values: {
					name: input.name.trim(),
					target_amount: input.targetAmount,
					target_date: input.targetDate ?? null,
					account_id: input.accountId,
					notes: input.notes ?? null,
					achieved_at: null,
					archived_at: null,
					created_by: context.actor().userId,
				},
			});
			return reachable(id);
		},

		async update(id: string, input: UpdateGoalInput): Promise<Goal> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "plan.write");

			const values: Record<string, SqlValue> = {};
			if (input.name !== undefined) values.name = input.name.trim();
			if (input.targetAmount !== undefined) values.target_amount = input.targetAmount;
			if (input.targetDate !== undefined) {
				if (input.targetDate) parseCalendarDate(input.targetDate);
				values.target_date = input.targetDate;
			}
			if (input.notes !== undefined) values.notes = input.notes;
			if (input.archived !== undefined) values.archived_at = input.archived ? context.now() : null;

			await updateRow(context.write(), { table: goals, spaceId: found.spaceId, id, values });
			return reachable(id);
		},

		/** Says out loud that it is done, so the interface can stop asking about it. */
		async markAchieved(id: string): Promise<Goal> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "plan.write");
			await updateRow(context.write(), {
				table: goals,
				spaceId: found.spaceId,
				id,
				values: { achieved_at: context.now() },
			});
			return reachable(id);
		},

		async remove(id: string): Promise<void> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "plan.write");
			await softDeleteRow(context.write(), { table: goals, spaceId: found.spaceId, id });
		},

		/** Each goal with what is actually in the account behind it. */
		async progress(input: { spaceId: string; today: string }): Promise<GoalProgress[]> {
			assertCan(context.actor(), input.spaceId, "plan.read");
			assertCan(context.actor(), input.spaceId, "account.read");

			const rows = await context.driver.all(
				`${SELECT} WHERE "space_id" = ? AND "deleted_at" IS NULL AND "archived_at" IS NULL
				 ORDER BY "created_at"`,
				[input.spaceId],
			);

			const found: GoalProgress[] = [];
			for (const row of rows.map(toGoal)) {
				const saved = Math.max(0, await balanceOf(row.accountId));
				const left = Math.max(0, row.targetAmount - saved);
				found.push({
					...row,
					saved,
					left,
					share: row.targetAmount === 0 ? 0 : saved / row.targetAmount,
					monthlyNeeded:
						row.targetDate === null || left === 0
							? null
							: Math.ceil(left / monthsUntil(input.today, row.targetDate)),
				});
			}
			return found;
		},

		/** The one rule of the space, or nothing when nobody has written one. */
		readRule: currentRule,

		/** Writes the rule, or changes the one that is already there. */
		async setRule(input: {
			spaceId: string;
			mode: SavingsMode;
			value: number;
			accountId?: string | null;
		}): Promise<SavingsRule> {
			assertCan(context.actor(), input.spaceId, "plan.write");
			if (!Number.isSafeInteger(input.value) || input.value <= 0) {
				throw new RuleError("amountIsPositiveInteger", "the rule needs a number above zero");
			}
			if (input.mode === "percent" && input.value > 10_000) {
				throw new RuleError("percentIsTooLarge", "a share of what comes in cannot be over 100");
			}
			if (input.accountId) await accountIn(input.spaceId, input.accountId);

			const existing = await context.driver.all(
				`SELECT "id" FROM "savings_rules" WHERE "space_id" = ? AND "deleted_at" IS NULL LIMIT 1`,
				[input.spaceId],
			);
			const already = existing[0];

			if (already) {
				await updateRow(context.write(), {
					table: savingsRules,
					spaceId: input.spaceId,
					id: String(already.id),
					values: {
						mode: input.mode,
						value: input.value,
						account_id: input.accountId ?? null,
					},
				});
			} else {
				await insertRow(context.write(), {
					table: savingsRules,
					spaceId: input.spaceId,
					values: {
						mode: input.mode,
						value: input.value,
						account_id: input.accountId ?? null,
						created_by: context.actor().userId,
					},
				});
			}

			const rule = await currentRule(input.spaceId);
			if (!rule) throw new NotFoundError("savingsRule", input.spaceId);
			return rule;
		},

		async clearRule(spaceId: string): Promise<void> {
			assertCan(context.actor(), spaceId, "plan.write");
			const existing = await context.driver.all(
				`SELECT "id" FROM "savings_rules" WHERE "space_id" = ? AND "deleted_at" IS NULL`,
				[spaceId],
			);
			for (const row of existing) {
				await softDeleteRow(context.write(), {
					table: savingsRules,
					spaceId,
					id: String(row.id),
				});
			}
		},

		/**
		 * What the rule asked for this month against what went in. Money that went in is
		 * money that reached the account the rule points at, whoever moved it.
		 */
		async savings(input: { spaceId: string; month: string }): Promise<SavingsProgress> {
			assertCan(context.actor(), input.spaceId, "plan.read");
			assertCan(context.actor(), input.spaceId, "transaction.read");

			const rule = await currentRule(input.spaceId);
			const [year, month] = input.month.split("-").map(Number);
			const days = new Date(Date.UTC(year ?? 2026, month ?? 1, 0)).getUTCDate();
			const from = `${input.month}-01`;
			const to = `${input.month}-${String(days).padStart(2, "0")}`;

			const earnedRows = await context.driver.all(
				`SELECT COALESCE(SUM("amount"), 0) AS total FROM "transactions"
				 WHERE "space_id" = ? AND "deleted_at" IS NULL AND "kind" = 'income'
				   AND "status" = 'settled' AND "happened_on" >= ? AND "happened_on" <= ?`,
				[input.spaceId, from, to],
			);
			const earned = asNumber(earnedRows[0]?.total ?? 0);

			let put = 0;
			if (rule?.accountId) {
				const intoRows = await context.driver.all(
					`SELECT COALESCE(SUM("amount"), 0) AS total FROM "transactions"
					 WHERE "space_id" = ? AND "deleted_at" IS NULL AND "status" = 'settled'
					   AND "counter_account_id" = ? AND "happened_on" >= ? AND "happened_on" <= ?`,
					[input.spaceId, rule.accountId, from, to],
				);
				put = asNumber(intoRows[0]?.total ?? 0);
			}

			const expected =
				rule === null
					? 0
					: rule.mode === "fixed"
						? rule.value
						: Math.round((earned * rule.value) / 10_000);

			return { rule, earned, expected, put };
		},
	};
}

export type GoalsRepository = ReturnType<typeof createGoalsRepository>;
