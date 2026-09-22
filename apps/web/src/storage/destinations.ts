// Where this device keeps a copy, and what it needs to get there.
//
// The settings live in this browser and nowhere else, which includes the tokens. That
// is a real trade: a token in local storage is readable by anything that can run
// script on this page, and the alternative is a server of ours holding it, which this
// project will not do. The screen says so plainly next to the field.

import type { DestinationKind } from "@cofre/cloud";

export type DestinationSettings = {
	kind: DestinationKind;
	/** The address of a server of the person, or of a WebDAV folder. */
	address: string;
	user: string;
	/** An application password or a database token, depending on the destination. */
	secret: string;
};

export const EMPTY_SETTINGS: DestinationSettings = {
	kind: "file",
	address: "",
	user: "",
	secret: "",
};

const KEY = "cofreDestination";

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

export function storedDestination(): DestinationSettings {
	const raw = read(KEY);
	if (raw === null) return { ...EMPTY_SETTINGS };
	try {
		return { ...EMPTY_SETTINGS, ...(JSON.parse(raw) as Partial<DestinationSettings>) };
	} catch {
		return { ...EMPTY_SETTINGS };
	}
}

export function rememberDestination(settings: DestinationSettings): void {
	write(KEY, JSON.stringify(settings));
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
