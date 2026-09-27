// What the automatic backup is doing, for whichever screen is on.
//
// The thing that runs it is mounted once, around the whole application, because a copy
// that only keeps up while somebody is looking at the data screen is not a copy that
// keeps up. What it found has to be readable from that screen all the same, so the state
// lives here, in one place, and React is told when it moves.
//
// It is deliberately not a query and not a context. It is not server state, and a second
// provider around the application to hold five fields would be a provider.

import type { BackupOutcome } from "@cofre/storage";

export type BackupState = {
	busy: boolean;
	/** The last time a run finished, whether or not it wrote anything. */
	at: number | null;
	/** Spaces where both sides moved, which nobody may resolve but a person. */
	waiting: BackupOutcome[];
	/** What to say, already in the language of whoever is reading. */
	said: string | null;
	problem: string | null;
};

const EMPTY: BackupState = { busy: false, at: null, waiting: [], said: null, problem: null };

let state: BackupState = EMPTY;
const listeners = new Set<() => void>();

export function subscribeToBackup(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function backupState(): BackupState {
	return state;
}

export function setBackupState(next: Partial<BackupState>): void {
	state = { ...state, ...next };
	for (const listener of listeners) listener();
}

/** For a test, and for somebody switching the whole thing off. */
export function forgetBackupState(): void {
	state = EMPTY;
	for (const listener of listeners) listener();
}
