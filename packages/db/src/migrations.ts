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
import { RULE_TABLES } from "./schema/ruleTables.ts";
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
		 * Data rather than schema, like 0012, and it does not travel: every device runs its
		 * own migrations, and an entry in the change log about this would be a write nobody
		 * made.
		 */
		id: "0015_subscriptions_reach_their_invoice",
		statements: () => [STAMP_SERIES_WITH_THEIR_INVOICE],
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
];

/**
 * The repair of 0015, written out so a test can run it against every engine.
 *
 * It is the rule every other writer of that column uses, in SQL: a day before the closing
 * day of the account belongs to the invoice closing that month, and a day on or after it
 * belongs to the next one. Written without a date function, because the two dialects have
 * different ones, and without a negative substring index, because only one of them has
 * that. The month is padded by asking whether it needs padding.
 *
 * It touches only rows written by a series, only where the invoice is empty, and only on
 * an account that is a credit card with both of its days set, so running it twice does
 * the same as running it once.
 */
export const STAMP_SERIES_WITH_THEIR_INVOICE = `UPDATE "transactions"
	 SET "invoice_month" = CASE
	   WHEN CAST(SUBSTR("happened_on", 9, 2) AS INTEGER) < (
	     SELECT a."closing_day" FROM "accounts" a WHERE a."id" = "transactions"."account_id"
	   )
	   THEN SUBSTR("happened_on", 1, 7)
	   WHEN CAST(SUBSTR("happened_on", 6, 2) AS INTEGER) = 12
	   THEN CAST(CAST(SUBSTR("happened_on", 1, 4) AS INTEGER) + 1 AS TEXT) || '-01'
	   WHEN CAST(SUBSTR("happened_on", 6, 2) AS INTEGER) + 1 < 10
	   THEN SUBSTR("happened_on", 1, 4) || '-0' ||
	        CAST(CAST(SUBSTR("happened_on", 6, 2) AS INTEGER) + 1 AS TEXT)
	   ELSE SUBSTR("happened_on", 1, 4) || '-' ||
	        CAST(CAST(SUBSTR("happened_on", 6, 2) AS INTEGER) + 1 AS TEXT)
	 END
	 WHERE "invoice_month" IS NULL
	   AND "recurrence_id" IS NOT NULL
	   AND "deleted_at" IS NULL
	   AND EXISTS (
	     SELECT 1 FROM "accounts" a
	     WHERE a."id" = "transactions"."account_id"
	       AND a."kind" = 'credit'
	       AND a."closing_day" IS NOT NULL
	       AND a."due_day" IS NOT NULL
	   )`;

export const MIGRATIONS_TABLE = "schema_migrations";

export function createMigrationsTableSql(dialect: Dialect): string {
	const applied = dialect === "postgres" ? "BIGINT" : "INTEGER";
	return `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (\n\t"id" TEXT PRIMARY KEY NOT NULL,\n\t"applied_at" ${applied} NOT NULL\n)`;
}
