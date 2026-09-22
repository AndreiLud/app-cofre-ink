// Where a space can be kept, besides here and besides a server.
//
// Every destination in this package is the same thing to the engine: somewhere a file
// can be read and written. What differs is what each one needs from the person, and
// what each one can promise about two devices writing at the same moment, which is
// written down beside each of them and in registry 0017.

export {
	createDropboxStore,
	type DropboxOptions,
	dropboxAccountName,
} from "./dropbox.ts";
export { bundleFileName, createFileStore, type FileStoreOptions } from "./file.ts";
export { createGoogleDriveStore, type GoogleDriveOptions } from "./googleDrive.ts";
export {
	mirrorToSheet,
	type SheetOptions,
	type SheetResult,
	sheetUrl,
} from "./googleSheets.ts";
export { CloudError, call, callJson, type Fetcher } from "./http.ts";
export {
	challengeOf,
	finishOAuth,
	type OAuthService,
	type OAuthSetup,
	type OAuthStart,
	type OAuthToken,
	refreshOAuth,
	startOAuth,
} from "./oauth.ts";
export {
	BUNDLE_MEDIA_TYPE,
	base64Of,
	isPacked,
	packBundle,
	storedFileName,
	unpackBundle,
	unpackText,
} from "./pack.ts";
export { createWebdavStore, fileNameFor, type WebdavOptions } from "./webdav.ts";

export type DestinationKind = "file" | "server" | "webdav" | "dropbox" | "googleDrive";

/** What each destination needs, and what it can promise. Read by the screen. */
export const DESTINATIONS: Record<
	DestinationKind,
	{
		/** True when two devices writing at the same moment cannot lose a write. */
		safeTogether: boolean;
		/** True when it works from a browser without the other side allowing it. */
		worksInABrowser: boolean;
	}
> = {
	file: { safeTogether: true, worksInABrowser: true },
	server: { safeTogether: true, worksInABrowser: true },
	webdav: { safeTogether: true, worksInABrowser: false },
	dropbox: { safeTogether: true, worksInABrowser: true },
	googleDrive: { safeTogether: false, worksInABrowser: true },
};
