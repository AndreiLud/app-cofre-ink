// The tables of Cofre. Phase 1 covers people, spaces, membership, one account table
// to exercise the space scope, and the change log that every write passes through.

import { AUTH_TABLES } from "./authTables.ts";
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
	changes,
	...AUTH_TABLES,
	...TRANSACTION_TABLES,
	...VIEW_TABLES,
];

export function tableByName(name: string): Table {
	const found = SCHEMA.find((table) => table.name === name);
	if (!found) throw new Error(`there is no table called "${name}"`);
	return found;
}
