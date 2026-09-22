// A spreadsheet that keeps up with the records.
//
// This one is not a place two devices meet. A spreadsheet has no identity for a row
// and people edit them freely, so treating one as a source of truth is how a month of
// records quietly changes. What it is instead is a copy that can be refreshed: the
// records go out, the sheet is rewritten, and anybody the person shares it with sees
// the same numbers in a tool they already know.
//
// The other direction already exists and is better: a spreadsheet saved as XLSX or CSV
// is read by the importers, with a screen to check it before anything is written.

import { callJson, type Fetcher } from "./http.ts";

export type SheetOptions = {
	/** A token with the spreadsheets scope. */
	token: string;
	/** The sheet to rewrite. Left out, a new one is made and its identifier given back. */
	spreadsheetId?: string | null;
	/** The name a new spreadsheet is given. */
	title?: string;
	/** The tab inside it. */
	tab?: string;
	fetcher?: Fetcher;
};

export type SheetResult = {
	spreadsheetId: string;
	url: string;
	rows: number;
};

const API = "https://sheets.googleapis.com/v4/spreadsheets";

type Created = { spreadsheetId: string; spreadsheetUrl?: string };

export function sheetUrl(spreadsheetId: string): string {
	return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

/**
 * Rewrites the sheet with what is given.
 *
 * Everything in the tab is cleared first, on purpose: a mirror that appends would
 * double every record the second time somebody pressed the button.
 */
export async function mirrorToSheet(
	options: SheetOptions,
	header: readonly string[],
	rows: readonly (readonly (string | number | null)[])[],
): Promise<SheetResult> {
	const authorisation = { Authorization: `Bearer ${options.token}` };
	const tab = options.tab ?? "Cofre";

	let spreadsheetId = options.spreadsheetId ?? null;

	if (spreadsheetId === null) {
		const created = await callJson<Created>(API, {
			where: "Google Sheets",
			method: "POST",
			fetcher: options.fetcher,
			headers: { ...authorisation, "Content-Type": "application/json" },
			body: JSON.stringify({
				properties: { title: options.title ?? "Cofre" },
				sheets: [{ properties: { title: tab } }],
			}),
		});
		spreadsheetId = created.spreadsheetId;
	} else {
		await callJson(`${API}/${spreadsheetId}/values/${encodeURIComponent(tab)}:clear`, {
			where: "Google Sheets",
			method: "POST",
			fetcher: options.fetcher,
			headers: { ...authorisation, "Content-Type": "application/json" },
			body: "{}",
		});
	}

	const values = [[...header], ...rows.map((row) => [...row])];

	await callJson(
		`${API}/${spreadsheetId}/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=USER_ENTERED`,
		{
			where: "Google Sheets",
			method: "PUT",
			fetcher: options.fetcher,
			headers: { ...authorisation, "Content-Type": "application/json" },
			body: JSON.stringify({ values }),
		},
	);

	return { spreadsheetId, url: sheetUrl(spreadsheetId), rows: rows.length };
}
