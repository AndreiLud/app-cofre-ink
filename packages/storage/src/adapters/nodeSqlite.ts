// SQLite on a server or on a desktop, through the module that ships with Node.
//
// The native alternative needs a compiler on the machine that installs it, which is
// exactly the friction that stops a person from hosting their own copy. This module
// needs nothing: it is part of Node. It is stable from Node 24, and Node 22 reaches
// it with the flag `--experimental-sqlite`.

import { DatabaseSync } from "node:sqlite";
import type { Driver, Row, SqlValue } from "../driver.ts";

export type NodeSqliteOptions = {
	/** A path on disk, or ":memory:" for a database that lives only while the process does. */
	location: string;
};

type Statement = {
	all(...params: SqlValue[]): unknown[];
	run(...params: SqlValue[]): unknown;
};

function wrap(database: DatabaseSync, insideTransaction: boolean): Driver {
	const prepare = (sql: string): Statement => database.prepare(sql) as unknown as Statement;

	const driver: Driver = {
		dialect: "sqlite",

		async all(sql, params = []) {
			return prepare(sql).all(...(params as SqlValue[])) as Row[];
		},

		async run(sql, params = []) {
			prepare(sql).run(...(params as SqlValue[]));
		},

		async transaction(work) {
			if (insideTransaction) return work(driver);
			database.exec("BEGIN");
			try {
				const answer = await work(wrap(database, true));
				database.exec("COMMIT");
				return answer;
			} catch (error) {
				database.exec("ROLLBACK");
				throw error;
			}
		},

		async close() {
			if (!insideTransaction) database.close();
		},
	};

	return driver;
}

/**
 * Opens the database and hands back the handle itself. The server needs it because
 * the authentication library talks to SQLite directly, and both have to be looking at
 * the same file.
 */
export function openNodeSqliteHandle(options: NodeSqliteOptions): DatabaseSync {
	const database = new DatabaseSync(options.location);
	database.exec("PRAGMA journal_mode = WAL");
	database.exec("PRAGMA foreign_keys = ON");
	database.exec("PRAGMA busy_timeout = 5000");
	return database;
}

export function wrapNodeSqlite(database: DatabaseSync): Driver {
	return wrap(database, false);
}

export function openNodeSqlite(options: NodeSqliteOptions): Driver {
	return wrap(openNodeSqliteHandle(options), false);
}
