// PostgreSQL, run as WebAssembly so the suite needs no container and no service.
// It is the same engine the cloud mode talks to, which is what makes this worth doing.

import { PGlite } from "@electric-sql/pglite";
import { runConformanceSuite } from "../conformance/index.ts";
import type { Driver, Row } from "../driver.ts";
import { wrapPostgres } from "./postgres.ts";

let instance: PGlite | null = null;

async function shared(): Promise<PGlite> {
	if (!instance) instance = new PGlite();
	return instance;
}

/**
 * Booting PostgreSQL for every test would make the suite unbearably slow, so one
 * instance is kept and the schema is thrown away between tests, which leaves a
 * database just as empty as a fresh one.
 */
async function openEmpty(): Promise<Driver> {
	const postgres = await shared();
	await postgres.exec("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
	return wrapPostgres({
		query: async (sql, params) => {
			const result = await postgres.query(sql, params as unknown[]);
			return (result.rows ?? []) as Row[];
		},
		close: async () => {
			// The instance is shared, so a single test closing it would break the rest.
		},
	});
}

runConformanceSuite({
	name: "postgres",
	open: openEmpty,
});
