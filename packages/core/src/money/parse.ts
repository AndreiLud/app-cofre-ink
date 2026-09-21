// Turns text written by a person, or exported by a bank, into minor units.
// Brazilian files use a comma for decimals and a period for thousands, foreign files
// use the opposite, and some exports mix both in the same document. The heuristic
// below reads the last separator, which is the one that decides.

import {
	type CurrencyCode,
	DEFAULT_CURRENCY,
	type Money,
	MoneyError,
	minorDigits,
	money,
} from "./money.ts";

export type ParseMoneyOptions = {
	currency?: CurrencyCode;
	/** Forces the separator instead of guessing, for importers that know the format. */
	decimalSeparator?: "," | ".";
};

const NEGATIVE_WRAPPED = /^\((.*)\)$/;

function detectSign(text: string): { sign: number; rest: string } {
	let rest = text.trim();
	let sign = 1;

	const wrapped = rest.match(NEGATIVE_WRAPPED);
	if (wrapped?.[1] !== undefined) {
		sign = -1;
		rest = wrapped[1];
	}
	if (rest.startsWith("-") || rest.startsWith("+")) {
		if (rest.startsWith("-")) sign = -sign;
		rest = rest.slice(1);
	}
	if (rest.endsWith("-")) {
		sign = -sign;
		rest = rest.slice(0, -1);
	}
	return { sign, rest };
}

function guessDecimalSeparator(text: string, digits: number): "," | "." | null {
	const lastComma = text.lastIndexOf(",");
	const lastPeriod = text.lastIndexOf(".");

	if (lastComma === -1 && lastPeriod === -1) return null;
	if (lastComma >= 0 && lastPeriod >= 0) return lastComma > lastPeriod ? "," : ".";

	const separator = lastComma >= 0 ? "," : ".";
	const position = Math.max(lastComma, lastPeriod);
	const following = text.length - position - 1;
	const occurrences = text.split(separator).length - 1;

	// Three digits after a single separator is a thousands group, such as 1.234.
	if (following === 3 && (occurrences > 1 || digits !== 3)) return null;
	return separator;
}

export function parseMoney(input: string, options: ParseMoneyOptions = {}): Money {
	const currency = options.currency ?? DEFAULT_CURRENCY;
	const digits = minorDigits(currency);

	const { sign, rest } = detectSign(String(input));
	const cleaned = rest.replace(/[^\d.,]/g, "");
	if (cleaned === "") {
		throw new MoneyError(`no number found in "${input}"`);
	}

	const separator = options.decimalSeparator ?? guessDecimalSeparator(cleaned, digits);
	const other = separator === "," ? "." : ",";
	const withoutGroups =
		separator === null ? cleaned.replace(/[.,]/g, "") : cleaned.split(other).join("");

	let whole = withoutGroups;
	let fraction = "";
	if (separator !== null) {
		const parts = withoutGroups.split(separator);
		if (parts.length > 2) {
			throw new MoneyError(`"${input}" has more than one decimal separator`);
		}
		whole = parts[0] ?? "";
		fraction = parts[1] ?? "";
	}

	if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) {
		throw new MoneyError(`"${input}" is not a number`);
	}

	const padded = fraction.padEnd(digits, "0");
	const kept = padded.slice(0, digits);
	const next = padded.charAt(digits);

	let amount = Number(whole || "0") * 10 ** digits + Number(kept || "0");
	if (next !== "" && Number(next) >= 5) amount += 1;

	return money(sign * amount, currency);
}
