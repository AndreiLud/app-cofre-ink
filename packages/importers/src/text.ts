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
 * An amount in minor units, signed, or nothing.
 *
 * Banks write a withdrawal as a negative number, as a positive number in a column
 * called debit, or with a letter beside it. The sign here is only what the text says;
 * which column it came from is decided by whoever maps the columns.
 */
export function readAmount(value: string, currency = "BRL"): number | null {
	const text = value.trim();
	if (text === "") return null;

	// A trailing D or C is how some Brazilian exports say debit and credit.
	const letter = /([dc])$/i.exec(text);
	const withoutLetter = letter ? text.slice(0, -1).trim() : text;

	try {
		const money = parseMoney(withoutLetter, { currency });
		if (letter && letter[1]?.toLowerCase() === "d") return -Math.abs(money.amount);
		if (letter && letter[1]?.toLowerCase() === "c") return Math.abs(money.amount);
		return money.amount;
	} catch {
		return null;
	}
}

/** Collapses the spacing banks leave behind, without touching what the words say. */
export function tidy(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}
