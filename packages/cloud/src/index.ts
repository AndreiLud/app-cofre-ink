// Where a space can be kept, besides here and besides a server.
//
// Two shapes of destination live here. Most of them are somewhere a file can be read
// and written, which is all a drive or a folder can offer, and each of those has to say
// what it can promise about two devices writing at the same moment. The other is a
// database, which keeps the log as rows and needs to promise nothing, because appending
// to a log is not a thing two devices can do wrong. Registry 0017 has the reasoning,
// and registry 0026 has the database.

export {
	type FetchSeriesOptions,
	fetchSeries,
	SERIES_CODE,
	type Series,
	type SeriesPoint,
	seriesUrl,
} from "./bancoCentral.ts";
export { bundleFileName, createFileStore, type FileStoreOptions } from "./file.ts";
export {
	mirrorToSheet,
	type SheetOptions,
	type SheetResult,
	sheetUrl,
} from "./googleSheets.ts";
export { CloudError, call, callJson, type Fetcher } from "./http.ts";
export { createLibsqlStore, type LibsqlOptions } from "./libsql.ts";
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

export type DestinationKind = "file" | "server" | "webdav" | "database";

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
	database: { safeTogether: true, worksInABrowser: true },
};
