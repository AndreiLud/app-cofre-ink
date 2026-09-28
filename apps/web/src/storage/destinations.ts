// Where this device keeps a copy, and what it needs to get there.
//
// The settings live in this browser and nowhere else, which includes the tokens. That
// is a real trade: a token in local storage is readable by anything that can run
// script on this page, and the alternative is a server of ours holding it, which this
// project will not do. The screen says so plainly next to the field.
//
// Nothing here is a copy of the data. It is the address of the place, whether the
// automatic backup is on, and when it is allowed to run.

import type { DestinationKind } from "@cofre/cloud";

export type DestinationSettings = {
	/** Null until somebody picks one, because there is no sensible default place. */
	kind: DestinationKind | null;
	/** The address of the WebDAV folder, or of the online database. */
	address: string;
	user: string;
	/** An application password or a database token, depending on the destination. */
	secret: string;
};

export const EMPTY_SETTINGS: DestinationSettings = {
	kind: null,
	address: "",
	user: "",
	secret: "",
};

/**
 * When the copy is allowed to be brought up to date.
 *
 * Every change is not a setting: with the backup on, a change is what a backup is for.
 * The two that are settings are the ones that cost something when nothing changed, a
 * round trip when the page opens and a round trip on a clock, so they are asked for.
 */
export type WhenToBackUp = {
	on: boolean;
	/** One exchange when the application opens. */
	onLoad: boolean;
	/** Minutes between exchanges, or null for no clock at all. */
	everyMinutes: number | null;
};

export const NOT_BACKING_UP: WhenToBackUp = { on: false, onLoad: true, everyMinutes: 60 };

/** The intervals the screen offers, which are the ones worth offering. */
export const INTERVALS = [15, 60, 360] as const;

const KEY = "cofreDestination";
const WHEN_KEY = "cofreBackupWhen";

function read(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function write(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Without storage the settings last for this tab, which still works.
	}
}

/** The ones that exist now. A browser can be holding the name of one that does not. */
const KINDS = new Set<DestinationKind>(["webdav", "database"]);

/** What one place needs, without the name of which place it is. */
type Fields = { address: string; user: string; secret: string };

const NO_FIELDS: Fields = { address: "", user: "", secret: "" };

/**
 * What this browser is holding: which place is chosen, and the fields of each place it
 * has ever had.
 *
 * Kept per place rather than in one set of three fields, because changing the name in the
 * list used to carry the address, the user and the application password of the old place
 * into the new one. A WebDAV folder answered for a database, so every run posted to the
 * folder's address with the folder's password as a token, and the panel said the copy was
 * going to a database while nothing was going anywhere. The other way round, emptying them
 * on every change, is what 1.0.2 did, and it threw away a folder somebody had set up
 * because they pressed a button on the front door.
 */
type StoredDestinations = {
	kind: DestinationKind | null;
	places: Partial<Record<DestinationKind, Fields>>;
};

/** The shape before places were kept apart, which a browser can still be holding. */
type OldShape = Partial<DestinationSettings> & { places?: unknown };

function readStored(): StoredDestinations {
	const raw = read(KEY);
	if (raw === null) return { kind: null, places: {} };
	try {
		const kept = JSON.parse(raw) as OldShape & Partial<StoredDestinations>;
		const kind =
			kept.kind !== undefined && kept.kind !== null && KINDS.has(kept.kind) ? kept.kind : null;

		if (kept.places !== undefined && typeof kept.places === "object" && kept.places !== null) {
			return { kind, places: kept.places as Partial<Record<DestinationKind, Fields>> };
		}

		// The old shape. What it holds belongs to the place it was holding it for, and a
		// place that no longer exists takes its fields with it rather than handing them to
		// whichever place is picked next.
		if (kind === null) return { kind: null, places: {} };
		return {
			kind,
			places: {
				[kind]: {
					address: kept.address ?? "",
					user: kept.user ?? "",
					secret: kept.secret ?? "",
				},
			},
		};
	} catch {
		return { kind: null, places: {} };
	}
}

export function storedDestination(): DestinationSettings {
	const stored = readStored();
	if (stored.kind === null) return { ...EMPTY_SETTINGS };
	return { kind: stored.kind, ...NO_FIELDS, ...(stored.places[stored.kind] ?? NO_FIELDS) };
}

/**
 * Enough of a place to write to it.
 *
 * Picking a name in the list is not the same as being able to reach anything, and the
 * run has to know the difference: it used to arm itself the moment a name was picked and
 * fail on every pass until the fields were filled in.
 */
export function readyToBackUp(settings: DestinationSettings): boolean {
	if (settings.kind === "webdav") {
		return settings.address !== "" && settings.user !== "" && settings.secret !== "";
	}
	if (settings.kind === "database") return settings.address !== "" && settings.secret !== "";
	return false;
}

/**
 * Whoever is running the backup has to hear when these change.
 *
 * The clock that fires every so often is set up from these settings, so a person who
 * moves it from an hour to fifteen minutes and waits an hour to see it take effect has
 * been told a small lie. One set of listeners, told on every write.
 */
const listeners = new Set<() => void>();

export function whenSettingsChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function tellThem(): void {
	for (const listener of listeners) listener();
}

