// Runs the migrations that have not run yet, in order, each one inside a transaction.

import { createMigrationsTableSql, MIGRATIONS, MIGRATIONS_TABLE } from "@cofre/db";
import type { Driver } from "./driver.ts";

export async function migrate(driver: Driver): Promise<string[]> {
	await driver.run(createMigrationsTableSql(driver.dialect));

	const applied = new Set(
		(await driver.all(`SELECT "id" FROM "${MIGRATIONS_TABLE}"`)).map((row) => String(row.id)),
	);

	const ran: string[] = [];
	for (const migration of MIGRATIONS) {
		if (applied.has(migration.id)) continue;
		await driver.transaction(async (tx) => {
			for (const statement of migration.statements(driver.dialect)) {
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
