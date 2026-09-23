// Reads the shape a real database ended up with, so it can be compared against the
// description. This is what proves that SQLite and PostgreSQL did not drift apart,
// and that a migration was not forgotten.

import type { Dialect } from "./ddl.ts";
import { MIGRATIONS_TABLE } from "./migrations.ts";
import type { Table } from "./schema/types.ts";

export type ShapeRow = { table_name: string; column_name: string };

export function columnsQuery(dialect: Dialect): string {
	if (dialect === "postgres") {
		return `SELECT table_name, column_name
			FROM information_schema.columns
			WHERE table_schema = 'public'`;
	}
	return `SELECT m.name AS table_name, p.name AS column_name
		FROM sqlite_master m
		JOIN pragma_table_info(m.name) p
		WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'`;
}

export function indexesQuery(dialect: Dialect): string {
	if (dialect === "postgres") {
		return "SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'";
	}
	return "SELECT name FROM sqlite_master WHERE type = 'index' AND name IS NOT NULL";
}

export type Shape = Map<string, Set<string>>;

export function shapeOfRows(rows: readonly ShapeRow[]): Shape {
	const shape: Shape = new Map();
	for (const row of rows) {
		if (row.table_name === MIGRATIONS_TABLE) continue;
		const columns = shape.get(row.table_name) ?? new Set<string>();
		columns.add(row.column_name);
		shape.set(row.table_name, columns);
	}
	return shape;
}

export function shapeOfSchema(tables: readonly Table[]): Shape {
	const shape: Shape = new Map();
	for (const table of tables) {
		shape.set(table.name, new Set(table.columns.map((column) => column.name)));
	}
	return shape;
}

/** Every way the database differs from the description, in words a person can read. */
export function differences(expected: Shape, actual: Shape): string[] {
	const problems: string[] = [];

	for (const [table, columns] of expected) {
		const found = actual.get(table);
		if (!found) {
			problems.push(`the table ${table} is described but does not exist in the database`);
			continue;
		}
		for (const column of columns) {
			if (!found.has(column)) problems.push(`${table}.${column} is missing from the database`);
		}
		for (const column of found) {
			if (!columns.has(column)) problems.push(`${table}.${column} exists but is not described`);
		}
	}

	for (const table of actual.keys()) {
		if (!expected.has(table)) {
			problems.push(`the table ${table} exists in the database but is not described`);
		}
	}

	return problems;
}
