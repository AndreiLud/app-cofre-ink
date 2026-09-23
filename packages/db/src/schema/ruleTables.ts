// Two tables that write records so that a person does not have to.
//
// A rule says "whenever the description looks like this, it belongs there". A
// recurrence says "this happens every month, and here is what it looks like". Both
// exist for the same reason: the records somebody types by hand are the ones that stop
// being typed after three weeks.

import { PRIORITIES } from "./categoryTables.ts";
import { TRANSACTION_KINDS } from "./transactionTables.ts";
import { defineTable } from "./types.ts";

export const RECURRENCE_FREQUENCIES = ["weekly", "monthly", "yearly"] as const;

function inList(column: string, values: readonly string[]): string {
	return `${column} in (${values.map((value) => `'${value}'`).join(", ")})`;
}

export const categorizationRules = defineTable({
	name: "categorization_rules",
	scope: "space",
	columns: [
		/** Matched against the description, ignoring case, accents and where it sits. */
		{ name: "match_text", type: "text", notNull: true },
		/** Narrows the rule to one account, for a card that is only used for one thing. */
		{
			name: "account_id",
			type: "text",
			references: { table: "accounts", column: "id", onDelete: "cascade" },
		},
		{ name: "kind", type: "text", check: inList("kind", TRANSACTION_KINDS) },
		{
			name: "category_id",
			type: "text",
			notNull: true,
			references: { table: "categories", column: "id", onDelete: "cascade" },
		},
		{ name: "priority", type: "text", check: inList("priority", PRIORITIES) },
		/** Lowest first, and the first rule that matches is the one that applies. */
		{ name: "position", type: "integer", notNull: true, defaultTo: 0 },
		/** Set while the rule is switched off, instead of deleting it. */
		{ name: "disabled_at", type: "bigint" },
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
	indexes: [{ name: "rules_by_space_and_position", columns: ["space_id", "position"] }],
});

export const recurrences = defineTable({
	name: "recurrences",
	scope: "space",
	columns: [
		{ name: "description", type: "text", notNull: true },
		{ name: "kind", type: "text", notNull: true, check: inList("kind", TRANSACTION_KINDS) },
		/** Always positive, as everywhere. The direction comes from the kind. */
		{ name: "amount", type: "bigint", notNull: true },
		{ name: "currency", type: "text", notNull: true, defaultTo: "'BRL'" },
		{
			name: "account_id",
			type: "text",
			notNull: true,
			references: { table: "accounts", column: "id", onDelete: "cascade" },
		},
		{
			name: "counter_account_id",
			type: "text",
			references: { table: "accounts", column: "id", onDelete: "cascade" },
		},
		{
			name: "category_id",
			type: "text",
			references: { table: "categories", column: "id", onDelete: "setNull" },
		},
		{ name: "priority", type: "text", check: inList("priority", PRIORITIES) },
		{
			name: "frequency",
			type: "text",
			notNull: true,
			check: inList("frequency", RECURRENCE_FREQUENCIES),
		},
		/** Every this many periods. Two with a monthly frequency is every other month. */
		{ name: "interval_count", type: "integer", notNull: true, defaultTo: 1 },
		{ name: "day_of_month", type: "integer" },
		/** Zero is Sunday, six is Saturday. */
		{ name: "weekday", type: "integer" },
		{ name: "month_of_year", type: "integer" },
		{ name: "starts_on", type: "text", notNull: true },
		{ name: "ends_on", type: "text" },
		{ name: "notes", type: "text" },
		/** Set while it is on hold, which is not the same as having ended. */
		{ name: "paused_at", type: "bigint" },
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
	indexes: [{ name: "recurrences_by_space", columns: ["space_id", "starts_on"] }],
});

// The column that ties a written record back to the recurrence that wrote it lives in
// the transactions file, so that this one can keep importing from it without a circle.

export const RULE_TABLES = [recurrences, categorizationRules] as const;
