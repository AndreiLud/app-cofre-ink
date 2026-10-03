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
/**
 * The symbol written in front of an amount. A sign can sit on either side of it, "-R$ 50,00"
 * and "R$ -50,00", and the second was read as fifty reais coming in: the minus was not at the
 * start, and nothing looked past the symbol for it.
 */
const CURRENCY_IN_FRONT = /^(?:R\$|US\$|BRL|USD|EUR|€|\$)\s*/i;

function detectSign(text: string): { sign: number; rest: string } {
	let rest = text.trim();
	let sign = 1;

	const wrapped = rest.match(NEGATIVE_WRAPPED);
	if (wrapped?.[1] !== undefined) {
		sign = -1;
		rest = wrapped[1].trim();
	}
	let signed = false;
	if (rest.startsWith("-") || rest.startsWith("+")) {
		if (rest.startsWith("-")) sign = -sign;
		rest = rest.slice(1).trim();
		signed = true;
	}
	rest = rest.replace(CURRENCY_IN_FRONT, "");
	if (!signed && (rest.startsWith("-") || rest.startsWith("+"))) {
		if (rest.startsWith("-")) sign = -sign;
		rest = rest.slice(1);
	}
	if (rest.endsWith("-")) {
		sign = -sign;
		rest = rest.slice(0, -1);
	}
	return { sign, rest };
}

function guessDecimalSeparator(
	text: string,
	digits: number,
	groupsOfThree: boolean,
): "," | "." | null {
	const lastComma = text.lastIndexOf(",");
	const lastPeriod = text.lastIndexOf(".");

	if (lastComma === -1 && lastPeriod === -1) return null;
	if (lastComma >= 0 && lastPeriod >= 0) return lastComma > lastPeriod ? "," : ".";

	const separator = lastComma >= 0 ? "," : ".";
	const position = Math.max(lastComma, lastPeriod);
	const following = text.length - position - 1;
	const occurrences = text.split(separator).length - 1;

	// Three digits after a single separator is a thousands group, such as 1.234. True of
	// an amount of money, where two decimal places are the rule and a third digit says
	// the separator was never a decimal mark at all. Not true of a field that takes
	// eight: there a lone separator is somebody writing a fraction.
	if (groupsOfThree && following === 3 && (occurrences > 1 || digits !== 3)) return null;
	return separator;
}

/**
 * The same reading, to a number of decimal places that is not a currency.
 *
 * A quantity of units of a fund is not money and is still typed by a person with whatever
 * separator their keyboard puts in front of them, so it deserves the same heuristic rather
 * than a second one written by hand on the screen that needed it.
 */
export function parseScaled(
	input: string,
	digits: number,
	options: {
		decimalSeparator?: "," | ".";
		/**
		 * Whether a lone separator with three digits after it is a thousands group.
		 *
		 * True for money, where it is: nobody writes a third decimal place on an amount,
		 * so 1.234 is a thousand and not one and a bit. False for a quantity, where the
		 * field takes eight decimal places and 0.125 of a unit is an ordinary thing to
		 * own. It was read as a hundred and twenty five units.
		 */
		groupsOfThree?: boolean;
	} = {},
): number {
	const groupsOfThree = options.groupsOfThree !== false;
	const { sign, rest } = detectSign(String(input));
	const cleaned = rest.replace(/[^\d.,]/g, "");
	if (cleaned === "") {
		throw new MoneyError(`no number found in "${input}"`);
	}

	const separator =
		options.decimalSeparator ?? guessDecimalSeparator(cleaned, digits, groupsOfThree);
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

	return sign * amount;
}

export function parseMoney(input: string, options: ParseMoneyOptions = {}): Money {
	const currency = options.currency ?? DEFAULT_CURRENCY;
	return money(
		parseScaled(input, minorDigits(currency), { decimalSeparator: options.decimalSeparator }),
		currency,
	);
}
