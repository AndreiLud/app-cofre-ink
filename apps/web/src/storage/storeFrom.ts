// The place a set of settings points at.
//
// A module of its own, and that is the whole reason it exists. It reaches for the cloud
// package, which carries a gzip, a WebDAV client, a database client and a spreadsheet
// client, and anything that imports this pays for all of that. What runs the automatic
// backup is mounted in the shell, which every screen loads on every visit, so it reaches
// for this only when a copy is actually about to be written.

import { createLibsqlStore, createWebdavStore } from "@cofre/cloud";
import type { SyncStore } from "@cofre/storage";
import type { DestinationSettings } from "./destinations.ts";

/**
 * Nothing for a server of theirs, which is the other kind of agreement: it merges by
 * record over a route of its own and has nothing to compare as a file.
 */
export function storeFrom(settings: DestinationSettings, name: string): SyncStore | null {
	if (settings.kind === "webdav") {
		return createWebdavStore({
			url: settings.address,
			user: settings.user,
			password: settings.secret,
			name,
		});
	}
	if (settings.kind === "database") {
		return createLibsqlStore({ url: settings.address, token: settings.secret, name });
	}
	return null;
}
