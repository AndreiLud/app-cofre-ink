// A folder on a server the person already runs.
//
// WebDAV is what Nextcloud, ownCloud, a Synology box and half the hosting panels in
// the world speak, and it is the closest thing to a standard for "a folder somewhere
// else". It also has the one thing this engine wants and most drives do not: a version
// on every file, which makes two devices saving at once safe rather than lucky.
//
// The catch is the browser. A WebDAV server that does not allow this page to call it
// answers the browser and not us, and the person sees a failure they cannot act on
// unless we say what it means, which the screen does.

import {
	isBundle,
	StoreConflictError,
	type StoredBundle,
	type SyncBundle,
	type SyncStore,
} from "@cofre/storage";
import { call, type Fetcher } from "./http.ts";

export type WebdavOptions = {
	/** The address of the folder, such as https://nuvem.exemplo.com/remote.php/dav/files/ana/cofre */
	url: string;
	user: string;
	/** An application password, never the password of the account itself. */
	password: string;
	fetcher?: Fetcher;
	name?: string;
};

function authorisation(options: WebdavOptions): string {
	const pair = `${options.user}:${options.password}`;
	// btoa is in every browser and in Node since long before this project.
	return `Basic ${btoa(unescape(encodeURIComponent(pair)))}`;
}

export function fileNameFor(spaceId: string): string {
	return `cofre_${spaceId}.json`;
}

export function createWebdavStore(options: WebdavOptions): SyncStore {
	const base = options.url.replace(/\/+$/, "");
	const headers = { Authorization: authorisation(options) };

	return {
		name: options.name ?? "WebDAV",

		async read(spaceId: string): Promise<StoredBundle> {
			const response = await call(`${base}/${fileNameFor(spaceId)}`, {
				where: "WebDAV",
				headers,
				fetcher: options.fetcher,
				// Nothing there yet is the ordinary state of the first sync.
				allow: [404],
			});

			if (response.status === 404) return { bundle: null, revision: null };

			const text = await response.text();
			const parsed = text === "" ? null : (JSON.parse(text) as unknown);
			return {
				bundle: isBundle(parsed) ? parsed : null,
				revision: response.headers.get("etag"),
			};
		},

		async write(spaceId: string, bundle: SyncBundle, revision: string | null) {
			const response = await call(`${base}/${fileNameFor(spaceId)}`, {
				where: "WebDAV",
				method: "PUT",
				fetcher: options.fetcher,
				headers: {
					...headers,
					"Content-Type": "application/json",
					// Only write over the version we read, or create the file if it is not
					// there. Either way, never over somebody else's write.
					...(revision === null ? { "If-None-Match": "*" } : { "If-Match": revision }),
				},
				body: JSON.stringify(bundle),
				allow: [412, 409],
			});

			if (response.status === 412 || response.status === 409) throw new StoreConflictError();
			return { revision: response.headers.get("etag") };
		},
	};
}
