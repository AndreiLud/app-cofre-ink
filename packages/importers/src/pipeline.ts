// From a file to records somebody can look at before saying yes.
//
// Nothing here writes anything. It reads a file, turns it into draft records, and marks
// the ones that look like records already in the database. The person decides, which is
// the only defensible way to import money: a file that silently doubles a month of
// spending is worse than no import at all.

import type { CalendarDate } from "@cofre/core";
import { readCsv } from "./csv.ts";
import { applyMapping, type ColumnMapping, guessMapping } from "./mapping.ts";
import { readOfx } from "./ofx.ts";
import { looksLikePdf, readPdf } from "./pdf/index.ts";
import { readQif } from "./qif.ts";
import { type RecognisedDocument, recognise } from "./recognise/index.ts";
import { decode, tidy } from "./text.ts";
import { dayFromSerial, readXlsx } from "./xlsx.ts";

export type SourceFormat = "csv" | "ofx" | "qif" | "xlsx" | "json" | "pdf";

export type DraftRecord = {
	happenedOn: CalendarDate;
	/** Signed minor units. The sign is what the file said. */
	amount: number;
	description: string;
	notes: string | null;
	/** The identifier the file gave it, when it gave one. */
	externalId: string | null;
	/** What the file called the category, which may match nothing here. */
	category: string | null;
	/** The line it came from, so a problem can be pointed at. */
	line: number;
	/**
	 * How sure the reader is, from zero to one. A file with columns is read, not
	 * recognised, so it arrives certain. A document that had to be understood arrives
	 * with what it deserves, and the screen shows anything under two thirds as a record
	 * to look at before saying yes.
	 */
	confidence: number;
	/** The line of the document this came from, for a record that was recognised. */
	source: string | null;
};

export type SkippedRow = {
	line: number;
	reason:
		| "noDate"
		| "noAmount"
		| "noDescription"
		| "unreadable"
		/** A PDF that holds no text at all, which means it is a picture of one. */
		| "noText"
		/** A line of a document that held money and could not be read. */
		| "notUnderstood";
	/** The row as it was read, so the person can see what was skipped. */
	values: string[];
};

export type ReadFileResult = {
	format: SourceFormat;
	records: DraftRecord[];
	skipped: SkippedRow[];
	/** Present for the formats that have columns, so the person can correct it. */
	mapping: ColumnMapping | null;
	header: string[];
	/** What the file says the account is, when it says. */
	accountHint: string | null;
	currency: string | null;
	/** What a recognised document turned out to be, for the screen to show. */
	document: RecognisedDocument | null;
};

/** What kind of file this is, by looking at it rather than at its name. */
export function guessFormat(bytes: Uint8Array, fileName = ""): SourceFormat {
	const name = fileName.toLowerCase();
	if (looksLikePdf(bytes)) return "pdf";
	if (name.endsWith(".xlsx") || (bytes[0] === 0x50 && bytes[1] === 0x4b)) return "xlsx";

	const head = decode(bytes.subarray(0, 4096));
	const trimmed = head.trimStart();

	if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
	if (/OFXHEADER|<OFX>/i.test(head)) return "ofx";
	if (/^!Type:/im.test(head) || /^\^$/m.test(head)) return "qif";
	return "csv";
}

export type ReadOptions = {
	fileName?: string;
	/** Given when the person has corrected what the guesser decided. */
	mapping?: ColumnMapping;
	format?: SourceFormat;
	/** The day where the person is, for a document that writes a day with no year. */
	today?: CalendarDate;
};

/**
 * Reads a file the person picked. It never throws: a file that turns out to be a
 * photograph, or half a download, comes back as a result with nothing in it and a line
 * saying so, which a screen can show. Refusing to read is an answer, crashing is not.
 */
