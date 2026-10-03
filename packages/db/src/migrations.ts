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
import { CARD_TABLES } from "./schema/cardTables.ts";
import { CATEGORY_TABLES } from "./schema/categoryTables.ts";
import { INVESTMENT_TABLES } from "./schema/investmentTables.ts";
import { MEMBER_INCOME_COLUMNS, PLAN_TABLES } from "./schema/planTables.ts";
import { RECURRENCE_CHAIN_COLUMNS, RULE_TABLES, recurrenceSkips } from "./schema/ruleTables.ts";
import {
	ACCOUNT_BENEFIT_COLUMNS,
	ACCOUNT_KNOWN_BALANCE_COLUMNS,
	ACCOUNT_QUOTA_COLUMNS,
	ACCOUNT_QUOTA_HISTORY_COLUMNS,
	SCHEMA,
	SPACE_COMPACTION_COLUMNS,
} from "./schema/tables.ts";
import {
	CARD_COLUMNS,
	TRANSACTION_CARD_COLUMNS,
	TRANSACTION_CATEGORY_COLUMNS,
	TRANSACTION_IMPORT_COLUMNS,
	TRANSACTION_INVOICE_COLUMNS,
	TRANSACTION_ORIGIN_INVOICE_COLUMNS,
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
	{
		id: "0009_compacted_log",
		statements: (context) =>
			SPACE_COMPACTION_COLUMNS.filter((column) => !context.hasColumn("spaces", column.name)).map(
				(column) => addColumnSql("spaces", column, context.dialect),
			),
	},
	{
		id: "0010_investments_and_scenarios",
		statements: (context) => createSchemaSql([...INVESTMENT_TABLES], context.dialect),
	},
	{
		id: "0011_cards_and_benefits",
		statements: (context) => [
			...createSchemaSql([...CARD_TABLES], context.dialect),
			...ACCOUNT_BENEFIT_COLUMNS.filter(
				(column) => !context.hasColumn("accounts", column.name),
			).map((column) => addColumnSql("accounts", column, context.dialect)),
			...TRANSACTION_CARD_COLUMNS.filter(
				(column) => !context.hasColumn("transactions", column.name),
			).map((column) => addColumnSql("transactions", column, context.dialect)),
			...createIndexSql(transactions, context.dialect),
		],
	},
	{
		/**
		 * VA and VR became one pot, so the rows that said VA now say the one that is
		 * left. A data migration rather than a schema one, and the only one so far: it
		 * changes what a row says, not what a row can say.
		 *
		 * It does not travel. Every device runs its own migrations, and an entry in the
		 * change log about this would be a write nobody made.
		 */
		id: "0012_one_food_benefit",
		statements: () => [`UPDATE "accounts" SET "benefit" = 'meal' WHERE "benefit" = 'food'`],
	},
	{
		/**
		 * A benefit account becomes an allowance with a day on it.
		 *
		 * Nothing is written for the leftover of an account that already exists, because
		 * the opening balance is where that money already is: somebody who typed what was
		 * on the card the day they added it has the right number, and it goes on counting
		 * as the starting point of what has carried.
		 */
		id: "0013_benefit_quota",
		statements: (context) =>
			ACCOUNT_QUOTA_COLUMNS.filter((column) => !context.hasColumn("accounts", column.name)).map(
				(column) => addColumnSql("accounts", column, context.dialect),
			),
	},
	{
		/**
		 * An invoice can be chosen rather than worked out, which a payment needs and a
		 * purchase the bank closed a day early needs too.
		 */
		id: "0014_invoice_by_hand",
		statements: (context) =>
			TRANSACTION_INVOICE_COLUMNS.filter(
				(column) => !context.hasColumn("transactions", column.name),
			).map((column) => addColumnSql("transactions", column, context.dialect)),
	},
	{
		/**
		 * A series on a card lands on an invoice, where it always should have.
		 *
		 * Writing a recurrence never worked out which invoice it belonged to, so a
		 * subscription charged to a credit card was on no invoice at all and the card
		 * showed less than it would charge. The rule is the one every other writer uses,
		 * the closing day of the account the record is charged to, so the repair is that
		 * rule applied to the rows that were written without it.
		 *
		 * It used to be done here, where the rows lie, and that did not last: the change log
		 * still held every one of those rows with no invoice, so a restore, the exchange
		 * between devices and "keep theirs" wrote the empty invoice back. Since 2.0.0 the
		 * repair is written through the change log like any other change, by the repairs in
		 * `packages/storage`, which run when a database opens and again after rows arrive
		 * from somewhere else. This keeps its name so a database that took it does not take
		 * it twice, and does nothing.
		 */
		id: "0015_subscriptions_reach_their_invoice",
		statements: () => [],
	},
	{
		/**
		 * Nothing changes in the shape. What this records is the moment a database moved to
		 * release 2.0.0, which one repair needs: the promises releases 1.1.0 to 1.2.1 wrote
		 * are the ones this database wrote after taking 0013 and before taking this. Every
		 * row a release writes carries the moment it was written, and no row says which
		 * release wrote it, so the two moments are the only way to tell.
		 */
		id: "0016_release_2_0_0",
		statements: () => [],
	},
	{
		/**
		 * The history of an allowance. A change applies from the next landing onwards, so the
		 * versions before it are kept. Empty on every account that exists, which reads as an
		 * allowance that was never changed: the one there is applies from the start.
		 */
		id: "0017_allowance_history",
		statements: (context) =>
			ACCOUNT_QUOTA_HISTORY_COLUMNS.filter(
				(column) => !context.hasColumn("accounts", column.name),
			).map((column) => addColumnSql("accounts", column, context.dialect)),
	},
	{
		/**
		 * The day somebody said what was on a voucher that carries. Empty on every account
		 * that exists, which reads as the day the account was written down, the day an
		 * opening balance from release 1.0 was true on.
		 */
		id: "0018_voucher_known_balance",
		statements: (context) =>
			ACCOUNT_KNOWN_BALANCE_COLUMNS.filter(
				(column) => !context.hasColumn("accounts", column.name),
			).map((column) => addColumnSql("accounts", column, context.dialect)),
	},
	{
		/**
		 * The invoice of the card a transfer leaves, for paying an invoice with another card
		 * and splitting one into parts. Empty on every row that exists, which reads as before.
		 */
		id: "0019_origin_invoice",
		statements: (context) =>
			TRANSACTION_ORIGIN_INVOICE_COLUMNS.filter(
				(column) => !context.hasColumn("transactions", column.name),
			).map((column) => addColumnSql("transactions", column, context.dialect)),
	},
	{
		/**
		 * A series gets its card, the first day it may write and the series it continues, and
		 * the days somebody said did not happen get a table. Empty on every series that exists:
		 * the first day is written by the series itself the first time it writes, through the
		 * change log, so a restore or another device cannot undo it.
		 */
		id: "0020_recurrence_chain",
		statements: (context) => [
			...RECURRENCE_CHAIN_COLUMNS.filter(
				(column) => !context.hasColumn("recurrences", column.name),
			).map((column) => addColumnSql("recurrences", column, context.dialect)),
			...createSchemaSql([recurrenceSkips], context.dialect),
		],
	},
];

export const MIGRATIONS_TABLE = "schema_migrations";

export function createMigrationsTableSql(dialect: Dialect): string {
	const applied = dialect === "postgres" ? "BIGINT" : "INTEGER";
	return `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (\n\t"id" TEXT PRIMARY KEY NOT NULL,\n\t"applied_at" ${applied} NOT NULL\n)`;
}
