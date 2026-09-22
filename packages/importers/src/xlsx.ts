// A spreadsheet, read far enough to get a table out of it.
//
// An xlsx file is a zip of XML. What a bank statement needs from it is one sheet, its
// cells, and the shared strings the cells point at. Formulas, styles, charts and the
// rest of the format are ignored on purpose: this reads a table, and a table is all a
// statement is.
//
// Dates are the one trap. A spreadsheet stores a day as a number of days since the end
// of 1899, with a leap year that never happened built into the count, and the cell
// only says it is a date through its format. What is done here is to hand the number
// back as a number and let the column mapping decide, because a column of numbers that
// are all around forty five thousand is a column of dates and nothing else is.

import { formatCalendarDate } from "@cofre/core";
import { unzipSync } from "fflate";

export type SheetTable = {
	name: string;
	rows: string[][];
};

const CELL = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
const VALUE = /<v>([\s\S]*?)<\/v>/;
const INLINE = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/;
const ROW = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
const SHARED = /<si>([\s\S]*?)<\/si>/g;
const TEXT = /<t[^>]*>([\s\S]*?)<\/t>/g;

function unescapeXml(value: string): string {
	return value
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_all, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, "&");
}

function readSharedStrings(xml: string): string[] {
	const strings: string[] = [];
	SHARED.lastIndex = 0;

	let item = SHARED.exec(xml);
	while (item !== null) {
		const parts: string[] = [];
		const inside = item[1] ?? "";
		TEXT.lastIndex = 0;
		let text = TEXT.exec(inside);
		while (text !== null) {
			parts.push(unescapeXml(text[1] ?? ""));
			text = TEXT.exec(inside);
		}
		strings.push(parts.join(""));
		item = SHARED.exec(xml);
	}

	return strings;
}

/** The column of a cell reference such as BC12, as a number from zero. */
function columnOf(reference: string): number {
	const letters = /^([A-Z]+)/.exec(reference.toUpperCase())?.[1] ?? "A";
	let index = 0;
	for (const letter of letters) {
		index = index * 26 + (letter.charCodeAt(0) - 64);
	}
	return index - 1;
}

/**
 * The day a spreadsheet number means.
 *
 * The count starts at the last day of 1899 and pretends 1900 was a leap year, which it
 * was not, so everything after February 1900 is one day further along than arithmetic
 * would say. Subtracting that day back is the whole correction.
 */
export function dayFromSerial(serial: number): string | null {
	if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
	const days = Math.floor(serial) - (serial > 59 ? 1 : 0);
	const moment = new Date(Date.UTC(1899, 11, 31) + days * 86_400_000);
	return formatCalendarDate(moment.getUTCFullYear(), moment.getUTCMonth() + 1, moment.getUTCDate());
}

/** Reads the first sheet of the file, or the one named. */
export function readXlsx(bytes: Uint8Array, sheetName?: string): SheetTable {
	const files = unzipSync(bytes);
	const decoder = new TextDecoder("utf-8");
	const read = (path: string) => {
		const found = files[path];
		return found ? decoder.decode(found) : null;
	};

	const shared = readSharedStrings(read("xl/sharedStrings.xml") ?? "");

	const workbook = read("xl/workbook.xml") ?? "";
	const names = [...workbook.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*\/?>/g)].map((found) =>
		unescapeXml(found[1] ?? ""),
	);

	const wanted = sheetName === undefined ? 0 : Math.max(0, names.indexOf(sheetName));

	const path = `xl/worksheets/sheet${wanted + 1}.xml`;
	const sheet = read(path) ?? read("xl/worksheets/sheet1.xml") ?? "";

	const rows: string[][] = [];
	ROW.lastIndex = 0;

	let row = ROW.exec(sheet);
	while (row !== null) {
		const cells: string[] = [];
		const inside = row[1] ?? "";
		CELL.lastIndex = 0;

		let cell = CELL.exec(inside);
		while (cell !== null) {
			const attributes = cell[1] ?? cell[3] ?? "";
			const body = cell[2] ?? "";
			const reference = /r="([A-Z]+\d+)"/.exec(attributes)?.[1] ?? "";
			const type = /t="([^"]+)"/.exec(attributes)?.[1] ?? "";

			let value = "";
			if (type === "inlineStr") {
				value = unescapeXml(INLINE.exec(body)?.[1] ?? "");
			} else {
				const raw = VALUE.exec(body)?.[1] ?? "";
				value = type === "s" ? (shared[Number(raw)] ?? "") : unescapeXml(raw);
			}

			const at = reference === "" ? cells.length : columnOf(reference);
			while (cells.length < at) cells.push("");
			cells[at] = value;

			cell = CELL.exec(inside);
		}

		if (cells.some((value) => value !== "")) rows.push(cells);
		row = ROW.exec(sheet);
	}

	return { name: names[wanted] ?? "", rows };
}
