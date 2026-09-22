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

import { addColumnSql, createSchemaSql, type Dialect } from "./ddl.ts";
import { AUTH_TABLES } from "./schema/authTables.ts";
import { SCHEMA } from "./schema/tables.ts";
import { CARD_COLUMNS, TRANSACTION_TABLES } from "./schema/transactionTables.ts";
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
];

export const MIGRATIONS_TABLE = "schema_migrations";

export function createMigrationsTableSql(dialect: Dialect): string {
	const applied = dialect === "postgres" ? "BIGINT" : "INTEGER";
	return `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (\n\t"id" TEXT PRIMARY KEY NOT NULL,\n\t"applied_at" ${applied} NOT NULL\n)`;
}
