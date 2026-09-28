// An amount is read one way and written back one way, on every screen.
//
// There were four readers. One is the shared one in the core, which decides the decimal
// mark from the last separator in what was typed, so both 1.000,50 and 1,000.50 come out
// right. The other three were written by hand on the screen that needed them, and two of
// them deleted every period before looking, which turned 1000.50 into a hundred thousand
// and 1,000.00 into one. The third read a period and nothing else, so the Brazilian
// thousands form came out as NaN and was written into the record that way.
//
// Writing one back had the same spread: three places put a comma in whatever language was
// speaking, so an English screen offered 42,90 in a field whose own hint said a period
// would do.

import type { CurrencyCode } from "@cofre/core";
import { MoneyError, parseMoney, parseScaled } from "@cofre/core";

/** What somebody typed, in cents. Throws a MoneyError, which every screen now translates. */
export function readAmount(text: string, currency?: CurrencyCode): number {
	return parseMoney(text, { currency }).amount;
}

/**
 * How many units of something, to as many decimal places as that something keeps.
 *
 * Not money, and read by the same heuristic, because somebody typing into a field does
 * not know which of the two it is and will use whichever separator they always use.
 */
export function readQuantity(text: string, digits: number): number {
	return parseScaled(text, digits);
}

/**
 * The same reading, where the screen is doing arithmetic with a field while it is typed.
 *
 * A simulator recalculates on every keystroke, so half of what it reads is half typed. A
 * sentence about an unreadable amount belongs where something is being saved, not under a
 * chart that is redrawing itself.
 */
export function readAmountOrZero(text: string, currency?: CurrencyCode): number {
	try {
		return readAmount(text, currency);
	} catch {
		return 0;
	}
}

/** The same, for a percentage. */
export function readPercentOrZero(text: string): number {
	try {
		return readPercent(text);
	} catch {
		return 0;
	}
}

/**
 * A share of something, in hundredths of a percent, read as tolerantly as an amount is.
 *
 * Not money, so it does not go through the money reader, but somebody typing into a field
 * does not know that and will use whichever separator their keyboard and their language
 * put in front of them.
 */
export function readPercent(text: string): number {
	const value = Number(text.trim().replace(",", "."));
	if (!Number.isFinite(value)) {
		throw new MoneyError(`no percentage found in "${text}"`);
	}
	return Math.round(value * 100);
}

/**
 * The same amount written back into a field, the way the language on screen writes it.
 *
 * No thousands separator: this goes into a field somebody is about to edit, and a
 * grouping mark there is one more thing to delete before typing.
 */
export function fillAmount(cents: number, language: string | undefined): string {
	const locale = language === "en" ? "en" : "pt-BR";
	return new Intl.NumberFormat(locale, {
		minimumFractionDigits: 2,
		useGrouping: false,
	}).format(cents / 100);
}
