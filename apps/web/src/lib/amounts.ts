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
import { parseMoney, parseScaled } from "@cofre/core";
import { RuleError } from "@cofre/storage";

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
	try {
		// A lone separator marks the decimals here, always. The thousands rule belongs to
		// money, where a third digit after the separator says it was never a decimal mark; a
		// field that takes eight decimal places has no such tell, and it turned an eighth of
		// a unit into a hundred and twenty five of them.
		return parseScaled(text, digits, { groupsOfThree: false });
	} catch {
		// Its own sentence, because the one about money told somebody to write 42,90 into
		// a field that holds units of a fund.
		throw new RuleError("quantityIsANumber", `"${text}" is not a number of units`);
	}
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
 * How many parts of a division somebody gets: a whole number, and at least none.
 *
 * Not money and not a percentage, and it used to go through Number(), so a comma, a word
 * or a minus sign became NaN and the division refused it with the sentence about an
 * amount that could not be read, inside a dialog that holds no amounts. A fraction was
 * accepted in this browser and refused by a server, which is the same input saving in one
 * place and failing in the other.
 */
export function readShare(text: string): number {
	const trimmed = text.trim();
	const value = Number(trimmed.replace(",", "."));
	if (trimmed === "" || !Number.isInteger(value) || value < 0) {
		throw new RuleError("shareIsAWholeNumber", `"${text}" is not a number of parts`);
	}
	return value;
}

/**
 * A share of something, in hundredths of a percent, read as tolerantly as an amount is.
 *
 * Not money, so it does not go through the money reader, but somebody typing into a field
 * does not know that and will use whichever separator their keyboard and their language
 * put in front of them.
 */
export function readPercent(text: string): number {
	const trimmed = text.trim();
	const value = Number(trimmed.replace(",", "."));
	// Empty is not zero. It read as zero, so a blank field saved a promise to put nothing
	// aside, silently, which is a rule that does nothing under a screen that says there is
	// one.
	if (trimmed === "" || !Number.isFinite(value)) {
		throw new RuleError("percentIsANumber", `"${text}" is not a percentage`);
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
