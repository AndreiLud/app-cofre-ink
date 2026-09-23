// Keeping the database small, without anybody being asked to think about it.
//
// The change log is what grows. A record that was written, corrected twice and
// reconciled is four entries saying, in the end, one thing, and a household writing
// fifty records a month adds a few thousand entries a year. Registry 0018 decided how
// those are folded; this file decides when, which is the part a person should never
// have to answer.
//
// Nothing here loses money. Folding rewrites the history of a row into the state that
// history produced, at the stamp of its newest entry. Every record, every amount, every
// date and every identifier comes out of it byte for byte the same. What goes away is
// the intermediate versions of rows that nobody is going to argue about any more, and
// the empty pages the database was still holding on to.

import { decodeHybridTime, stampAt } from "@cofre/core";
import type { Driver } from "./driver.ts";
import { type Compaction, compactChanges, compactedBefore } from "./sync.ts";

/**
 * How long an entry has to have been settled before it is folded.
 *
 * A month is long enough that a device which was away for a holiday still finds its
 * own history where it left it, and short enough that the log of a year is mostly
 * folded.
 */
export const SETTLED_AFTER = 30 * 24 * 60 * 60 * 1000;

/** Doing this more than once a day would fold almost nothing and cost a pass anyway. */
const ONCE_A_DAY = 24 * 60 * 60 * 1000;

/**
 * Below this many folded entries, rewriting the whole file costs more than the space
 * it gives back.
 */
const WORTH_RECLAIMING = 200;

export type Tidied = Compaction & {
	spaceId: string;
	/** True when the file itself was rewritten and actually got smaller. */
	reclaimed: boolean;
};

/**
 * Housekeeping on the database, not an operation on a space.
 *
 * There is no permission check here on purpose. Nothing it does is visible in the
 * product: no row changes, no amount moves, nobody gains or loses access to anything.
 * It is the database looking after itself, and the caller is the application starting
 * up, not a person pressing something.
 */
export async function tidySpace(
	driver: Driver,
	spaceId: string,
	now: number = Date.now(),
): Promise<Tidied | null> {
	const cut = now - SETTLED_AFTER;
	const mark = await compactedBefore(driver, spaceId);

	// Folded recently enough that another pass would find almost nothing.
	if (mark !== null && millisOf(mark) >= cut - ONCE_A_DAY) return null;

	const folded = await compactChanges(driver, spaceId, { before: stampAt(cut) });
	const reclaimed = folded.removed >= WORTH_RECLAIMING && (await reclaim(driver));

	return { ...folded, spaceId, reclaimed };
}

/** Every space in this database, one after another, and a failure stops none of them. */
export async function tidyEverySpace(driver: Driver, now: number = Date.now()): Promise<Tidied[]> {
	const rows = await driver.all(`SELECT "id" FROM "spaces" ORDER BY "id"`);
	const done: Tidied[] = [];

	for (const row of rows) {
		const spaceId = String(row.id);
		try {
			const result = await tidySpace(driver, spaceId, now);
			if (result) done.push(result);
		} catch {
			// One space with a problem is not a reason to leave the others growing, and
			// this runs with nobody watching, so there is nowhere useful to report it.
		}
	}

	return done;
}

/**
 * Gives the empty pages back to the file system.
 *
 * Deleting rows from SQLite leaves the pages inside the file, so a log that folded from
 * ten thousand entries to two hundred keeps the size of ten thousand until the file is
 * rewritten. PostgreSQL does this on its own and has no business being told to.
 */
async function reclaim(driver: Driver): Promise<boolean> {
	if (driver.dialect !== "sqlite") return false;
	try {
		// Outside any transaction, which is the one thing this statement insists on.
		await driver.run("VACUUM");
		return true;
	} catch {
		return false;
	}
}

function millisOf(stamp: string): number {
	try {
		return decodeHybridTime(stamp).millis;
	} catch {
		// A mark nobody can read is a mark that has to be replaced, so fold now.
		return Number.NEGATIVE_INFINITY;
	}
}
