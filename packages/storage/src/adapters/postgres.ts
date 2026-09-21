// PostgreSQL, the engine of the cloud mode and of a server that expects to grow.
//
// The adapter does not choose a client. It takes a function that runs a query, so the
// same code serves a managed database over the network, a container on a home server
// and the WebAssembly PostgreSQL the conformance suite runs against.

import type { Driver, Row, SqlValue } from "../driver.ts";
import { numberPlaceholders } from "../driver.ts";

export type PostgresQuery = (sql: string, params: readonly SqlValue[]) => Promise<Row[]>;

export type PostgresOptions = {
	query: PostgresQuery;
	close?: () => Promise<void>;
};

export function wrapPostgres(options: PostgresOptions, insideTransaction = false): Driver {
	const driver: Driver = {
		dialect: "postgres",

		async all(sql, params = []) {
			return options.query(numberPlaceholders(sql), params);
		},

		async run(sql, params = []) {
			await options.query(numberPlaceholders(sql), params);
		},

		async transaction(work) {
			if (insideTransaction) return work(driver);
			await options.query("BEGIN", []);
			try {
				const answer = await work(wrapPostgres(options, true));
				await options.query("COMMIT", []);
				return answer;
			} catch (error) {
				await options.query("ROLLBACK", []);
				throw error;
			}
		},

		async close() {
			if (!insideTransaction) await options.close?.();
		},
	};

	return driver;
}
