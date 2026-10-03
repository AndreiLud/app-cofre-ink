// Where a space can be kept, besides here and besides a server.
//
// Two shapes of destination live here. Most of them are somewhere a file can be read
// and written, which is all a drive or a folder can offer, and each of those has to say
// what it can promise about two devices writing at the same moment. The other is a
// database, which keeps the log as rows and needs to promise nothing, because appending
// to a log is not a thing two devices can do wrong. Registry 0017 has the reasoning,
// and registry 0026 has the database.

export {
	DAILY_CODE,
	type DailySeries,
	type DayPoint,
	dailyUrl,
	type FetchedIndices,
	type FetchSeriesOptions,
	fetchDailySeries,
	fetchEveryIndex,
	fetchSeries,
	type HeldIndices,
	SERIES_CODE,
	type Series,
	type SeriesPoint,
	seriesUrl,
	windowsOf,
} from "./bancoCentral.ts";
export {
	mirrorToSheet,
	type SheetOptions,
	type SheetResult,
	sheetUrl,
} from "./googleSheets.ts";
export { CloudError, call, callJson, type Fetcher, looksReachable } from "./http.ts";
export { createLibsqlStore, type LibsqlOptions } from "./libsql.ts";
export {
	BUNDLE_MEDIA_TYPE,
	base64Of,
	bundleFileName,
	isPacked,
	packBundle,
	storedFileName,
	unpackBundle,
	unpackText,
} from "./pack.ts";
export { createWebdavStore, fileNameFor, type WebdavOptions } from "./webdav.ts";

/**
 * Where a copy is kept up to date on its own.
 *
 * A file the person carries used to be one of these, and it is not one any more: a
 * destination is somewhere this application can reach by itself, and a file in a
 * downloads folder is somewhere a person goes. Carrying a copy by hand is still there
 * and is its own thing on the screen, with a button that writes one and a button that
 * reads one back.
 *
 * A server of theirs was one of these too, and is not any more. It was never the same
 * kind of thing: the other two hold a file this device writes and compares, and a server
 * holds the same spaces and merges them record by record. Registry 0040 has the reasoning
 * and what it costs.
 */
export type DestinationKind = "webdav" | "database";

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
	webdav: { safeTogether: true, worksInABrowser: false },
	database: { safeTogether: true, worksInABrowser: true },
};
