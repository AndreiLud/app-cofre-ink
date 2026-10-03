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
 * Which pot a voucher account is, when it is one. VA and VR are one pot here: the law
 * that kept them apart stopped mattering to somebody adding up their month, the same
 * card usually carries both, and two options that nobody could tell apart is worse than
 * one. VT is a different pot, and so are culture and mobility, and Caju and Flash hand
 * out several of them behind a single card.
 *
 * Empty on every account that is not a voucher, which is why it is a column of its own
 * rather than six more account kinds: the kind says what the money is, this says which
 * flavour of the same thing, and widening a list a database already checks is a table
 * rebuild in SQLite.
 *
 * "food" is here and nowhere else. It was the separate VA, and migration 0012 turned
 * every row carrying it into "meal". It stays in the list a database checks because
 * narrowing that check is the same table rebuild, and because a row arriving from a
 * device that has not migrated yet has to be accepted rather than refused. Nothing
 * writes it: the type in `packages/storage` does not have it, and what is read is
 * folded into "meal" there.
 */
export const BENEFIT_KINDS = ["meal", "food", "transport", "culture", "mobility"] as const;

/** Added to the accounts table by migration 0011, and declared below as well. */
export const ACCOUNT_BENEFIT_COLUMNS = [
	{ name: "benefit", type: "text" as const, check: inList("benefit", BENEFIT_KINDS) },
];

/**
 * What a benefit account is credited with, and what happens to what is left of it.
 *
 * A voucher is not an account somebody pays money into: it is an allowance that arrives
 * on a day each month and is spent down. Nothing is written when it arrives, because
 * nothing arrives, so what is left has to be worked out from the allowance and the
 * spending rather than read off a balance.
 *
 * Whether the leftover carries is the one thing that differs between the cards people
 * actually hold. A meal card keeps what was not eaten; a transport card is usually
 * topped back up to the same amount and the rest is gone. Both exist, so it is a column
 * and not an assumption.
 */
export const ACCOUNT_QUOTA_COLUMNS = [
	/** In minor units, as every amount here. Empty on an account that is not a voucher. */
	{ name: "quota_amount", type: "bigint" as const },
	/** The day of the month the allowance lands, one to thirty one. */
	{ name: "quota_day", type: "integer" as const },
	/** Whether what is left at the end of the period carries into the next one. */
	{ name: "quota_carries", type: "integer" as const },
];

/**
 * The history of an allowance, which decision 4 of 2.0.0 needs: a change applies from the
 * next landing onwards and never rewrites one that already landed, so the versions before
 * the current one are kept, each with the first day it applied from.
 *
 * Kept on the account rather than in a table of its own. It is a handful of entries read
 * whole with the account and written with it, and as part of the row it travels, is backed
 * up and is restored with the account without a second path for any of that.
 */
export const ACCOUNT_QUOTA_HISTORY_COLUMNS = [
	/** The first day the current allowance applies from, empty when it applies from the start. */
	{ name: "quota_since", type: "text" as const },
	/** The versions before the current one, oldest first, as JSON. Empty when there are none. */
	{ name: "quota_before", type: "text" as const },
];

/**
 * The day somebody said what was on a voucher that carries, which is decision 3 of 2.0.0.
 * The amount is the opening balance; this is the day it was true on, and counting starts
 * there. Empty on a card nobody said anything about, and on a card from release 1.0, whose
 * opening balance was true on the day it was written down.
 */
export const ACCOUNT_KNOWN_BALANCE_COLUMNS = [{ name: "balance_known_on", type: "text" as const }];

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
		...ACCOUNT_QUOTA_COLUMNS,
		...ACCOUNT_QUOTA_HISTORY_COLUMNS,
		...ACCOUNT_KNOWN_BALANCE_COLUMNS,
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
	// These point at accounts, and a movement of a holding at the record that moved the money,
	// so they come after the records; and a goal and the savings rule point at a holding, so
	// they come before those. A restore writes the tables in this order.
	...INVESTMENT_TABLES,
	// These point at transactions, so they come after them.
	...PLAN_TABLES,
	...VIEW_TABLES,
];

export function tableByName(name: string): Table {
	const found = SCHEMA.find((table) => table.name === name);
	if (!found) throw new Error(`there is no table called "${name}"`);
	return found;
}
