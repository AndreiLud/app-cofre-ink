// From a file to records somebody can look at before saying yes.
//
// Nothing here writes anything. It reads a file, turns it into draft records, and marks
// the ones that look like records already in the database. The person decides, which is
// the only defensible way to import money: a file that silently doubles a month of
// spending is worse than no import at all.

import type { CalendarDate } from "@cofre/core";
import { readCsv } from "./csv.ts";
import { applyMapping, type ColumnMapping, guessMapping } from "./mapping.ts";
import { type Nature, natureOf } from "./nature.ts";
import { readOfx } from "./ofx.ts";
import { looksLikePdf, readPdf } from "./pdf/index.ts";
import { readQif } from "./qif.ts";
import {
	type InstallmentMark,
	type InvoiceConvention,
	installmentOf,
	type RecognisedDocument,
	recognise,
} from "./recognise/index.ts";
import { decode, tidy } from "./text.ts";
import { dayFromSerial, readXlsx } from "./xlsx.ts";

/**
 * A description from a file with columns, without the mark of a part of a plan, and the mark.
 * "Loja X Parc 2/10" in a column is the same as on a page.
 */
function withoutMark(description: string): {
	description: string;
	installment: InstallmentMark | null;
} {
	const read = installmentOf(description, { inSection: false, date: null });
	return { description: read.description, installment: read.mark };
}

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
	/** What the line is, apart from the direction. */
	nature: Nature;
	/** Which part of a plan the line is, when it carries the mark of one. */
	installment: InstallmentMark | null;
	/** The last four digits of the card a line of an invoice is under, when it says. */
	cardDigits: string | null;
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
	/**
	 * Whether the file is a card's invoice or an account's statement, whatever its format: a
	 * table of purchases written as positive numbers is an invoice, and so is the OFX of a card.
	 */
	kind: "statement" | "invoice" | "receipt" | null;
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
	/** What the person said a document is, when the reader got it wrong. */
	kind?: "statement" | "invoice";
	/** How the person said an invoice writes a purchase, when they turned the signs round. */
	convention?: InvoiceConvention;
	/** The banks of the cards written down, which a statement names when it pays one. */
	cardBanks?: readonly string[];
};

/**
 * Reads a file the person picked. It never throws: a file that turns out to be a
 * photograph, or half a download, comes back as a result with nothing in it and a line
 * saying so, which a screen can show. Refusing to read is an answer, crashing is not.
 */
