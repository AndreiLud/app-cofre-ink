// The tables of Cofre. Phase 1 covers people, spaces, membership, one account table
// to exercise the space scope, and the change log that every write passes through.

import { AUTH_TABLES } from "./authTables.ts";
import { CARD_TABLES } from "./cardTables.ts";
import { CATEGORY_TABLES } from "./categoryTables.ts";
import { INVESTMENT_TABLES } from "./investmentTables.ts";
import { PLAN_TABLES } from "./planTables.ts";
import { RULE_TABLES } from "./ruleTables.ts";
import { TRANSACTION_TABLES } from "./transactionTables.ts";
import { defineTable, type Table } from "./types.ts";
import { VIEW_TABLES } from "./viewTables.ts";

export const ROLES = ["owner", "admin", "editor", "viewer", "logger"] as const;
export const SPACE_KINDS = ["personal", "shared"] as const;
export const MEMBER_STATES = ["invited", "active", "removed"] as const;
export const ACCOUNT_KINDS = [
	"checking",
	"savings",
	"cash",
	"credit",
	"voucher",
	"investment",
] as const;

/**
 * Which pot a voucher account is, when it is one. VR and VA are not the same money:
 * one buys a meal already made and the other buys the shopping, and a shop that takes
 * one may refuse the other. VT is a third pot again, and Caju and Flash hand out
 * several of them behind a single card.
 *
 * Empty on every account that is not a voucher, which is why it is a column of its own
 * rather than six more account kinds: the kind says what the money is, this says which
 * flavour of the same thing, and widening a list a database already checks is a table
 * rebuild in SQLite.
 */
export const BENEFIT_KINDS = ["meal", "food", "transport", "culture", "mobility"] as const;

/** Added to the accounts table by migration 0011, and declared below as well. */
export const ACCOUNT_BENEFIT_COLUMNS = [
	{ name: "benefit", type: "text" as const, check: inList("benefit", BENEFIT_KINDS) },
];

function inList(column: string, values: readonly string[]): string {
	return `${column} in (${values.map((value) => `'${value}'`).join(", ")})`;
}

/** People. Managed by the authentication layer in server mode, local in browser mode. */
export const users = defineTable({
	name: "users",
	scope: "global",
	replicated: false,
	columns: [
		{ name: "email", type: "text", notNull: true, unique: true },
		{ name: "name", type: "text", notNull: true },
		{ name: "image", type: "text" },
		{ name: "email_verified", type: "integer", notNull: true, defaultTo: 0 },
		{ name: "created_at", type: "bigint", notNull: true },
		{ name: "updated_at", type: "bigint", notNull: true },
	],
});

/**
 * Added by migration 0009. The stamp up to which the log of this space has been folded
 * into one entry per row. Everything before it is settled, and an entry from before it
 * about a row that is already here is an entry that has already been counted.
 */
export const SPACE_COMPACTION_COLUMNS = [{ name: "compacted_before", type: "text" as const }];

/** A slice of money life. The personal one is private and cannot be shared. */
export const spaces = defineTable({
	name: "spaces",
	scope: "global",
	columns: [
		{ name: "kind", type: "text", notNull: true, check: inList("kind", SPACE_KINDS) },
		{ name: "name", type: "text", notNull: true },
		{ name: "colour", type: "text", notNull: true, defaultTo: "'slate'" },
		{ name: "icon", type: "text", notNull: true, defaultTo: "'wallet'" },
		{ name: "base_currency", type: "text", notNull: true, defaultTo: "'BRL'" },
		{ name: "timezone", type: "text", notNull: true, defaultTo: "'America/Sao_Paulo'" },
		...SPACE_COMPACTION_COLUMNS,
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
	indexes: [{ name: "spaces_by_creator", columns: ["created_by"] }],
});

/** Who belongs to a space, and with which powers. */
export const spaceMembers = defineTable({
	name: "space_members",
	scope: "membership",
	columns: [
		{
			name: "user_id",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "cascade" },
		},
		{ name: "role", type: "text", notNull: true, check: inList("role", ROLES) },
		{ name: "state", type: "text", notNull: true, check: inList("state", MEMBER_STATES) },
		{ name: "invited_by", type: "text" },
		{ name: "accepted_at", type: "bigint" },
		// What this person earns in a month, used only by the split that follows income.
		// Nobody has to fill it in, and it is never shown as a number about a person.
		{ name: "monthly_income", type: "bigint" },
	],
	indexes: [{ name: "space_members_by_user", columns: ["user_id"] }],
	uniqueTogether: [["space_id", "user_id"]],
});

/** Where the money sits. The first table in the space scope. */
export const accounts = defineTable({
	name: "accounts",
	scope: "space",
	columns: [
		{ name: "kind", type: "text", notNull: true, check: inList("kind", ACCOUNT_KINDS) },
		{ name: "name", type: "text", notNull: true },
		{ name: "currency", type: "text", notNull: true, defaultTo: "'BRL'" },
		{ name: "initial_balance", type: "bigint", notNull: true, defaultTo: 0 },
		{ name: "institution", type: "text" },
		{ name: "archived_at", type: "bigint" },
		// What a credit card needs. Empty on every other kind of account.
		{ name: "closing_day", type: "integer" },
		{ name: "due_day", type: "integer" },
		{ name: "credit_limit", type: "bigint" },
		...ACCOUNT_BENEFIT_COLUMNS,
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
	indexes: [{ name: "accounts_by_space_and_kind", columns: ["space_id", "kind"] }],
});

/**
 * Every write appends here. Nothing reads it yet: the replication engine of phase 6
 * does, and the activity screen reads it too. Writing it from the first day is what
 * makes both possible without a migration over real data.
 */
export const changes = defineTable({
	name: "changes",
	scope: "membership",
	replicated: false,
	columns: [
		{ name: "entity", type: "text", notNull: true },
		{ name: "entity_id", type: "text", notNull: true },
		{
			name: "operation",
			type: "text",
			notNull: true,
			check: inList("operation", ["insert", "update", "delete"]),
		},
		{ name: "payload", type: "json", notNull: true },
		{ name: "hlc", type: "text", notNull: true },
		{ name: "device_id", type: "text", notNull: true },
		{ name: "actor_id", type: "text" },
		{ name: "created_at", type: "bigint", notNull: true },
	],
	indexes: [
		{ name: "changes_by_space_and_stamp", columns: ["space_id", "hlc"] },
		{ name: "changes_by_entity", columns: ["entity", "entity_id"] },
	],
});

export const SCHEMA: readonly Table[] = [
	users,
	spaces,
	spaceMembers,
	accounts,
	// The plastic that reaches an account, so it comes after them and before the
	// records that name one.
	...CARD_TABLES,
	changes,
	...AUTH_TABLES,
	// Categories and recurrences come before transactions, which point at both.
	...CATEGORY_TABLES,
	...RULE_TABLES,
	...TRANSACTION_TABLES,
	// These point at transactions, so they come after them.
	...PLAN_TABLES,
	...VIEW_TABLES,
	// And these point at accounts.
	...INVESTMENT_TABLES,
];

export function tableByName(name: string): Table {
	const found = SCHEMA.find((table) => table.name === name);
	if (!found) throw new Error(`there is no table called "${name}"`);
	return found;
}
