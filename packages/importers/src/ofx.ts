// OFX, the format banks have been exporting since before most of them had a website.
//
// Two dialects share the name. The old one is SGML: tags that open and never close,
// with the value sitting between the tag and the next one. The new one is XML. The
// reader below treats the old one as the general case, because a well formed XML file
// happens to parse correctly under the same rules, and one reader is easier to trust
// than two.
//
// What makes OFX worth supporting is the identifier on every entry. A bank that sends
// the same transaction twice sends the same identifier twice, which is what lets an
// import of overlapping statements not produce two of everything.

import type { CalendarDate } from "@cofre/core";
import { readDate, tidy } from "./text.ts";

export type OfxEntry = {
	/** The identifier the bank gave it, which is what makes an import repeatable. */
	externalId: string | null;
	happenedOn: CalendarDate;
	/** Signed minor units, as the file says. */
	amount: number;
	description: string;
	/** What the bank calls it: DEBIT, CREDIT, PAYMENT and so on. */
	kind: string | null;
	checkNumber: string | null;
};

export type OfxStatement = {
	/** The account the file is about, as the bank names it. */
	accountId: string | null;
	bankId: string | null;
	currency: string | null;
	entries: OfxEntry[];
};

const TAG = /<([A-Za-z0-9._]+)>([^<\r\n]*)/g;

/** Every tag with a value, in order, which is all the shape this format needs. */
function readTags(text: string): { tag: string; value: string }[] {
	const found: { tag: string; value: string }[] = [];
	TAG.lastIndex = 0;

	let match = TAG.exec(text);
	while (match !== null) {
		const tag = (match[1] ?? "").toUpperCase();
		const value = (match[2] ?? "").trim();
		found.push({ tag, value });
		match = TAG.exec(text);
	}
	return found;
}

/** An OFX date is a day, sometimes with a time and a zone after it. Only the day counts. */
function readOfxDate(value: string): CalendarDate | null {
	const digits = value.replace(/[^\d]/g, "");
	if (digits.length < 8) return null;
	return readDate(digits.slice(0, 8), "yearFirst");
}

function readOfxAmount(value: string): number | null {
	const text = value.trim().replace(/\s/g, "");
	if (text === "") return null;

	// OFX says a period for the decimals, and some banks send a comma anyway.
	const normalised = text.includes(",") && !text.includes(".") ? text.replace(",", ".") : text;
	const amount = Number(normalised);
	if (!Number.isFinite(amount)) return null;
	return Math.round(amount * 100);
}

export function readOfx(text: string): OfxStatement {
	const tags = readTags(text);

	const statement: OfxStatement = {
		accountId: null,
		bankId: null,
		currency: null,
		entries: [],
	};

	let current: Partial<OfxEntry> | null = null;

	for (const { tag, value } of tags) {
		switch (tag) {
			case "ACCTID":
				statement.accountId ??= value;
				break;
			case "BANKID":
				statement.bankId ??= value;
				break;
			case "CURDEF":
				statement.currency ??= value.toUpperCase();
				break;
			case "STMTTRN":
				// The old dialect never closes a tag, so an entry ends where the next one
				// starts, and the last one ends with the file.
				if (current) finish(statement, current);
				current = {};
				break;
			case "FITID":
				if (current) current.externalId = value;
				break;
			case "DTPOSTED":
				if (current) {
					const day = readOfxDate(value);
					if (day) current.happenedOn = day;
				}
				break;
			case "TRNAMT":
				if (current) {
					const amount = readOfxAmount(value);
					if (amount !== null) current.amount = amount;
				}
				break;
			case "TRNTYPE":
				if (current) current.kind = value.toUpperCase();
				break;
			case "CHECKNUM":
				if (current) current.checkNumber = value;
				break;
			case "NAME":
			case "MEMO":
				if (current) {
					const text = tidy(value);
					// Both may be there. The longer one says more, and the other is kept
					// only when it adds something the first did not.
					current.description =
						current.description === undefined
							? text
							: current.description.includes(text) || text === ""
								? current.description
								: `${current.description} ${text}`;
				}
				break;
			default:
				break;
		}
	}

	if (current) finish(statement, current);
	return statement;
}

function finish(statement: OfxStatement, entry: Partial<OfxEntry>): void {
	if (entry.happenedOn === undefined || entry.amount === undefined) return;
	statement.entries.push({
		externalId: entry.externalId ?? null,
		happenedOn: entry.happenedOn,
		amount: entry.amount,
		description: entry.description ?? "",
		kind: entry.kind ?? null,
		checkNumber: entry.checkNumber ?? null,
	});
}
