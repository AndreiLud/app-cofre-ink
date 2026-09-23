/// <reference lib="webworker" />
// The database runs here, never on the thread that draws the screen.
//
// SQLite needs synchronous access handles to persist in OPFS, and those exist only
// inside a worker. Keeping every query here also means a report over a year of data
// cannot freeze a click.

import type { Driver } from "@cofre/storage";
import { migrate } from "@cofre/storage";
import {
	openSqliteWasmMemory,
	openSqliteWasmOpfs,
	wipeSqliteWasmOpfs,
} from "@cofre/storage/sqliteWasm";

export type OpenOutcome = "persistent" | "memory" | "busy";

export type WorkerRequest =
	| { id: number; kind: "open" }
	| { id: number; kind: "all"; sql: string; params: unknown[] }
	| { id: number; kind: "run"; sql: string; params: unknown[] }
	/** Takes the file off the device. The page has to reload straight afterwards. */
	| { id: number; kind: "wipe" };

export type WorkerResponse =
	| { id: number; ok: true; rows?: unknown[]; outcome?: OpenOutcome }
	| { id: number; ok: false; error: string };

let driver: Driver | null = null;
let outcome: OpenOutcome = "memory";

/** Whether this browser could persist at all, which is a different problem. */
function canPersist(): boolean {
	const handle =
		typeof FileSystemFileHandle === "undefined" ? null : FileSystemFileHandle.prototype;
	return (
		typeof navigator?.storage?.getDirectory === "function" &&
		handle !== null &&
		"createSyncAccessHandle" in handle
	);
}

async function open(): Promise<void> {
	if (driver) return;

	if (!canPersist()) {
		// A private window, or a browser without the backend. The application still
		// works, and the screen says the data lives only in this tab.
		driver = await openSqliteWasmMemory();
		outcome = "memory";
		await migrate(driver);
		return;
	}

	try {
		driver = await openSqliteWasmOpfs({ poolName: "cofre", fileName: "/cofre.db" });
		outcome = "persistent";
	} catch (error) {
		// The storage is there, so the file is almost certainly held by another tab:
		// this backend takes the file exclusively. Saying so beats opening an empty
		// database that looks like lost data.
		console.warn("could not take the database file", error);
		outcome = "busy";
		return;
	}

	await migrate(driver);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
	const request = event.data;
	const reply = (response: WorkerResponse) => self.postMessage(response);

	try {
		if (request.kind === "open") {
			await open();
			reply({ id: request.id, ok: true, outcome });
			return;
		}

		if (request.kind === "wipe") {
			// Closed first, because the backend holds the file exclusively and cannot
			// empty what it is still reading.
			await driver?.close();
			driver = null;
			if (canPersist()) await wipeSqliteWasmOpfs("cofre");
			reply({ id: request.id, ok: true });
			return;
		}

		if (!driver) await open();
		if (!driver) throw new Error("the database is open in another tab");

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