export function rememberDestination(settings: DestinationSettings): void {
	const stored = readStored();
	const places = { ...stored.places };
	if (settings.kind !== null) {
		places[settings.kind] = {
			address: settings.address,
			user: settings.user,
			secret: settings.secret,
		};
	}
	write(KEY, JSON.stringify({ kind: settings.kind, places } satisfies StoredDestinations));

	// Choosing no place at all is a decision, so it switches the backup off rather than
	// leaving an intention behind that arms itself again the day a place is picked.
	if (settings.kind === null) write(WHEN_KEY, JSON.stringify({ ...storedWhen(), on: false }));
	tellThem();
}

/**
 * Which place is chosen. The fields of every place stay exactly where they are.
 *
 * Changing the name in the list is not the same as typing into it, and treating the two
 * as one write is what carried a WebDAV address and its application password into a
 * database destination, where every run then posted the folder's password to the folder's
 * address as a token and failed, on a screen that said the copy was going to a database.
 */
export function chooseDestination(kind: DestinationKind | null): void {
	const stored = readStored();
	write(KEY, JSON.stringify({ kind, places: stored.places } satisfies StoredDestinations));
	if (kind === null) write(WHEN_KEY, JSON.stringify({ ...storedWhen(), on: false }));
	tellThem();
}

/**
 * Whether the person asked for a backup, which is not the same as whether one can happen.
 *
 * Kept apart on purpose. A place with a field missing is a backup that is on and cannot
 * run, and the two facts have to be sayable separately or the panel either lies about
 * what it is doing or takes away the button that switches it off.
 */
export function storedWhen(): WhenToBackUp {
	const raw = read(WHEN_KEY);
	if (raw === null) return { ...NOT_BACKING_UP };
	try {
		const kept = { ...NOT_BACKING_UP, ...(JSON.parse(raw) as Partial<WhenToBackUp>) };
		const every = kept.everyMinutes;
		return {
			on: kept.on === true,
			onLoad: kept.onLoad !== false,
			everyMinutes:
				typeof every === "number" && INTERVALS.includes(every as (typeof INTERVALS)[number])
					? every
					: null,
		};
	} catch {
		return { ...NOT_BACKING_UP };
	}
}

export function rememberWhen(when: WhenToBackUp): void {
	write(WHEN_KEY, JSON.stringify(when));
	tellThem();
}

/**
 * Whether a copy is actually being kept: asked for, and with somewhere to write it.
 *
 * This is what a screen says out loud and what the run obeys. The two halves were one
 * value before, which is how a panel came to say Active beside None configured.
 */
export function backupIsRunning(): boolean {
	return storedWhen().on && readyToBackUp(storedDestination());
}

/**
 * What a browser is still holding for a place that no longer exists.
 *
 * A server of theirs was a destination until 1.0.2, and Dropbox and Drive before that.
 * The name, the address, the account email and the password typed into that panel are all
 * still here, and the password of an account is not a thing to leave lying in storage.
 *
 * This runs when the application opens, which is what the 1.0.3 notes promised and did not
 * do: the clearing happened on a read, so anybody who never opened the data screen kept
 * all of it. It answers whether it took anything, so the one caller can say so.
 */
export function forgetPlacesThatAreGone(): boolean {
	const raw = read(KEY);
	if (raw === null) return false;
	try {
		const kept = JSON.parse(raw) as OldShape & Partial<StoredDestinations>;
		const named = new Set<string>();
		if (typeof kept.kind === "string") named.add(kept.kind);
		if (kept.places !== undefined && typeof kept.places === "object" && kept.places !== null) {
			for (const name of Object.keys(kept.places)) named.add(name);
		}

		const gone = [...named].filter((name) => !KINDS.has(name as DestinationKind));
		if (gone.length === 0) return false;

		const stored = readStored();
		const places: Partial<Record<DestinationKind, Fields>> = {};
		for (const [name, fields] of Object.entries(stored.places)) {
			if (KINDS.has(name as DestinationKind)) places[name as DestinationKind] = fields as Fields;
		}
		write(KEY, JSON.stringify({ kind: stored.kind, places } satisfies StoredDestinations));
		if (stored.kind === null) write(WHEN_KEY, JSON.stringify({ ...storedWhen(), on: false }));
		tellThem();
		return true;
	} catch {
		return false;
	}
}

/** The last time this device met each destination, per space. */
export function markMet(spaceId: string, where: string): void {
	write(`cofreMet:${where}:${spaceId}`, String(Date.now()));
}

export function lastMet(spaceId: string, where: string): number | null {
	const value = read(`cofreMet:${where}:${spaceId}`);
	const parsed = value === null ? Number.NaN : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

/**
 * When the whole copy was last up to date, which is the oldest of the spaces in it.
 *
 * The backup takes every space at once, so a date that reports the luckiest of them
 * would say the data is safer than it is. The same reading the data screen uses for the
 * copy somebody saves by hand.
 */
export function lastBackupAt(spaceIds: readonly string[], where: string): number | null {
	if (spaceIds.length === 0) return null;
	let oldest: number | null = null;
	for (const spaceId of spaceIds) {
		const at = lastMet(spaceId, where);
		if (at === null) return null;
		if (oldest === null || at < oldest) oldest = at;
	}
	return oldest;
}