export function readFile(bytes: Uint8Array, options: ReadOptions = {}): ReadFileResult {
	const format = options.format ?? guessFormat(bytes, options.fileName ?? "");

	try {
		if (format === "pdf") return fromPdf(bytes, options.today);
		if (format === "ofx") return fromOfx(decode(bytes));
		if (format === "qif") return fromQif(decode(bytes));
		if (format === "json") return fromJson(decode(bytes));
		if (format === "xlsx") return fromRows(readXlsx(bytes).rows, options.mapping, "xlsx");

		const table = readCsv(decode(bytes));
		return fromRows([table.header, ...table.rows], options.mapping, "csv", table.header.length > 0);
	} catch {
		return {
			format,
			records: [],
			skipped: [{ line: 1, reason: "unreadable", values: [] }],
			mapping: null,
			header: [],
			accountHint: null,
			currency: null,
			document: null,
		};
	}
}

/**
 * A document, rather than a table.
 *
 * The two layers are visible here: the bytes become lines, and then the lines are
 * recognised. A file with no lines in it is a file made of pictures, and saying so is
 * the only useful thing to do about it.
 */
function fromPdf(bytes: Uint8Array, today?: CalendarDate): ReadFileResult {
	const read = readPdf(bytes);

	if (read.lines.length === 0) {
		return {
			format: "pdf",
			records: [],
			skipped: [{ line: 1, reason: "noText", values: [] }],
			mapping: null,
			header: [],
			accountHint: null,
			currency: null,
			document: null,
		};
	}

	const document = recognise(
		read.lines.map((line) => line.text),
		today ? { today } : {},
	);

	return {
		format: "pdf",
		records: document.entries.map((entry) => ({
			happenedOn: entry.happenedOn,
			amount: entry.amount,
			description: entry.description,
			notes: null,
			externalId: entry.externalId,
			category: null,
			line: entry.line,
			confidence: entry.confidence,
			source: entry.source,
		})),
		skipped: document.unread.map((line) => ({
			line: line.line,
			reason: "notUnderstood" as const,
			values: [line.text],
		})),
		mapping: null,
		header: [],
		accountHint: document.institution,
		currency: document.currency,
		document,
	};
}

function fromRows(
	all: readonly string[][],
	given: ColumnMapping | undefined,
	format: SourceFormat,
	hasHeader = true,
): ReadFileResult {
	const header = hasHeader ? (all[0] ?? []) : [];
	const rows = hasHeader ? all.slice(1) : [...all];

	const mapping = given ?? guessMapping(header, rows.slice(0, 40));
	const records: DraftRecord[] = [];
	const skipped: SkippedRow[] = [];

	rows.forEach((row, index) => {
		const line = index + (hasHeader ? 2 : 1);
		const read = applyMapping(row, mapping);

		// A spreadsheet keeps a day as a number, and a column of numbers around forty
		// five thousand is a column of days.
		const day =
			read.happenedOn ??
			(format === "xlsx" ? dayFromSerial(Number(row[mapping.fields.indexOf("happenedOn")])) : null);

		if (day === null) {
			skipped.push({ line, reason: "noDate", values: [...row] });
			return;
		}
		if (read.amount === null) {
			skipped.push({ line, reason: "noAmount", values: [...row] });
			return;
		}

		const description = tidy(read.description);
		records.push({
			happenedOn: day,
			amount: read.amount,
			description: description === "" ? "Sem descrição" : description,
			notes: read.notes,
			externalId: read.externalId,
			category: read.category,
			line,
			// A table was read rather than understood, so there is nothing to be unsure of.
			confidence: 1,
			source: null,
		});
	});

	return {
		format,
		records,
		skipped,
		mapping,
		header: [...header],
		accountHint: null,
		currency: null,
		document: null,
	};
}

function fromOfx(text: string): ReadFileResult {
	const statement = readOfx(text);
	const records: DraftRecord[] = [];
	const skipped: SkippedRow[] = [];

	statement.entries.forEach((entry, index) => {
		const description = tidy(entry.description);
		records.push({
			happenedOn: entry.happenedOn,
			amount: entry.amount,
			description: description === "" ? (entry.kind ?? "Sem descrição") : description,
			notes: entry.checkNumber === null ? null : `Documento ${entry.checkNumber}`,
			externalId: entry.externalId,
			category: null,
			line: index + 1,
			confidence: 1,
			source: null,
		});
	});

	return {
		format: "ofx",
		records,
		skipped,
		mapping: null,
		header: [],
		accountHint: statement.accountId,
		currency: statement.currency,
		document: null,
	};
}

