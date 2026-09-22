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
	/** An application password or an access token, depending on the destination. */
	secret: string;
	/** The folder inside the drive, when the drive has folders. */
	folder: string;
	/** The identifier of the application the owner made in their own account. */
	clientId: string;
	/**
	 * The secret of that same application, which only Google asks for.
	 *
	 * Its token endpoint refuses a web application client that sends only the proof and
	 * answers that the secret is missing. This one belongs to the person, was made in
	 * their own account, and stays here beside the token it buys. Dropbox never sees
	 * one.
	 */
	clientSecret: string;
};

export const EMPTY_SETTINGS: DestinationSettings = {
	kind: "file",
	address: "",
	user: "",
	secret: "",
	folder: "",
	clientId: "",
	clientSecret: "",
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

/** What the person was doing when they were sent to a service to sign in. */
export type PendingOAuth = {
	kind: DestinationKind;
	verifier: string;
	state: string;
	clientId: string;
	clientSecret?: string;
	redirectUri: string;
};

const PENDING = "cofreOAuth";

export function rememberPending(pending: PendingOAuth): void {
	write(PENDING, JSON.stringify(pending));
}

export function takePending(): PendingOAuth | null {
	const raw = read(PENDING);
	if (raw === null) return null;
	try {
		localStorage.removeItem(PENDING);
	} catch {
		// Nothing to forget.
	}
	try {
		return JSON.parse(raw) as PendingOAuth;
	} catch {
		return null;
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
