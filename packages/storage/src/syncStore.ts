// Meeting through a file instead of through a server.
//
// The engine in sync.ts needs two things from the other side: what it has, and
// somewhere to put what this device has. A server gives both in one request. A folder
// in a drive, a WebDAV share, or a file somebody carries on a pen drive gives neither,
// and yet all three work, because a file that holds the change log of a space is a
// perfectly good place for two devices to meet.
//
// So this is the second shape of a peer: read the file, apply what is in it, put the
// union back. It converges for the same reason the server does, which is that the log
// is a set of entries with identifiers and folding it twice changes nothing.
//
// What it does not give is a lock. Two devices writing the same file in the same second
// can lose one of the two writes, which is why a store that can tell us the version it
// has read is asked for one, and why the write is tried again when the version moved.

import type { Driver } from "./driver.ts";
import type { Change } from "./models.ts";
import {
	applyChanges,
	applyPeople,
	changesSince,
	latestStampOf,
	type Person,
	peopleInSpace,
	replicableOnly,
	type SyncSummary,
} from "./sync.ts";

export const BUNDLE_FORMAT = "cofre.sync";
export const BUNDLE_VERSION = 1;

/** Everything one space has ever had written to it, as a file. */
export type SyncBundle = {
	format: typeof BUNDLE_FORMAT;
	version: number;
	spaceId: string;
	/** The whole log, in stamp order. */
	changes: Change[];
	/** The people those changes point at, so a device that never met them can write. */
	people: Person[];
	writtenAt: number;
};

/** What a store hands back: the file, and what version of it this was. */
export type StoredBundle = {
	bundle: SyncBundle | null;
	/** Whatever the store calls a version. Null when it cannot say. */
	revision: string | null;
};

/**
 * Somewhere a file can live.
 *
 * Every destination in `@cofre/cloud` is one of these, and so is a file the person
 * moves by hand. Nothing else about them reaches the engine.
 */
export type SyncStore = {
	/** For the screen, in the words of the person who set it up. */
	readonly name: string;
	read(spaceId: string): Promise<StoredBundle>;
	write(
		spaceId: string,
		bundle: SyncBundle,
		revision: string | null,
	): Promise<{ revision: string | null }>;
};

/** Thrown by a store when the file moved under us, so the merge is tried again. */
export class StoreConflictError extends Error {
	constructor(message = "the file changed while this device was writing it") {
		super(message);
		this.name = "StoreConflictError";
	}
}

export function isBundle(value: unknown): value is SyncBundle {
	const bundle = value as SyncBundle | null;
	return (
		bundle !== null &&
		typeof bundle === "object" &&
		bundle.format === BUNDLE_FORMAT &&
		Array.isArray(bundle.changes)
	);
}

/** One entry per identifier, in the order resolution reads them. */
function union(left: readonly Change[], right: readonly Change[]): Change[] {
	const byId = new Map<string, Change>();
	for (const change of [...left, ...right]) byId.set(change.id, change);
	return [...byId.values()].sort(
		(one, other) => one.hlc.localeCompare(other.hlc) || one.deviceId.localeCompare(other.deviceId),
	);
}

function unionPeople(left: readonly Person[], right: readonly Person[]): Person[] {
	const byId = new Map<string, Person>();
	for (const person of [...left, ...right]) {
		if (!byId.has(person.id)) byId.set(person.id, person);
	}
	return [...byId.values()];
}

export type StoreSyncSummary = SyncSummary & {
	/** The name of the place this device met. */
	store: string;
	/** True when the file already held everything this device had to say. */
	unchanged: boolean;
};

/**
 * One exchange with one file.
 *
 * Read, apply, merge, write. The write is skipped when the file already holds every
 * entry this device has, which is the ordinary case for the second device to sync and
 * costs nothing to check.
 */
export async function syncWithStore(
	driver: Driver,
	store: SyncStore,
	input: { spaceId: string; attempts?: number },
): Promise<StoreSyncSummary> {
	const attempts = Math.max(1, input.attempts ?? 3);
	let lastError: unknown = null;

	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const { bundle, revision } = await store.read(input.spaceId);

		// A file that belongs to another space is not this space's file, and writing
		// over it would destroy somebody else's history.
		if (bundle && bundle.spaceId !== input.spaceId) {
			throw new Error("this file holds another space");
		}

		let pulled = 0;
		if (bundle) {
			if (bundle.people.length > 0) await applyPeople(driver, bundle.people);
			const applied = await applyChanges(driver, bundle.changes, { spaceId: input.spaceId });
			pulled = applied.applied;
		}

		const mine = replicableOnly(await changesSince(driver, input.spaceId, null, 20_000));
		const theirs = bundle?.changes ?? [];
		const merged = union(theirs, mine);

		const nothingToSay = merged.length === theirs.length && pulled === 0;
		if (nothingToSay) {
			return {
				spaceId: input.spaceId,
				pushed: 0,
				pulled,
				rejected: [],
				stamp: await latestStampOf(driver, input.spaceId),
				store: store.name,
				unchanged: true,
			};
		}

		const next: SyncBundle = {
			format: BUNDLE_FORMAT,
			version: BUNDLE_VERSION,
			spaceId: input.spaceId,
			changes: merged,
			people: unionPeople(bundle?.people ?? [], await peopleInSpace(driver, input.spaceId)),
			writtenAt: Date.now(),
		};

		try {
			await store.write(input.spaceId, next, revision);
			return {
				spaceId: input.spaceId,
				pushed: merged.length - theirs.length,
				pulled,
				rejected: [],
				stamp: await latestStampOf(driver, input.spaceId),
				store: store.name,
				unchanged: false,
			};
		} catch (error) {
			// Somebody else wrote the file first. Their entries are read on the next pass
			// and the union is taken again, which is why this is safe to repeat.
			if (!(error instanceof StoreConflictError)) throw error;
			lastError = error;
		}
	}

	throw lastError ?? new StoreConflictError();
}

/** A store that keeps the file in memory, for the tests and for trying things out. */
export function createMemoryStore(name = "memory"): SyncStore & { revision: string | null } {
	let held: SyncBundle | null = null;
	let revision: string | null = null;
	let count = 0;

	return {
		name,
		get revision() {
			return revision;
		},
		async read() {
			return { bundle: held, revision };
		},
		async write(_spaceId, bundle, given) {
			if (revision !== null && given !== revision) throw new StoreConflictError();
			held = bundle;
			count += 1;
			revision = String(count);
			return { revision };
		},
	};
}