function fromQif(text: string): ReadFileResult {
	const file = readQif(text);

	return {
		format: "qif",
		records: file.entries.map((entry, index) => ({
			happenedOn: entry.happenedOn,
			amount: entry.amount,
			description: tidy(entry.description) === "" ? "Sem descrição" : tidy(entry.description),
			notes: entry.memo,
			externalId: null,
			category: entry.category,
			line: index + 1,
			confidence: 1,
			source: null,
		})),
		skipped: [],
		mapping: null,
		header: [],
		accountHint: null,
		currency: null,
		document: null,
	};
}

/** Our own export, read back. Anything else shaped like it works just as well. */
function fromJson(text: string): ReadFileResult {
	const parsed = JSON.parse(text) as unknown;
	const list = Array.isArray(parsed)
		? parsed
		: ((parsed as { transactions?: unknown[] }).transactions ?? []);

	const records: DraftRecord[] = [];
	const skipped: SkippedRow[] = [];

	list.forEach((item, index) => {
		const row = item as Record<string, unknown>;
		const day = typeof row.happenedOn === "string" ? row.happenedOn : null;
		const amount = typeof row.amount === "number" ? row.amount : null;

		if (day === null || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
			skipped.push({ line: index + 1, reason: "noDate", values: [JSON.stringify(item)] });
			return;
		}
		if (amount === null) {
			skipped.push({ line: index + 1, reason: "noAmount", values: [JSON.stringify(item)] });
			return;
		}

		records.push({
			happenedOn: day,
			amount,
			description: typeof row.description === "string" ? row.description : "Sem descrição",
			notes: typeof row.notes === "string" ? row.notes : null,
			externalId: typeof row.externalId === "string" ? row.externalId : null,
			category: typeof row.category === "string" ? row.category : null,
			line: index + 1,
			confidence: 1,
			source: null,
		});
	});

	return {
		format: "json",
		records,
		skipped,
		mapping: null,
		header: [],
		accountHint: null,
		currency: null,
		document: null,
	};
}

export type ExistingRecord = {
	id: string;
	happenedOn: string;
	amount: number;
	description: string;
	externalId: string | null;
};

export type MarkedRecord = DraftRecord & {
	/** The record already here that this one looks like, when there is one. */
	duplicateOf: string | null;
	/** True when the bank itself said it is the same entry. */
	certain: boolean;
};

/**
 * Marks what is already here.
 *
 * An identifier from the bank is the truth when there is one. Without it, the same day,
 * the same amount and a description that starts the same way is as close as anybody can
 * get, and it is offered as a suggestion rather than applied as a fact.
 */
export function markDuplicates(
	records: readonly DraftRecord[],
	existing: readonly ExistingRecord[],
): MarkedRecord[] {
	const byExternal = new Map<string, string>();
	const byFingerprint = new Map<string, string>();

	for (const record of existing) {
		if (record.externalId) byExternal.set(record.externalId, record.id);
		byFingerprint.set(fingerprint(record), record.id);
	}

	const taken = new Set<string>();

	return records.map((record) => {
		const certain = record.externalId ? byExternal.get(record.externalId) : undefined;
		if (certain !== undefined) {
			return { ...record, duplicateOf: certain, certain: true };
		}

		const likely = byFingerprint.get(fingerprint(record));
		if (likely !== undefined && !taken.has(likely)) {
			taken.add(likely);
			return { ...record, duplicateOf: likely, certain: false };
		}

		return { ...record, duplicateOf: null, certain: false };
	});
}

function fingerprint(record: { happenedOn: string; amount: number; description: string }): string {
	const words = record.description
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "")
		.slice(0, 16);
	return `${record.happenedOn}|${record.amount}|${words}`;
}
