// SQLite compiled to WebAssembly, the engine of the browser mode.
//
// The same build runs under Node, which is how the conformance suite exercises the
// browser engine without a browser. In the browser the database is opened on the
// pool backend and persists in OPFS, as proven in docs/spikeOpfs.md.

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { Driver, Row, SqlValue } from "../driver.ts";

/** The slice of the oo1 interface this adapter uses. */
export type WasmDatabase = {
	exec(options: { sql: string; bind?: SqlValue[] }): unknown;
	selectObjects(sql: string, bind?: SqlValue[]): Row[];
	close(): void;
};

type Sqlite3Module = {
	oo1: { DB: new (filename: string, flags?: string) => WasmDatabase };
	installOpfsSAHPoolVfs?: (options: { name: string; initialCapacity?: number }) => Promise<{
		OpfsSAHPoolDb: new (filename: string) => WasmDatabase;
	}>;
};

// The published types declare no options, while the build accepts them.
type Initialiser = (options?: {
	print?: (text: string) => void;
	printErr?: (text: string) => void;
}) => Promise<Sqlite3Module>;

let modulePromise: Promise<Sqlite3Module> | null = null;

/** Loads the WebAssembly once per process or per tab. */
export async function loadSqliteWasm(): Promise<Sqlite3Module> {
	if (!modulePromise) {
		const initialise = sqlite3InitModule as unknown as Initialiser;
		modulePromise = initialise({ print: () => {}, printErr: () => {} });
	}
	return modulePromise;
}

export function wrapSqliteWasm(database: WasmDatabase, insideTransaction = false): Driver {
	const driver: Driver = {
		dialect: "sqlite",

		async all(sql, params = []) {
			return database.selectObjects(sql, params as SqlValue[]);
		},

		async run(sql, params = []) {
			database.exec({ sql, bind: params as SqlValue[] });
		},

		async transaction(work) {
			if (insideTransaction) return work(driver);
			database.exec({ sql: "BEGIN" });
			try {
				const answer = await work(wrapSqliteWasm(database, true));
				database.exec({ sql: "COMMIT" });
				return answer;
			} catch (error) {
				database.exec({ sql: "ROLLBACK" });
				throw error;
			}
		},

		async close() {
			if (!insideTransaction) database.close();
		},
	};

	return driver;
}

function prepare(database: WasmDatabase): void {
	database.exec({ sql: "PRAGMA foreign_keys = ON" });
}

/** A database that lives only in memory, used by tests and by a demo with no storage. */
export async function openSqliteWasmMemory(): Promise<Driver> {
	const sqlite3 = await loadSqliteWasm();
	const database = new sqlite3.oo1.DB(":memory:", "c");
	prepare(database);
	return wrapSqliteWasm(database);
}

export type OpfsOptions = {
	/** The name of the pool, which is what separates one application from another. */
	poolName?: string;
	fileName?: string;
};

/**
 * The browser mode. Has to run inside a worker, because the backend needs synchronous
 * access handles, and those exist only there.
 */
export async function openSqliteWasmOpfs(options: OpfsOptions = {}): Promise<Driver> {
	const sqlite3 = await loadSqliteWasm();
	if (!sqlite3.installOpfsSAHPoolVfs) {
		throw new Error("this build of sqlite has no pool backend, so it cannot persist in OPFS");
	}
	const pool = await sqlite3.installOpfsSAHPoolVfs({
		name: options.poolName ?? "cofre",
		initialCapacity: 8,
	});
	const database = new pool.OpfsSAHPoolDb(options.fileName ?? "/cofre.db");
	prepare(database);
	return wrapSqliteWasm(database);
}
