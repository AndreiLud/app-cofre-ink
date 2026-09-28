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

export function storedDestination(): DestinationSettings {
	const raw = read(KEY);
	if (raw === null) return { ...EMPTY_SETTINGS };
	try {
		const kept = { ...EMPTY_SETTINGS, ...(JSON.parse(raw) as Partial<DestinationSettings>) };
		if (kept.kind !== null && KINDS.has(kept.kind)) return kept;

		// Somebody who had chosen Dropbox or Drive before those were taken out, or the
		// file that stopped being a destination of its own, or a server of theirs, is
		// still carrying the word in this browser.
		//
		// Everything of that place goes, not only its name. Keeping the address, the user
		// and the secret left the next place somebody picked already filled in with the
		// old one, and in the case of a server that secret was the password of their
		// account. And the backup goes off, because a backup that is on with nowhere to
		// write is a panel that says Active next to None configured and offers no way out
		// of it, which is what 1.0.2 shipped while its own notes promised otherwise.
		//
		// Silently: this is a read, and a screen calls it while it is drawing. Telling
		// the listeners here would set state in the middle of somebody else's render,
		// which React refuses and which took the data screen down with it.
		clearStored();
		return { ...EMPTY_SETTINGS };
	} catch {
		return { ...EMPTY_SETTINGS };
	}
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
	write(KEY, JSON.stringify(settings));
	tellThem();
}

function clearStored(): void {
	write(KEY, JSON.stringify(EMPTY_SETTINGS));
	write(WHEN_KEY, JSON.stringify({ ...NOT_BACKING_UP, on: false }));
}

/** The place, everything it needed, and the backup that was pointed at it, all gone. */
export function forgetDestination(): void {
	clearStored();
	tellThem();
}

export function storedWhen(): WhenToBackUp {
	const raw = read(WHEN_KEY);
	if (raw === null) return { ...NOT_BACKING_UP };
	try {
		const kept = { ...NOT_BACKING_UP, ...(JSON.parse(raw) as Partial<WhenToBackUp>) };
		const every = kept.everyMinutes;
		return {
			// Derived, and not only stored. Two keys that can disagree will, and the one
			// that matters is the place: on with nowhere to write is not on.
			on: kept.on === true && storedDestination().kind !== null,
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
