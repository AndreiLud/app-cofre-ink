// Keeping a copy up to date, one pass at a time.
//
// The engine underneath is the same one two devices use to agree, and what this adds is
// the part that belongs to a backup rather than to a sync: it looks before it writes, it
// reports what it did in words a screen can use, and it stops on the one answer that
// would mean throwing somebody's records away without being asked.
//
// Nothing here knows about a screen, a timer or a browser. What decides when this runs
// lives in the application, because that is a question about somebody's attention and
// not about their data.

import type { Driver } from "./driver.ts";
import {
	compareWithStore,
	pushOverStore,
	type StoreComparison,
	type SyncStore,
	syncWithStore,
} from "./syncStore.ts";

export type BackupOutcome = {
	spaceId: string;
	/** What was done, which is what the screen reports and what a test asserts. */
	did: "nothing" | "sent" | "received" | "merged" | "asked";
	sent: number;
	received: number;
	comparison: StoreComparison;
};

export type BackupRun = {
	at: number;
	outcomes: BackupOutcome[];
	/** The spaces that stopped on a question, which the screen has to put to somebody. */
	waiting: BackupOutcome[];
};

/**
 * One pass over every space, against one place.
 *
 * A space that stops on a question does not stop the others: the rest of the copy is
 * still worth bringing up to date, and the question keeps until somebody answers it.
 */
export async function runBackup(
	driver: Driver,
	store: SyncStore,
	spaceIds: readonly string[],
	options: { now?: () => number; onSpace?: (outcome: BackupOutcome) => void } = {},
): Promise<BackupRun> {
	const now = options.now ?? (() => Date.now());
	const outcomes: BackupOutcome[] = [];

	for (const spaceId of spaceIds) {
		const comparison = await compareWithStore(driver, store, { spaceId });
		let outcome: BackupOutcome = { spaceId, did: "nothing", sent: 0, received: 0, comparison };

		if (comparison.state === "bothMoved") {
			// Nothing is written on this answer. Somebody says which copy is the one.
			outcome = { ...outcome, did: "asked" };
		} else if (comparison.state !== "same") {
			const summary = await syncWithStore(driver, store, {
				spaceId,
				already: { bundle: comparison.bundle, revision: comparison.revision },
			});
			outcome = {
				...outcome,
				did: comparison.state === "theirsAhead" ? "received" : "sent",
				sent: summary.pushed,
				received: summary.pulled,
			};
		}

		outcomes.push(outcome);
		options.onSpace?.(outcome);
	}

	return { at: now(), outcomes, waiting: outcomes.filter((one) => one.did === "asked") };
}

/** Keeping what is in this database, and writing it over what the place holds. */
export async function keepMine(
	driver: Driver,
	store: SyncStore,
	input: { spaceId: string; revision: string | null },
): Promise<number> {
	const { written } = await pushOverStore(driver, store, input);
	return written;
}

/**
 * What is here, written over what the place holds, for several spaces at once.
 *
 * This is what somebody asks for after bringing a file back: the copy they just restored
 * is the one they mean, so the place is made to agree with it rather than being left to
 * find the difference later and ask about it.
 */
export async function replaceTheCopy(
	driver: Driver,
	store: SyncStore,
	spaceIds: readonly string[],
): Promise<number> {
	let written = 0;
	for (const spaceId of spaceIds) {
		const { revision } = await store.read(spaceId);
		written += await keepMine(driver, store, { spaceId, revision });
	}
	return written;
}

/**
 * Keeping what the place holds, and letting go of what is here.
 *
 * The rows here are emptied and the log of the other side is written in their place,
 * because anything short of that is the two of them merged, which is the answer the
 * person just said no to. Emptying is handed in rather than reached for: it is a
 * permission, and permissions live in the repository layer.
 */
export async function keepTheirs(
	driver: Driver,
	store: SyncStore,
	empty: (spaceId: string) => Promise<number>,
	input: { spaceId: string },
): Promise<{ emptied: number; received: number }> {
	const comparison = await compareWithStore(driver, store, input);
	if (comparison.bundle === null || comparison.bundle.changes.length === 0) {
		throw new Error("there is nothing over there to keep");
	}

	const emptied = await empty(input.spaceId);
	const summary = await syncWithStore(driver, store, {
		spaceId: input.spaceId,
		already: { bundle: comparison.bundle, revision: comparison.revision },
	});
	return { emptied, received: summary.pulled };
}
