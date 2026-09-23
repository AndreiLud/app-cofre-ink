// Opens whichever database the configuration points at, runs the migrations and
// hands back both the repository driver and, for SQLite, the raw handle that the
// authentication library talks to.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Driver, Row, SqlValue } from "@cofre/storage";
import { migrate } from "@cofre/storage";
import { openNodeSqliteHandle, wrapNodeSqlite } from "@cofre/storage/nodeSqlite";
import { wrapPostgres } from "@cofre/storage/postgres";
import { Pool } from "pg";
import type { Config } from "./config.ts";

export type OpenedDatabase = {
	driver: Driver;
	/** What the authentication library uses. One of the two is always present. */
	sqlite?: DatabaseSync;
	postgres?: Pool;
	close: () => Promise<void>;
};

export async function openDatabase(config: Config): Promise<OpenedDatabase> {
	if (config.databaseKind === "postgres") {
		const pool = new Pool({ connectionString: config.COFRE_DATABASE });
		const driver = wrapPostgres({
			query: async (sql, params) => {
				const result = await pool.query(sql, params as SqlValue[]);
				return result.rows as Row[];
			},
			close: async () => {
				await pool.end();
			},
		});
		await migrate(driver);
		return { driver, postgres: pool, close: () => driver.close() };
	}

	if (config.COFRE_DATABASE !== ":memory:") {
		mkdirSync(dirname(config.COFRE_DATABASE), { recursive: true });
	}

	const handle = openNodeSqliteHandle({ location: config.COFRE_DATABASE });
	const driver = wrapNodeSqlite(handle);
	await migrate(driver);
	return { driver, sqlite: handle, close: () => driver.close() };
}
