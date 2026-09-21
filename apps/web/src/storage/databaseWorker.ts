/// <reference lib="webworker" />
// The database runs here, never on the thread that draws the screen.
//
// SQLite needs synchronous access handles to persist in OPFS, and those exist only
// inside a worker. Keeping every query here also means a report over a year of data
// cannot freeze a click.

import type { Driver } from "@cofre/storage";
import { migrate } from "@cofre/storage";
import { openSqliteWasmMemory, openSqliteWasmOpfs } from "@cofre/storage/sqliteWasm";

export type WorkerRequest =
	| { id: number; kind: "open" }
	| { id: number; kind: "all"; sql: string; params: unknown[] }
	| { id: number; kind: "run"; sql: string; params: unknown[] };

export type WorkerResponse =
	| { id: number; ok: true; rows?: unknown[]; persistent?: boolean }
	| { id: number; ok: false; error: string };

let driver: Driver | null = null;
let persistent = false;

async function open(): Promise<void> {
	if (driver) return;
	try {
		driver = await openSqliteWasmOpfs({ poolName: "cofre", fileName: "/cofre.db" });
		persistent = true;
	} catch (error) {
		// A private window, a browser without the backend, or storage turned off. The
		// application still works, and the screen says the data lives only in this tab.
		console.warn("falling back to a database in memory", error);
		driver = await openSqliteWasmMemory();
		persistent = false;
	}
	await migrate(driver);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
	const request = event.data;
	const reply = (response: WorkerResponse) => self.postMessage(response);

	try {
		if (request.kind === "open") {
			await open();
			reply({ id: request.id, ok: true, persistent });
			return;
		}

		if (!driver) await open();
		if (!driver) throw new Error("the database did not open");

		if (request.kind === "all") {
			const rows = await driver.all(request.sql, request.params as never);
			reply({ id: request.id, ok: true, rows });
			return;
		}

		await driver.run(request.sql, request.params as never);
		reply({ id: request.id, ok: true });
	} catch (error) {
		reply({
			id: request.id,
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		});
	}
};
