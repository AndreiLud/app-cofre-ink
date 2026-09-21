import { describe, expect, it } from "vitest";
import { createSchemaSql, createTableSql } from "../ddl.ts";
import { accounts, SCHEMA, spaces, users } from "./tables.ts";
import { defineTable, SchemaError } from "./types.ts";

describe("the schema description", () => {
	it("gives every table in the space scope its space", () => {
		for (const table of SCHEMA) {
			if (table.scope === "global") continue;
			const names = table.columns.map((column) => column.name);
			expect(names, `${table.name} has no space`).toContain("space_id");
		}
	});

	it("gives every replicated table the columns replication needs", () => {
		for (const table of SCHEMA) {
			if (!table.replicated) continue;
			const names = new Set(table.columns.map((column) => column.name));
			for (const required of ["id", "created_at", "updated_at", "deleted_at", "hlc"]) {
				expect(names, `${table.name} is missing ${required}`).toContain(required);
			}
		}
	});

	it("refuses a table that tries to declare a column added by the builder", () => {
		expect(() =>
			defineTable({
				name: "invalid",
				scope: "space",
				columns: [{ name: "space_id", type: "text" }],
			}),
		).toThrow(SchemaError);
	});

	it("refuses a name that is not a plain identifier", () => {
		expect(() => defineTable({ name: "Bad Name", scope: "global", columns: [] })).toThrow(
			SchemaError,
		);
	});
});

describe("generated sql", () => {
	it("uses the type each dialect expects for an amount", () => {
		expect(createTableSql(accounts, "sqlite")).toContain('"initial_balance" INTEGER');
		expect(createTableSql(accounts, "postgres")).toContain('"initial_balance" BIGINT');
	});

	it("writes the same columns in both dialects", () => {
		const columnsOf = (sql: string) =>
			[...sql.matchAll(/"([a-z_]+)" (?:TEXT|INTEGER|BIGINT|DOUBLE PRECISION|BYTEA|JSONB)/g)].map(
				(match) => match[1],
			);
		for (const table of SCHEMA) {
			expect(columnsOf(createTableSql(table, "sqlite"))).toEqual(
				columnsOf(createTableSql(table, "postgres")),
			);
		}
	});

	it("keeps the check that a space is personal or shared", () => {
		expect(createTableSql(spaces, "sqlite")).toContain("CHECK (kind in ('personal', 'shared'))");
	});

	it("creates every table before every index", () => {
		const statements = createSchemaSql(SCHEMA, "sqlite");
		const lastTable = statements.findLastIndex((sql) => sql.startsWith("CREATE TABLE"));
		const firstIndex = statements.findIndex((sql) => sql.includes("INDEX"));
		expect(lastTable).toBeLessThan(firstIndex);
	});

	it("marks the email of a person as unique", () => {
		expect(createTableSql(users, "postgres")).toContain('"email" TEXT NOT NULL UNIQUE');
	});
});
