// Making the file small before it leaves.
//
// The log of a space is JSON, and JSON of this shape is mostly the same twenty words
// repeated: the names of the columns, the names of the tables, the identifiers that
// share a prefix because they are made in order. It compresses to a fifth of itself,
// sometimes less, and a file a fifth of the size is a sync that finishes on the kind of
// connection people actually have.
//
// Reading accepts both shapes. A file written by an older version is plain JSON, and it
// stays readable forever.

import { isBundle, type SyncBundle } from "@cofre/storage";
import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";

export const BUNDLE_MEDIA_TYPE = "application/gzip";

/** True when these bytes were packed, which the first two of them say. */
export function isPacked(bytes: Uint8Array): boolean {
	return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export function packBundle(bundle: SyncBundle): Uint8Array {
	return gzipSync(strToU8(JSON.stringify(bundle)), { level: 6 });
}

/** A bundle out of bytes, packed or not, or nothing when it is neither. */
export function unpackBundle(bytes: Uint8Array): SyncBundle | null {
	if (bytes.length === 0) return null;

	try {
		const text = isPacked(bytes) ? strFromU8(gunzipSync(bytes)) : strFromU8(bytes);
		const parsed = JSON.parse(text) as unknown;
		return isBundle(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/** The same, for a body that arrived as text rather than as bytes. */
export function unpackText(text: string): SyncBundle | null {
	try {
		const parsed = JSON.parse(text) as unknown;
		return isBundle(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/** Bytes as base64, for the one service that wants the file inside a form. */
export function base64Of(bytes: Uint8Array): string {
	let binary = "";
	for (let start = 0; start < bytes.length; start += 8192) {
		binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
	}
	return btoa(binary);
}

export function bundleFileName(spaceId: string, when = new Date()): string {
	const day = [
		when.getFullYear(),
		String(when.getMonth() + 1).padStart(2, "0"),
		String(when.getDate()).padStart(2, "0"),
	].join("");
	return `cofre_sync_${spaceId.slice(0, 8)}_${day}.json.gz`;
}

/** The name of the file a space keeps in a drive. */
export function storedFileName(spaceId: string): string {
	return `cofre_${spaceId}.json.gz`;
}
