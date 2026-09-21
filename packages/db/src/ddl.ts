// Turns the schema description into SQL. The two dialects differ in very little, and
// keeping the difference in this one file is what lets every query above it be
// written once.

import type { Column, ColumnType, ReferenceAction, Table } from "./schema/types.ts";

export type Dialect = "sqlite" | "postgres";

const TYPES: Record<Dialect, Record<ColumnType, string>> = {
	sqlite: {
		text: "TEXT",
		integer: "INTEGER",
		bigint: "INTEGER",
		real: "REAL",
		blob: "BLOB",
		json: "TEXT",
	},
	postgres: {
		text: "TEXT",
		integer: "INTEGER",
		bigint: "BIGINT",
		real: "DOUBLE PRECISION",
		blob: "BYTEA",
		json: "JSONB",
	},
};

const ACTIONS: Record<ReferenceAction, string> = {
	cascade: "CASCADE",
	restrict: "RESTRICT",
	setNull: "SET NULL",
};

export function quote(identifier: string): string {
	return `"${identifier}"`;
}

function columnSql(column: Column, dialect: Dialect): string {
	const parts = [quote(column.name), TYPES[dialect][column.type]];
	if (column.primaryKey) parts.push("PRIMARY KEY");
	if (column.notNull) parts.push("NOT NULL");
	if (column.unique && !column.primaryKey) parts.push("UNIQUE");
	if (column.defaultTo !== undefined) parts.push(`DEFAULT ${column.defaultTo}`);
	if (column.references) {
		const action = column.references.onDelete
			? ` ON DELETE ${ACTIONS[column.references.onDelete]}`
			: "";
		parts.push(
			`REFERENCES ${quote(column.references.table)} (${quote(column.references.column)})${action}`,
		);
	}
	if (column.check) parts.push(`CHECK (${column.check})`);
	return parts.join(" ");
}

export function createTableSql(table: Table, dialect: Dialect): string {
	const lines = table.columns.map((column) => `\t${columnSql(column, dialect)}`);
	for (const group of table.uniqueTogether) {
		lines.push(`\tUNIQUE (${group.map(quote).join(", ")})`);
	}
	return `CREATE TABLE IF NOT EXISTS ${quote(table.name)} (\n${lines.join(",\n")}\n)`;
}

export function createIndexSql(table: Table, dialect: Dialect): string[] {
	return table.indexes.map((index) => {
		const unique = index.unique ? "UNIQUE " : "";
		const columns = index.columns.map(quote).join(", ");
		void dialect;
		return `CREATE ${unique}INDEX IF NOT EXISTS ${quote(index.name)} ON ${quote(table.name)} (${columns})`;
	});
}

/** Every statement needed to build the schema from nothing, in dependency order. */
export function createSchemaSql(tables: readonly Table[], dialect: Dialect): string[] {
	const statements: string[] = [];
	for (const table of tables) {
		statements.push(createTableSql(table, dialect));
	}
	for (const table of tables) {
		statements.push(...createIndexSql(table, dialect));
	}
	return statements;
}
