// A folder in Google Drive, or the corner of it that belongs to this application.
//
// The application folder is the better place by a wide margin: it is invisible in the
// interface of the drive, no other application can read it, and it costs the person no
// decision. The ordinary folder is there for somebody who wants to see the file.
//
// Drive has no version to check against on upload, so two devices writing in the same
// second can lose one of the two writes. What this does instead is read the time the
// file was last changed, and refuse to write when it moved since it was read. That is
// a narrower window, not a closed one, and registry 0017 says so out loud.

import {
	isBundle,
	StoreConflictError,
	type StoredBundle,
	type SyncBundle,
	type SyncStore,
} from "@cofre/storage";
import { call, callJson, type Fetcher } from "./http.ts";
import { fileNameFor } from "./webdav.ts";

export type GoogleDriveOptions = {
	/** A token with the drive.appdata or drive.file scope. */
	token: string;
	/** Where the file goes. The application folder is the default and the better one. */
	where?: "appDataFolder" | "drive";
	fetcher?: Fetcher;
	name?: string;
};

type DriveFile = { id: string; name: string; modifiedTime?: string };
type DriveList = { files?: DriveFile[] };

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export function createGoogleDriveStore(options: GoogleDriveOptions): SyncStore {
	const authorisation = { Authorization: `Bearer ${options.token}` };
	const space = options.where ?? "appDataFolder";

	const find = async (spaceId: string): Promise<DriveFile | null> => {
		const query = new URLSearchParams({
			q: `name = '${fileNameFor(spaceId)}' and trashed = false`,
			fields: "files(id, name, modifiedTime)",
			pageSize: "10",
		});
		if (space === "appDataFolder") {
			query.set("spaces", "appDataFolder");
		}

		const answer = await callJson<DriveList>(`${API}/files?${query.toString()}`, {
			where: "Google Drive",
			fetcher: options.fetcher,
			headers: authorisation,
		});
		return answer.files?.[0] ?? null;
	};

	return {
		name: options.name ?? "Google Drive",

		async read(spaceId: string): Promise<StoredBundle> {
			const file = await find(spaceId);
			if (!file) return { bundle: null, revision: null };

			const response = await call(`${API}/files/${file.id}?alt=media`, {
				where: "Google Drive",
				fetcher: options.fetcher,
				headers: authorisation,
				allow: [404],
			});
			if (response.status === 404) return { bundle: null, revision: null };

			const text = await response.text();
			const parsed = text === "" ? null : (JSON.parse(text) as unknown);
			return {
				bundle: isBundle(parsed) ? parsed : null,
				revision: file.modifiedTime ?? null,
			};
		},

		async write(spaceId: string, bundle: SyncBundle, revision: string | null) {
			const file = await find(spaceId);

			// The time the file was last changed stands in for a version. When it moved,
			// somebody else wrote it and the engine merges again before trying.
			if (file && revision !== null && file.modifiedTime !== revision) {
				throw new StoreConflictError();
			}
			if (file === null && revision !== null) throw new StoreConflictError();

			const body = JSON.stringify(bundle);

			if (file) {
				const written = await callJson<DriveFile>(
					`${UPLOAD}/files/${file.id}?uploadType=media&fields=id,modifiedTime`,
					{
						where: "Google Drive",
						method: "PATCH",
						fetcher: options.fetcher,
						headers: { ...authorisation, "Content-Type": "application/json" },
						body,
					},
				);
				return { revision: written.modifiedTime ?? null };
			}

			// Creating takes the name and the content in one request, in two parts.
			const boundary = "cofre";
			const metadata = {
				name: fileNameFor(spaceId),
				...(space === "appDataFolder" ? { parents: ["appDataFolder"] } : {}),
			};
			const multipart = [
				`--${boundary}`,
				"Content-Type: application/json; charset=UTF-8",
				"",
				JSON.stringify(metadata),
				`--${boundary}`,
				"Content-Type: application/json",
				"",
				body,
				`--${boundary}--`,
				"",
			].join("\r\n");

			const written = await callJson<DriveFile>(
				`${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`,
				{
					where: "Google Drive",
					method: "POST",
					fetcher: options.fetcher,
					headers: {
						...authorisation,
						"Content-Type": `multipart/related; boundary=${boundary}`,
					},
					body: multipart,
				},
			);
			return { revision: written.modifiedTime ?? null };
		},
	};
}
