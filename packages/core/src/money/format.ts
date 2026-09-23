// Formatting is the only place where an amount becomes text for a person.
// The value handed to Intl is a decimal string built from integers, never a floating
// point number, so a long history cannot drift by a cent.

import { type Money, minorDigits, toDecimalString } from "./money.ts";

export type FormatMoneyOptions = {
	locale?: string;
	/** Renders without the currency symbol, for dense tables where the column says it. */
	withoutSymbol?: boolean;
	/** Always shows the sign, useful next to a variation. */
	alwaysSign?: boolean;
};

export const DEFAULT_LOCALE = "pt-BR";

const cache = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, currency: string, withoutSymbol: boolean): Intl.NumberFormat {
	const key = `${locale}|${currency}|${withoutSymbol}`;
	const existing = cache.get(key);
	if (existing) return existing;

	const digits = minorDigits(currency);
	const created = new Intl.NumberFormat(locale, {
		style: withoutSymbol ? "decimal" : "currency",
		currency,
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	});
	cache.set(key, created);
	return created;
}

export function formatMoney(value: Money, options: FormatMoneyOptions = {}): string {
	const locale = options.locale ?? DEFAULT_LOCALE;
	const decimal = toDecimalString(value);
	const text = formatter(locale, value.currency, options.withoutSymbol === true).format(
		// Intl accepts a decimal string, which keeps the value exact.
		decimal as unknown as number,
	);
	if (options.alwaysSign === true && value.amount > 0) return `+${text}`;
	return text;
}

/** The masked form used by the privacy mode, keeping the width of a real amount. */
export function maskMoney(value: Money, options: FormatMoneyOptions = {}): string {
	const rendered = formatMoney(value, options);
	return rendered.replace(/\d/g, "•");
}
