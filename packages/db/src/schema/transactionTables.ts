// Transactions, and what a credit card needs to know about itself.
//
// A transfer is one row, not two. The person did one thing, moving money from one
// account to another, and keeping it as one row is what stops a transfer from being
// counted as income on one side and expense on the other in every report.

import { PRIORITIES } from "./categoryTables.ts";
import { defineTable } from "./types.ts";

export const TRANSACTION_KINDS = ["income", "expense", "transfer"] as const;
export const TRANSACTION_STATES = ["planned", "settled"] as const;

function inList(column: string, values: readonly string[]): string {
	return `${column} in (${values.map((value) => `'${value}'`).join(", ")})`;
}

/** Columns a credit card needs, added to the accounts table by migration 0003. */
export const CARD_COLUMNS = [
	{ name: "closing_day", type: "integer" as const },
	{ name: "due_day", type: "integer" as const },
	{ name: "credit_limit", type: "bigint" as const },
];

/** Added to the transactions table by migration 0005, and declared below as well. */
export const TRANSACTION_CATEGORY_COLUMNS = [
	{
		name: "category_id",
		type: "text" as const,
		references: { table: "categories", column: "id", onDelete: "setNull" as const },
	},
	/**
	 * Empty means the priority of the category. A pharmacy is essential on the day
	 * somebody is ill and superfluous on the day it was a second bottle of shampoo, so
	 * one record can say something different from the category it belongs to.
	 */
	{ name: "priority", type: "text" as const, check: inList("priority", PRIORITIES) },
];

/** Added to the transactions table by migration 0006, and declared below as well. */
export const TRANSACTION_RECURRENCE_COLUMNS = [
	{
		name: "recurrence_id",
		type: "text" as const,
		references: { table: "recurrences", column: "id", onDelete: "setNull" as const },
	},
];

export const transactions = defineTable({
	name: "transactions",
	scope: "space",
	columns: [
		{ name: "kind", type: "text", notNull: true, check: inList("kind", TRANSACTION_KINDS) },
		{ name: "status", type: "text", notNull: true, check: inList("status", TRANSACTION_STATES) },
		/**
		 * Signed minor units: an expense is negative, income is positive, and a transfer
		 * is positive and means "this much left the origin and reached the destination".
		 * The sign is checked against the kind on every write.
		 */
		{ name: "amount", type: "bigint", notNull: true },
		{ name: "currency", type: "text", notNull: true, defaultTo: "'BRL'" },
		/** Scaled by ten to the eighth, recorded when the money is not in the base currency. */
		{ name: "fx_rate", type: "bigint" },
		/** The same amount in the currency of the space, frozen at the time of writing. */
		{ name: "amount_in_base", type: "bigint", notNull: true },
		{ name: "happened_on", type: "text", notNull: true },
		{ name: "description", type: "text", notNull: true },
		{
			name: "account_id",
			type: "text",
			notNull: true,
			references: { table: "accounts", column: "id", onDelete: "restrict" },
		},
		/** Where the money went, for a transfer. Empty for anything else. */
		{
			name: "counter_account_id",
			type: "text",
			references: { table: "accounts", column: "id", onDelete: "restrict" },
		},
		{ name: "notes", type: "text" },
		{ name: "reconciled_at", type: "bigint" },
		/** Ties the parts of one purchase together, so they can be edited as one. */
		{ name: "installment_group", type: "text" },
		{ name: "installment_number", type: "integer" },
		{ name: "installment_count", type: "integer" },
		/**
		 * The invoice a card purchase belongs to, as a calendar month. Written once, so
		 * changing the closing day later does not move a purchase that already closed.
		 */
		{ name: "invoice_month", type: "text" },
		...TRANSACTION_CATEGORY_COLUMNS,
		...TRANSACTION_RECURRENCE_COLUMNS,
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
	indexes: [
		{ name: "transactions_by_category", columns: ["category_id"] },
		{ name: "transactions_by_recurrence", columns: ["recurrence_id", "happened_on"] },
		{ name: "transactions_by_space_and_date", columns: ["space_id", "happened_on"] },
		{ name: "transactions_by_account", columns: ["account_id", "happened_on"] },
		{ name: "transactions_by_invoice", columns: ["account_id", "invoice_month"] },
		{ name: "transactions_by_group", columns: ["installment_group"] },
		{ name: "transactions_by_author", columns: ["space_id", "created_by"] },
	],
});

export const TRANSACTION_TABLES = [transactions] as const;