export function readFile(bytes: Uint8Array, options: ReadOptions = {}): ReadFileResult {
	const format = options.format ?? guessFormat(bytes, options.fileName ?? "");

	try {
		if (format === "pdf") return fromPdf(bytes, options);
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
			kind: null,
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
function fromPdf(bytes: Uint8Array, options: ReadOptions): ReadFileResult {
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
			kind: null,
		};
	}

	// The lines with where their pieces were drawn, which the columns of a statement need.
	const document = recognise(read.lines, {
		...(options.today ? { today: options.today } : {}),
		...(options.kind ? { kind: options.kind } : {}),
		...(options.convention ? { convention: options.convention } : {}),
		...(options.cardBanks ? { cardBanks: options.cardBanks } : {}),
	});

	return {
		format: "pdf",
		records: document.entries.map((entry) => ({
			happenedOn: entry.happenedOn,
			amount: entry.amount,
			description: entry.description,
			notes: entry.notes,
			externalId: entry.externalId,
			category: null,
			nature: entry.nature,
			installment: entry.installment,
			cardDigits: entry.cardDigits,
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
		// The digits of the cards, which name the plastic, and not the bank, which names
		// every card of it. The bank is in the document.
		accountHint: document.cards.length > 0 ? document.cards.join(" ") : null,
		currency: document.currency,
		document,
		kind: document.kind === "unknown" ? null : document.kind,
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

		const { description, installment } = withoutMark(tidy(read.description));
		records.push({
			happenedOn: day,
			amount: read.amount,
			description: description === "" ? "Sem descrição" : description,
			notes: read.notes,
			externalId: read.externalId,
			category: read.category,
			// A file whose positive numbers are purchases is an invoice.
			nature: natureOf(
				description,
				mapping.positiveMeans === "asWritten" ? "statement" : "invoice",
				{
					installment: installment?.sure === true,
				},
			),
			installment,
			cardDigits: null,
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
		kind: mapping.positiveMeans === "asWritten" ? "statement" : "invoice",
	};
}

function fromOfx(text: string): ReadFileResult {
	const statement = readOfx(text);
	const records: DraftRecord[] = [];
	const skipped: SkippedRow[] = [];

	statement.entries.forEach((entry, index) => {
		const { description, installment } = withoutMark(tidy(entry.description));
		records.push({
			happenedOn: entry.happenedOn,
			amount: entry.amount,
			description: description === "" ? (entry.kind ?? "Sem descrição") : description,
			notes: entry.checkNumber === null ? null : `Documento ${entry.checkNumber}`,
			externalId: entry.externalId,
			category: null,
			nature: natureOf(description, statement.kind, { installment: installment?.sure === true }),
			installment,
			cardDigits: null,
			line: index + 1,
			confidence: 1,
			source: null,
		});
	});

	return {
		kind: statement.kind,
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
		records: file.entries.map((entry, index) => {
			const { description, installment } = withoutMark(tidy(entry.description));
			return {
				happenedOn: entry.happenedOn,
				amount: entry.amount,
				description: description === "" ? "Sem descrição" : description,
				notes: entry.memo,
				externalId: null,
				category: entry.category,
				nature: natureOf(description, "statement", { installment: installment?.sure === true }),
				installment,
				cardDigits: null,
				line: index + 1,
				confidence: 1,
				source: null,
			};
		}),
		skipped: [],
		mapping: null,
		header: [],
		accountHint: null,
		currency: null,
		document: null,
		kind: "statement",
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
			nature: natureOf(typeof row.description === "string" ? row.description : "", "statement"),
			// Our own export writes the number of a part after the name, which is ours to add again.
			installment: null,
			cardDigits: null,
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
		kind: null,
	};
}

export type ExistingRecord = {
	id: string;
	happenedOn: string;
	amount: number;
	description: string;
	externalId: string | null;
	/** A move between two accounts touching the one the file is read into. */
	moved?: boolean;
	/** What kind of record it is, so a refund finds the purchase it takes back. */
	kind?: "expense" | "income" | "transfer";
	/** The invoice it is on, so a part printed on an invoice finds the part already written. */
	invoiceMonth?: string | null;
	/** The invoice a transfer out of a card is a purchase on, for a split or another card. */
	originInvoiceMonth?: string | null;
	/** The plan it is a part of, and which part. */
	installment?: { group: string; number: number; count: number } | null;
	/** The other end of a move, the plastic, and the series that wrote it. */
	counterAccountId?: string | null;
	cardId?: string | null;
	recurrenceId?: string | null;
};

/** How far apart a line and the move it is may be dated. A slip can take two days. */
const MOVE_DAYS = 3;
/** And a payment of an invoice, which the bank may credit to the card days after it left. */
const PAYMENT_DAYS = 10;

/**
 * How a line is already here.
 *
 * "same": the bank's identifier says so, and nothing is asked. "here": a move that touches the
 * account, or the occurrence a series wrote, has its amount and its days, which is proof enough
 * to start it out. "looksSame": only the amount and the days answer, which starts out on an
 * invoice, where a purchase is rarely twice the same, and in on a statement.
 */
export type AlreadyHere = "same" | "here" | "looksSame";

export type MarkedRecord = DraftRecord & {
	/** The record already here that this one looks like, when there is one. */
	duplicateOf: string | null;
	/** True when the bank itself said it is the same entry. */
	certain: boolean;
	/** How it is already here, when it is. */
	already: AlreadyHere | null;
};

/**
 * Marks what is already here.
 *
 * An identifier from the bank is the truth when there is one. A move between two accounts
 * touching this one, going the same way, of the same amount and within days, is the same
 * money whatever the bank called it: the two statements of one Pix name it differently. So is
 * the occurrence a series wrote. Without either, the same amount within days is offered as a
 * suggestion: it was the same day and the same sixteen letters, which a series and a bank
 * never write alike, and the suggestion came ticked.
 */
export function markDuplicates(
	records: readonly DraftRecord[],
	existing: readonly ExistingRecord[],
): MarkedRecord[] {
	const byExternal = new Map<string, string>();
	for (const record of existing) {
		if (record.externalId) byExternal.set(record.externalId, record.id);
	}

	const taken = new Set<string>();
	const within = (known: ExistingRecord, record: DraftRecord, days: number) =>
		!taken.has(known.id) &&
		known.amount === record.amount &&
		Math.abs(daysApart(known.happenedOn, record.happenedOn)) <= days;

	return records.map((record) => {
		const certain = record.externalId ? byExternal.get(record.externalId) : undefined;
		if (certain !== undefined) {
			taken.add(certain);
			return { ...record, duplicateOf: certain, certain: true, already: "same" as const };
		}

		// A move already here that touches this account, by the amount and the days around it
		// and not by the words: the record that carried this statement's mark may have been
		// joined into the move. A card's invoice is paid days before the bank credits it.
		const reach =
			record.nature === "cardPayment" || record.nature === "payment" ? PAYMENT_DAYS : MOVE_DAYS;
		const proof =
			existing.find((known) => known.moved === true && within(known, record, reach)) ??
			existing.find(
				(known) =>
					known.recurrenceId !== null &&
					known.recurrenceId !== undefined &&
					within(known, record, MOVE_DAYS),
			);
		if (proof) {
			taken.add(proof.id);
			return { ...record, duplicateOf: proof.id, certain: false, already: "here" as const };
		}

		const looks = existing.find((known) => within(known, record, MOVE_DAYS));
		if (looks) {
			taken.add(looks.id);
			return { ...record, duplicateOf: looks.id, certain: false, already: "looksSame" as const };
		}

		return { ...record, duplicateOf: null, certain: false, already: null };
	});
}
function daysApart(left: string, right: string): number {
	return (Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86_400_000;
}
