// The browser side of one exchange with a server.
//
// This is what makes browser mode and server mode two halves of one thing rather than
// two applications. The data lives in this browser, and when the person asks, it meets
// a server of theirs and the two agree. Nothing is sent on its own: there is a button,
// and the button says where the data is going.

import type { Change, Driver, Person, SyncSummary } from "@cofre/storage";
import { syncSpace } from "@cofre/storage";

const STAMP_KEY = "cofreSyncStamp";
const AT_KEY = "cofreSyncAt";

function readMark(key: string, spaceId: string, server: string): string | null {
	try {
		return localStorage.getItem(`${key}:${server}:${spaceId}`);
	} catch {
		return null;
	}
}

function writeMark(key: string, spaceId: string, server: string, value: string): void {
	try {
		localStorage.setItem(`${key}:${server}:${spaceId}`, value);
	} catch {
		// Without storage the next exchange starts from the beginning, which is slower
		// and still correct, because both sides are idempotent.
	}
}

/** The highest stamp this browser has exchanged with that server for that space. */
export function lastStamp(spaceId: string, server: string): string | null {
	return readMark(STAMP_KEY, spaceId, server);
}

/** When the last exchange happened, as milliseconds, or nothing if it never did. */
export function lastSyncAt(spaceId: string, server: string): number | null {
	const value = readMark(AT_KEY, spaceId, server);
	const parsed = value === null ? Number.NaN : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

type Exchange = {
	changes: Change[];
	people: Person[];
	stamp: string | null;
	applied: number;
	/** Entries the server would not take, because a device may only push its own. */
	refused: number;
};

export class SyncError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "SyncError";
		this.status = status;
	}
}

export type SyncOutcome = SyncSummary & { refused: number; at: number };

/**
 * One round trip for one space. The address is the person's own server, and the cookie
 * they signed in with is what says who they are, so a space they do not belong to
 * answers that it does not exist.
 *
 * The profile travels with the push because the records of this browser are written in
 * the name of the profile made on this device, which the server has never heard of. It
 * writes it down as somebody the records point at, never as an account.
 */
export async function syncWithServer(
	driver: Driver,
	server: string,
	spaceId: string,
	profile?: { id: string; email: string; name: string; image?: string | null },
): Promise<SyncOutcome> {
	let refused = 0;

	const summary = await syncSpace(
		driver,
		{
			exchange: async (input: { spaceId: string; since: string | null; changes: Change[] }) => {
				const response = await fetch(`${server}/api/spaces/${input.spaceId}/sync`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({ since: input.since, changes: input.changes, profile }),
				});

				const text = await response.text();
				const body = text === "" ? {} : (JSON.parse(text) as Record<string, unknown>);

				if (!response.ok) {
					throw new SyncError(
						response.status,
						typeof body.error === "string" ? body.error : "unexpected",
					);
				}

				const answer = body as unknown as Exchange;
				refused = answer.refused ?? 0;
				return { changes: answer.changes ?? [], people: answer.people ?? [] };
			},
		},
		{ spaceId, since: lastStamp(spaceId, server) },
	);

	const at = Date.now();
	if (summary.stamp) writeMark(STAMP_KEY, spaceId, server, summary.stamp);
	writeMark(AT_KEY, spaceId, server, String(at));

	return { ...summary, refused, at };
}
