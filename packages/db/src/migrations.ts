// Migrations, in order. The runner lives in the storage package, because it needs a
// database to talk to. This file only says what has to happen.
//
// The rule when the schema changes: describe the change in `schema/tables.ts` and add
// a migration here with the explicit statements for a database that already exists.
// The first migration is generated from the description, so a brand new database and
// a migrated one end up identical. The drift test in the conformance suite fails if
// they ever stop being identical.

import { createSchemaSql, type Dialect } from "./ddl.ts";
import { AUTH_TABLES } from "./schema/authTables.ts";
import { SCHEMA } from "./schema/tables.ts";

export type Migration = {
	id: string;
	statements: (dialect: Dialect) => string[];
};

export const MIGRATIONS: readonly Migration[] = [
	{
		id: "0001_initial",
		statements: (dialect) => createSchemaSql(SCHEMA, dialect),
	},
	// Every statement is written to be harmless on a database that already has the
	// table, so the baseline above can keep creating everything for a fresh install
	// while an older database catches up here.
	{
		id: "0002_authentication_and_invitations",
		statements: (dialect) => createSchemaSql([...AUTH_TABLES], dialect),
	},
];

export const MIGRATIONS_TABLE = "schema_migrations";

export function createMigrationsTableSql(dialect: Dialect): string {
	const applied = dialect === "postgres" ? "BIGINT" : "INTEGER";
	return `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (\n\t"id" TEXT PRIMARY KEY NOT NULL,\n\t"applied_at" ${applied} NOT NULL\n)`;
}
