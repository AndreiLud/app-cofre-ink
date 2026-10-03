// Reading what a bank exported.
//
// Files from banks arrive in whatever the system that wrote them felt like: Latin 1
// from a mainframe, UTF 8 with a byte order mark from a spreadsheet, dates in three
// orders, amounts with a comma or a period. This file turns bytes into text and text
// into the two values everything else needs, a day and an amount.

import { type CalendarDate, formatCalendarDate, parseMoney } from "@cofre/core";

/**
 * Bytes to text. A byte order mark decides, and otherwise the file is read as UTF 8
 * and checked: if it comes back with replacement characters, it was never UTF 8, and
 * Latin 1 is what banks in Brazil actually send.
 */
export function decode(bytes: Uint8Array): string {
	if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
		return new TextDecoder("utf-8").decode(bytes.subarray(3));
	}

	const utf8 = new TextDecoder("utf-8").decode(bytes);
	if (!utf8.includes("�")) return utf8;

	return new TextDecoder("windows-1252").decode(bytes);
}

export type DateOrder = "dayFirst" | "monthFirst" | "yearFirst";

const SEPARATED = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{2,4})$/;
const PLAIN = /^(\d{4})(\d{2})(\d{2})$/;

/**
 * Which way round the numbers go.
 *
 * A file where some day is above twelve answers the question by itself. When none is,
 * the answer is the one the person reading it uses, which is why the default is given
 * rather than assumed.
 */
export function guessDateOrder(
	samples: readonly string[],
	fallback: DateOrder = "dayFirst",
): DateOrder {
	let firstOverTwelve = false;
	let secondOverTwelve = false;

	for (const sample of samples) {
		const found = SEPARATED.exec(sample.trim());
		if (!found) continue;
		const first = Number(found[1]);
		const second = Number(found[2]);
		if (String(found[1]).length === 4) return "yearFirst";
		if (first > 12) firstOverTwelve = true;
		if (second > 12) secondOverTwelve = true;
	}

	if (firstOverTwelve && !secondOverTwelve) return "dayFirst";
	if (secondOverTwelve && !firstOverTwelve) return "monthFirst";
	return fallback;
}

/** A day, or nothing. Never a guess that changes with the time zone of the reader. */
export function readDate(value: string, order: DateOrder = "dayFirst"): CalendarDate | null {
	const text = value.trim();
	if (text === "") return null;

	const plain = PLAIN.exec(text);
	if (plain) {
		return build(Number(plain[1]), Number(plain[2]), Number(plain[3]));
	}

	const found = SEPARATED.exec(text);
	if (!found) return null;

	const first = Number(found[1]);
	const second = Number(found[2]);
	const third = Number(found[3]);

	if (String(found[1]).length === 4 || order === "yearFirst") {
		return build(first, second, third);
	}

	const year = third < 100 ? 2000 + third : third;
	return order === "monthFirst" ? build(year, first, second) : build(year, second, first);
}

function build(year: number, month: number, day: number): CalendarDate | null {
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
	if (day > last) return null;
	return formatCalendarDate(year, month, day);
}

/**
 * How the direction of an amount was written, which is not the same as which way it went.
 *
 * A minus against the number is the bank saying so. A minus with a space after it may be
 * the dash that separates two words, " - ", so it counts and is not trusted. Parentheses, a
 * minus after the number and a letter are the shapes the exports here use.
 */
export type WrittenSign =
	| "none"
	| "minus"
	| "spacedMinus"
	| "plus"
	| "parentheses"
	| "trailingMinus"
	| "letter";

export type ReadAmount = {
	/** Signed minor units, by what the text says. */
	value: number;
	sign: WrittenSign;
};

/** The minus a keyboard writes, the one a typesetter writes, and the two dashes that pass for it. */
const MINUS = "[-\\u2212\\u2013\\u2014]";
const ANY_MINUS = new RegExp(`^${MINUS}$`);
const CURRENCY_MARK = "(?:R\\$|US\\$|BRL|USD|EUR|\\u20ac|\\$)";
const TRAILING_MARK = new RegExp(`\\s*${CURRENCY_MARK}$`, "i");
/** What stands in front of the digits: a sign, a symbol, either order, and the spaces between. */
const LEADING = new RegExp(
	`^(${MINUS}|\\+)?(\\s*)(${CURRENCY_MARK})?(\\s*)(${MINUS}|\\+)?(\\s*)(?=\\d)`,
	"i",
);

/**
 * An amount in minor units with how its sign was written, or nothing.
 *
 * Banks write a withdrawal as a negative number, as a positive number in a column
 * called debit, or with a letter beside it. The sign here is only what the text says;
 * which column it came from is decided by whoever maps the columns, and what a positive
 * number means is decided by what kind of document it is.
 *
 * Read once, here. The recogniser had a second reading of its own, and the two disagreed:
 * it lost the minus at the end, the plus, the typeset minus, the minus in front of the
 * symbol, and a lowercase letter.
 */
export function readAmount(value: string, currency = "BRL"): ReadAmount | null {
	let text = value.trim();
	if (text === "") return null;

	let sign: WrittenSign = "none";
	let negative = false;

	// A trailing D or C is how some Brazilian exports say debit and credit.
	const lettered = /^(.*[\d)\-−])\s?([dc])$/i.exec(text);
	if (lettered?.[1] !== undefined && lettered[2] !== undefined) {
		text = lettered[1].trim();
		sign = "letter";
		negative = lettered[2].toLowerCase() === "d";
	}

	const wrapped = /^\((.*)\)$/.exec(text);
	if (wrapped?.[1] !== undefined) {
		text = wrapped[1].trim();
		if (sign === "none") {
			sign = "parentheses";
			negative = true;
		}
	}

	const last = text.slice(-1);
	if (ANY_MINUS.test(last) && /\d/.test(text.slice(-2, -1))) {
		text = text.slice(0, -1).trim();
		if (sign === "none") {
			sign = "trailingMinus";
			negative = true;
		}
	}

	// A symbol after the number, "42,90 BRL", says nothing about the direction.
	text = text.replace(TRAILING_MARK, "");

	const lead = LEADING.exec(text);
	if (!lead) return null;
	const [whole, before, gapBefore, , , after, gapAfter] = lead;
	const mark = before ?? after;
	const gap = before === undefined ? (gapAfter ?? "") : (gapBefore ?? "");
	if (mark !== undefined && sign === "none") {
		if (mark === "+") {
			sign = "plus";
		} else if (gap === "") {
			sign = "minus";
			negative = true;
		} else if (mark === "-") {
			// A typeset minus or a dash counts only against the number or the symbol: with a
			// space after it, it is the dash between two words, and the amount has no sign.
			// The minus of a keyboard with a space after it counts, and is not trusted.
			sign = "spacedMinus";
			negative = true;
		}
	}

	const digits = text.slice(whole.length);
	if (!/^\d[\d.,]*$/.test(digits)) return null;

	try {
		const amount = Math.abs(parseMoney(digits, { currency }).amount);
		return { value: negative ? -amount : amount, sign };
	} catch {
		return null;
	}
}

/** Just the signed value, for the places that read a column and not a document. */
export function readAmountValue(value: string, currency = "BRL"): number | null {
	return readAmount(value, currency)?.value ?? null;
}

/** Collapses the spacing banks leave behind, without touching what the words say. */
export function tidy(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}
