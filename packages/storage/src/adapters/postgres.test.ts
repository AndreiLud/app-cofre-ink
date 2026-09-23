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
 *
 * A second database is a second schema in the same instance. One instance is one
 * session, so the path is set before every statement rather than once, which costs
 * nothing here and keeps two drivers from reading each other's tables.
 */
async function openIn(schema: string): Promise<Driver> {
	const postgres = await shared();
	await postgres.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE; CREATE SCHEMA "${schema}";`);

	return wrapPostgres({
		query: async (sql, params) => {
			await postgres.exec(`SET search_path TO "${schema}"`);
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
	open: () => openIn("public"),
	openAnother: (name) => openIn(`device_${name.replace(/[^a-z0-9]/gi, "")}`),
});
