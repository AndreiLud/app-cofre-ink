// Deciding money before spending it, and dividing it afterwards.
//
// A budget is a limit somebody set. A goal is an amount somebody wants to reach. The
// savings rule is the promise to put money aside before anything else. A split says
// how much of one expense belongs to each person, and a settlement is the moment two
// people call it even.

import { PRIORITIES } from "./categoryTables.ts";
import { defineTable } from "./types.ts";

export const BUDGET_SCOPES = ["total", "priority", "category"] as const;
export const SAVINGS_MODES = ["percent", "fixed"] as const;

function inList(column: string, values: readonly string[]): string {
	return `${column} in (${values.map((value) => `'${value}'`).join(", ")})`;
}

export const budgets = defineTable({
	name: "budgets",
	scope: "space",
	columns: [
		{ name: "scope", type: "text", notNull: true, check: inList("scope", BUDGET_SCOPES) },
		/** Set when the scope is category, and empty otherwise. */
		{
			name: "category_id",
			type: "text",
			references: { table: "categories", column: "id", onDelete: "cascade" },
		},
		/** Set when the scope is priority, and empty otherwise. */
		{ name: "priority", type: "text", check: inList("priority", PRIORITIES) },
		/**
		 * The month this limit is for. Empty means every month, which is what most
		 * limits are, and a month of its own overrides it when one month is different.
		 */
		{ name: "month", type: "text" },
		/** A positive number of minor units. A limit is not a negative amount. */
		{ name: "amount", type: "bigint", notNull: true },
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
	indexes: [{ name: "budgets_by_space_and_month", columns: ["space_id", "month"] }],
});

export const goals = defineTable({
	name: "goals",
	scope: "space",
	columns: [
		{ name: "name", type: "text", notNull: true },
		{ name: "target_amount", type: "bigint", notNull: true },
		{ name: "target_date", type: "text" },
		/**
		 * Where the money for this goal sits. What has been saved is the balance of that
		 * account, which is why one account holds at most one goal at a time.
		 */
		{
			name: "account_id",
			type: "text",
			notNull: true,
			references: { table: "accounts", column: "id", onDelete: "cascade" },
		},
		{ name: "notes", type: "text" },
		{ name: "achieved_at", type: "bigint" },
		{ name: "archived_at", type: "bigint" },
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
	indexes: [{ name: "goals_by_account", columns: ["account_id"] }],
});

export const savingsRules = defineTable({
	name: "savings_rules",
	scope: "space",
	columns: [
		{ name: "mode", type: "text", notNull: true, check: inList("mode", SAVINGS_MODES) },
		/** Hundredths of a percent when the mode is percent, minor units when it is fixed. */
		{ name: "value", type: "bigint", notNull: true },
		/** Where the money is meant to go, so the rule can say whether it went. */
		{
			name: "account_id",
			type: "text",
			references: { table: "accounts", column: "id", onDelete: "setNull" },
		},
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
});

export const expenseSplits = defineTable({
	name: "expense_splits",
	scope: "space",
	columns: [
		{
			name: "transaction_id",
			type: "text",
			notNull: true,
			references: { table: "transactions", column: "id", onDelete: "cascade" },
		},
		{
			name: "user_id",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "cascade" },
		},
		/** The part of the expense that belongs to this person, in minor units. */
		{ name: "amount", type: "bigint", notNull: true },
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
	indexes: [
		{ name: "splits_by_transaction", columns: ["transaction_id"] },
		{ name: "splits_by_person", columns: ["space_id", "user_id"] },
	],
	// One person has one share of one expense, and the repository is what keeps it that
	// way. A constraint in the database cannot: a deleted row stays behind as a
	// tombstone, so that dividing the same expense again would collide with a share
	// that is already gone.
});

export const settlements = defineTable({
	name: "settlements",
	scope: "space",
	columns: [
		{
			name: "from_user_id",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
		{
			name: "to_user_id",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
		{ name: "amount", type: "bigint", notNull: true },
		{ name: "currency", type: "text", notNull: true, defaultTo: "'BRL'" },
		{ name: "happened_on", type: "text", notNull: true },
		{ name: "note", type: "text" },
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
	indexes: [{ name: "settlements_by_space_and_day", columns: ["space_id", "happened_on"] }],
});

/** Added to space_members by migration 0007, for the split that follows income. */
export const MEMBER_INCOME_COLUMNS = [{ name: "monthly_income", type: "bigint" as const }];

export const PLAN_TABLES = [budgets, goals, savingsRules, expenseSplits, settlements] as const;
