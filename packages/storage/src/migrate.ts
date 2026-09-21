// Runs the migrations that have not run yet, in order, each one inside a transaction.
//
// Before each one it reads the shape the database currently has, so a migration can
// ask whether a column is already there instead of assuming.

import {
	columnsQuery,
	createMigrationsTableSql,
	MIGRATIONS,
	MIGRATIONS_TABLE,
	type MigrationContext,
	type ShapeRow,
	shapeOfRows,
} from "@cofre/db";
import type { Driver } from "./driver.ts";

async function describe(driver: Driver): Promise<MigrationContext> {
	const rows = (await driver.all(columnsQuery(driver.dialect))) as unknown as ShapeRow[];
	const shape = shapeOfRows(rows);
	return {
		dialect: driver.dialect,
		hasTable: (table) => shape.has(table),
		hasColumn: (table, column) => shape.get(table)?.has(column) === true,
	};
}

export async function migrate(driver: Driver): Promise<string[]> {
	await driver.run(createMigrationsTableSql(driver.dialect));

	const applied = new Set(
		(await driver.all(`SELECT "id" FROM "${MIGRATIONS_TABLE}"`)).map((row) => String(row.id)),
	);

	const ran: string[] = [];
	for (const migration of MIGRATIONS) {
		if (applied.has(migration.id)) continue;
		const context = await describe(driver);
		await driver.transaction(async (tx) => {
			for (const statement of migration.statements(context)) {
				await tx.run(statement);
			}
			await tx.run(`INSERT INTO "${MIGRATIONS_TABLE}" ("id", "applied_at") VALUES (?, ?)`, [
				migration.id,
				Date.now(),
			]);
		});
		ran.push(migration.id);
	}
	return ran;
}
