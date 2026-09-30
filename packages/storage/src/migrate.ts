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

export type MigrateOptions = {
	/**
	 * Stop after this migration, leaving the database as an older release left it.
	 *
	 * For the conformance suite, and nothing in the application passes it. The one thing
	 * migrations have to do and cannot be checked by a schema comparison is carry a
	 * database that has data in it from one release to the next, and checking that needs a
	 * way to build the older one first. Running the real function up to a point beats a
	 * second copy of this loop in the tests, which would be the thing that drifts.
	 */
	stopAfter?: string;
};

export async function migrate(driver: Driver, options: MigrateOptions = {}): Promise<string[]> {
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
		if (migration.id === options.stopAfter) break;
	}
	return ran;
}
