// One query at a time, as the browser runs them.
//
// In the browser the database lives in a worker, and every query reaches it through one queue,
// so a transaction is never interleaved with a query that belongs to somebody else
// (apps/web/src/storage/workerDriver.ts). The price is that a query made outside the
// transaction while the transaction is open waits for the transaction, which is waiting for
// it: the application stops, with nothing in the console.
//
// The adapters the conformance suite runs on had no queue, so a repository that read through
// the driver it was built with, from inside a transaction, passed every test and hung every
// browser. The suite runs the engine of the browser through this, so it hangs here first.

import type { Driver } from "../driver.ts";

export function inOneQueue(inner: Driver): Driver {
	let queue: Promise<unknown> = Promise.resolve();
	function inOrder<T>(work: () => Promise<T>): Promise<T> {
		const answer = queue.then(work, work);
		queue = answer.catch(() => undefined);
		return answer;
	}

	return {
		dialect: inner.dialect,
		all: (sql, params) => inOrder(() => inner.all(sql, params)),
		run: (sql, params) => inOrder(() => inner.run(sql, params)),
		// The whole transaction is one turn of the queue, and inside it the driver it is handed
		// goes straight through, as a transaction in the worker does.
		transaction: (work) => inOrder(() => inner.transaction(work)),
		close: () => inOrder(() => inner.close()),
	};
}
