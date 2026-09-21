// Browser storage spike, worker side.
// Opens SQLite with the OPFS synchronous access handle pool, which is the backend
// that works without cross origin isolation, writes a realistic amount of data and
// reports timings. The runs table proves persistence across reloads.

import sqlite3InitModule from "./vendor/index.mjs";

const post = (message) => self.postMessage(message);
const now = () => performance.now();
const since = (start) => Math.round((now() - start) * 10) / 10;

const CATEGORIES = ["mercado", "transporte", "moradia", "lazer", "saude", "educacao"];

function describeEnvironment(sqlite3, initMs) {
	const handlePrototype =
		typeof FileSystemFileHandle === "undefined" ? null : FileSystemFileHandle.prototype;
	return {
		sqliteVersion: sqlite3.version.libVersion,
		initMs,
		crossOriginIsolated: self.crossOriginIsolated === true,
		sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
		opfsAvailable: typeof navigator?.storage?.getDirectory === "function",
		syncAccessHandle: handlePrototype !== null && "createSyncAccessHandle" in handlePrototype,
		sahPoolInstaller: typeof sqlite3.installOpfsSAHPoolVfs === "function",
	};
}

function createSchema(db) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS runs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			started_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS transactions (
			id TEXT PRIMARY KEY,
			space_id TEXT NOT NULL,
			happened_on TEXT NOT NULL,
			amount_cents INTEGER NOT NULL,
			category TEXT NOT NULL,
			description TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS transactions_by_space_and_date
			ON transactions (space_id, happened_on);
	`);
}

function insertBatch(db, count) {
	const statement = db.prepare(
		"INSERT INTO transactions (id, space_id, happened_on, amount_cents, category, description) VALUES (?, ?, ?, ?, ?, ?)",
	);
	const start = now();
	db.exec("BEGIN");
	try {
		for (let index = 0; index < count; index += 1) {
			const month = String((index % 12) + 1).padStart(2, "0");
			const day = String((index % 28) + 1).padStart(2, "0");
			statement
				.bind([
					crypto.randomUUID(),
					"space_personal",
					`2026-${month}-${day}`,
					Math.round(Math.random() * 25000) + 500,
					CATEGORIES[index % CATEGORIES.length],
					`lancamento numero ${index}`,
				])
				.step();
			statement.reset();
		}
		db.exec("COMMIT");
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	} finally {
		statement.finalize();
	}
	return since(start);
}

async function run(command) {
	const initStart = now();
	const sqlite3 = await sqlite3InitModule({
		printErr: (text) => post({ type: "log", text: String(text) }),
	});
	const environment = describeEnvironment(sqlite3, since(initStart));
	post({ type: "environment", environment });

	if (!environment.sahPoolInstaller) {
		throw new Error("this build has no installOpfsSAHPoolVfs, the pool backend is unavailable");
	}

	const poolStart = now();
	const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "cofreSpike", initialCapacity: 8 });
	const poolMs = since(poolStart);

	if (command === "wipe") {
		await pool.wipeFiles();
		post({ type: "wiped" });
		return;
	}

	const openStart = now();
	const db = new pool.OpfsSAHPoolDb("/cofre.db");
	const openMs = since(openStart);

	try {
		createSchema(db);
		db.exec({ sql: "INSERT INTO runs (started_at) VALUES (?)", bind: [new Date().toISOString()] });

		const runCount = db.selectValue("SELECT count(*) FROM runs");
		const rowsBefore = db.selectValue("SELECT count(*) FROM transactions");
		const insertMs = insertBatch(db, 5000);
		const rowsAfter = db.selectValue("SELECT count(*) FROM transactions");

		const queryStart = now();
		const byMonth = db.selectObjects(`
			SELECT substr(happened_on, 1, 7) AS month,
			       sum(amount_cents) AS total_cents,
			       count(*) AS entries
			FROM transactions
			WHERE space_id = 'space_personal'
			GROUP BY month
			ORDER BY month
		`);
		const queryMs = since(queryStart);

		const pageSize = db.selectValue("PRAGMA page_size");
		const pageCount = db.selectValue("PRAGMA page_count");

		post({
			type: "result",
			result: {
				poolMs,
				openMs,
				runCount,
				rowsBefore,
				rowsAfter,
				insertMs,
				queryMs,
				monthsFound: byMonth.length,
				firstMonth: byMonth[0] ?? null,
				databaseKilobytes: Math.round((pageSize * pageCount) / 1024),
				poolCapacity: pool.getCapacity(),
				files: pool.getFileNames(),
			},
		});
	} finally {
		db.close();
	}
}

self.onmessage = (event) => {
	run(event.data?.command ?? "measure").catch((error) => {
		post({
			type: "error",
			message: String(error?.message ?? error),
			stack: String(error?.stack ?? ""),
		});
	});
};
