// A folder in Dropbox.
//
// Of the drives people actually use, this is the one whose API was designed by somebody
// who had thought about two devices writing at once: every file has a revision, an
// upload can say which revision it expects, and the answer when it is wrong is a
// conflict rather than a lost write.
//
// The token belongs to the person. Nothing in this repository ever holds one.

import {
	isBundle,
	StoreConflictError,
	type StoredBundle,
	type SyncBundle,
	type SyncStore,
} from "@cofre/storage";
import { call, callJson, type Fetcher } from "./http.ts";
import { fileNameFor } from "./webdav.ts";

export type DropboxOptions = {
	/** An access token the person generated for their own application. */
	token: string;
	/** The folder inside the application folder, with a slash in front. */
	folder?: string;
	fetcher?: Fetcher;
	name?: string;
};

type Uploaded = { rev?: string };

function pathOf(options: DropboxOptions, spaceId: string): string {
	const folder = (options.folder ?? "").replace(/\/+$/, "");
	return `${folder}/${fileNameFor(spaceId)}`;
}

export function createDropboxStore(options: DropboxOptions): SyncStore {
	const authorisation = { Authorization: `Bearer ${options.token}` };

	return {
		name: options.name ?? "Dropbox",

		async read(spaceId: string): Promise<StoredBundle> {
			const response = await call("https://content.dropboxapi.com/2/files/download", {
				where: "Dropbox",
				method: "POST",
				fetcher: options.fetcher,
				headers: {
					...authorisation,
					"Dropbox-API-Arg": JSON.stringify({ path: pathOf(options, spaceId) }),
				},
				// A file that is not there yet answers with a conflict, which is an answer.
				allow: [409],
			});

			if (response.status === 409) return { bundle: null, revision: null };

			const text = await response.text();
			const parsed = text === "" ? null : (JSON.parse(text) as unknown);

			// The revision travels in a header beside the content.
			const result = response.headers.get("dropbox-api-result");
			const revision = result ? ((JSON.parse(result) as Uploaded).rev ?? null) : null;

			return { bundle: isBundle(parsed) ? parsed : null, revision };
		},

		async write(spaceId: string, bundle: SyncBundle, revision: string | null) {
			const mode = revision === null ? { ".tag": "add" } : { ".tag": "update", update: revision };

			const response = await call("https://content.dropboxapi.com/2/files/upload", {
				where: "Dropbox",
				method: "POST",
				fetcher: options.fetcher,
				headers: {
					...authorisation,
					"Content-Type": "application/octet-stream",
					"Dropbox-API-Arg": JSON.stringify({
						path: pathOf(options, spaceId),
						mode,
						autorename: false,
						mute: true,
					}),
				},
				body: JSON.stringify(bundle),
				allow: [409],
			});

			// A conflict here means the file moved since it was read, which is exactly
			// what the engine knows how to recover from.
			if (response.status === 409) throw new StoreConflictError();

			const written = (await response.json()) as Uploaded;
			return { revision: written.rev ?? null };
		},
	};
}

/** True when a token still works, which is the only way to check one. */
export async function dropboxAccountName(token: string, fetcher?: Fetcher): Promise<string | null> {
	const answer = await callJson<{ name?: { display_name?: string } }>(
		"https://api.dropboxapi.com/2/users/get_current_account",
		{
			where: "Dropbox",
			method: "POST",
			fetcher,
			headers: { Authorization: `Bearer ${token}` },
		},
	);
	return answer.name?.display_name ?? null;
}
