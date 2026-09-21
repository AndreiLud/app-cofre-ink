// The side of the driver that lives on the screen thread.
//
// It speaks to the worker through messages and keeps the same shape the repositories
// expect, so nothing above it knows that the database is on another thread.

import type { Driver, Row, SqlValue } from "@cofre/storage";
import type { OpenOutcome, WorkerRequest, WorkerResponse } from "./databaseWorker.ts";

type Pending = {
	resolve: (response: WorkerResponse) => void;
	reject: (error: Error) => void;
};

// Omit over a union keeps only the keys they share, so it has to be spread by hand.
type WithoutId<T> = T extends { id: number } ? Omit<T, "id"> : never;
type RequestBody = WithoutId<WorkerRequest>;

export type BrowserDatabase = {
	driver: Driver;
	/** How the database opened, which the screen has to be able to explain. */
	outcome: OpenOutcome;
};

export async function openBrowserDatabase(): Promise<BrowserDatabase> {
	const worker = new Worker(new URL("./databaseWorker.ts", import.meta.url), { type: "module" });

	const pending = new Map<number, Pending>();
	let nextId = 0;

	worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
		const waiting = pending.get(event.data.id);
		if (!waiting) return;
		pending.delete(event.data.id);
		waiting.resolve(event.data);
	};

	worker.onerror = (event) => {
		const failure = new Error(event.message || "the database worker stopped");
		for (const waiting of pending.values()) waiting.reject(failure);
		pending.clear();
	};

	function ask(request: RequestBody): Promise<WorkerResponse> {
		nextId += 1;
		const id = nextId;
		return new Promise<WorkerResponse>((resolve, reject) => {
			pending.set(id, { resolve, reject });
			worker.postMessage({ ...request, id } as WorkerRequest);
		});
	}

	async function send(request: RequestBody): Promise<WorkerResponse> {
		const response = await ask(request);
		if (!response.ok) throw new Error(response.error);
		return response;
	}

	// One queue for everything, so a transaction cannot be interleaved with a query
	// that belongs to someone else. At the size of one person's data this costs
	// nothing, and it removes a whole family of bugs.
	let queue: Promise<unknown> = Promise.resolve();
	function inOrder<T>(work: () => Promise<T>): Promise<T> {
		const answer = queue.then(work, work);
		queue = answer.catch(() => undefined);
		return answer;
	}

	const opened = await send({ kind: "open" });

	function build(insideTransaction: boolean): Driver {
		const driver: Driver = {
			dialect: "sqlite",

			async all(sql, params = []) {
				const work = async () => {
					const response = await send({ kind: "all", sql, params: [...params] });
					return (response.ok ? (response.rows ?? []) : []) as Row[];
				};
				return insideTransaction ? work() : inOrder(work);
			},

			async run(sql, params = []) {
				const work = async () => {
					await send({ kind: "run", sql, params: [...params] });
				};
				return insideTransaction ? work() : inOrder(work);
			},

			async transaction(body) {
				if (insideTransaction) return body(driver);
				return inOrder(async () => {
					await send({ kind: "run", sql: "BEGIN", params: [] });
					try {
						const answer = await body(build(true));
						await send({ kind: "run", sql: "COMMIT", params: [] });
						return answer;
					} catch (error) {
						await send({ kind: "run", sql: "ROLLBACK", params: [] });
						throw error;
					}
				});
			},

			async close() {
				worker.terminate();
			},
		};
		return driver;
	}

	return {
		driver: build(false),
		outcome: opened.ok ? (opened.outcome ?? "memory") : "memory",
	};
}

export type { SqlValue };
