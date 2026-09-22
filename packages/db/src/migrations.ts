// Migrations, in order. The runner lives in the storage package, because it needs a
// database to talk to. This file only says what has to happen.
//
// Two shapes of change, and they are handled differently.
//
// A new table is created by the baseline as well, so its migration just repeats the
// creation with "if not exists" and costs nothing on a fresh database.
//
// A new column on an existing table cannot work that way: the baseline already writes
// it, so an unguarded ALTER would fail on a fresh database and succeed on an old one.
// That is what the context is for. It says what the database already has, so a
// migration can add only what is missing.

import { addColumnSql, createIndexSql, createSchemaSql, type Dialect } from "./ddl.ts";
import { AUTH_TABLES } from "./schema/authTables.ts";
import { CATEGORY_TABLES } from "./schema/categoryTables.ts";
import { MEMBER_INCOME_COLUMNS, PLAN_TABLES } from "./schema/planTables.ts";
import { RULE_TABLES } from "./schema/ruleTables.ts";
import { SCHEMA } from "./schema/tables.ts";
import {
	CARD_COLUMNS,
	TRANSACTION_CATEGORY_COLUMNS,
	TRANSACTION_IMPORT_COLUMNS,
	TRANSACTION_PAYER_COLUMNS,
	TRANSACTION_RECURRENCE_COLUMNS,
	TRANSACTION_TABLES,
	transactions,
} from "./schema/transactionTables.ts";
import { VIEW_TABLES } from "./schema/viewTables.ts";

export type MigrationContext = {
	dialect: Dialect;
	hasTable: (table: string) => boolean;
	hasColumn: (table: string, column: string) => boolean;
};

export type Migration = {
	id: string;
	statements: (context: MigrationContext) => string[];
};

export const MIGRATIONS: readonly Migration[] = [
	{
		id: "0001_initial",
		statements: (context) => createSchemaSql(SCHEMA, context.dialect),
	},
	{
		id: "0002_authentication_and_invitations",
		statements: (context) => createSchemaSql([...AUTH_TABLES], context.dialect),
	},
	{
		id: "0003_transactions_and_cards",
		statements: (context) => [
			...createSchemaSql([...TRANSACTION_TABLES], context.dialect),
			...CARD_COLUMNS.filter((column) => !context.hasColumn("accounts", column.name)).map(
				(column) => addColumnSql("accounts", column, context.dialect),
			),
		],
	},
	{
		id: "0004_saved_filters",
		statements: (context) => createSchemaSql([...VIEW_TABLES], context.dialect),
	},
	{
		id: "0005_categories_and_priority",
		statements: (context) => [
			...createSchemaSql([...CATEGORY_TABLES], context.dialect),
			...TRANSACTION_CATEGORY_COLUMNS.filter(
				(column) => !context.hasColumn("transactions", column.name),
			).map((column) => addColumnSql("transactions", column, context.dialect)),
			// A database from before this migration never saw the index over the column
			// that was just added. Creating them all again costs nothing.
			...createIndexSql(transactions, context.dialect),
		],
	},
	{
		id: "0006_rules_and_recurrences",
		statements: (context) => [
			...createSchemaSql([...RULE_TABLES], context.dialect),
			...TRANSACTION_RECURRENCE_COLUMNS.filter(
				(column) => !context.hasColumn("transactions", column.name),
			).map((column) => addColumnSql("transactions", column, context.dialect)),
			...createIndexSql(transactions, context.dialect),
		],
	},
	{
		id: "0007_budgets_goals_and_splitting",
		statements: (context) => [
			...TRANSACTION_PAYER_COLUMNS.filter(
				(column) => !context.hasColumn("transactions", column.name),
			).map((column) => addColumnSql("transactions", column, context.dialect)),
			...MEMBER_INCOME_COLUMNS.filter(
				(column) => !context.hasColumn("space_members", column.name),
			).map((column) => addColumnSql("space_members", column, context.dialect)),
			...createSchemaSql([...PLAN_TABLES], context.dialect),
		],
	},
	{
		id: "0008_imported_records",
		statements: (context) => [
			...TRANSACTION_IMPORT_COLUMNS.filter(
				(column) => !context.hasColumn("transactions", column.name),
			).map((column) => addColumnSql("transactions", column, context.dialect)),
			...createIndexSql(transactions, context.dialect),
		],
	},
];

export const MIGRATIONS_TABLE = "schema_migrations";

export function createMigrationsTableSql(dialect: Dialect): string {
	const applied = dialect === "postgres" ? "BIGINT" : "INTEGER";
	return `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (\n\t"id" TEXT PRIMARY KEY NOT NULL,\n\t"applied_at" ${applied} NOT NULL\n)`;
}
