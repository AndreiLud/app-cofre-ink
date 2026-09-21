// Money is always an integer number of minor units, cents for BRL.
// Nothing in this project performs arithmetic on a floating point amount.

export type CurrencyCode = string;

export type Money = {
	readonly amount: number;
	readonly currency: CurrencyCode;
};

// Currencies whose minor unit is not two digits. Everything else uses two.
const MINOR_DIGITS: Record<string, number> = {
	BRL: 2,
	USD: 2,
	EUR: 2,
	GBP: 2,
	ARS: 2,
	CLP: 0,
	JPY: 0,
	KRW: 0,
	PYG: 0,
	VND: 0,
	BHD: 3,
	KWD: 3,
	TND: 3,
};

export const DEFAULT_CURRENCY = "BRL";

export class MoneyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MoneyError";
	}
}

export function minorDigits(currency: CurrencyCode): number {
	return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

export function minorUnitsPerUnit(currency: CurrencyCode): number {
	return 10 ** minorDigits(currency);
}

/** Builds an amount from minor units. The value has to be a safe integer. */
export function money(amount: number, currency: CurrencyCode = DEFAULT_CURRENCY): Money {
	if (!Number.isSafeInteger(amount)) {
		throw new MoneyError(`amount has to be a safe integer of minor units, received ${amount}`);
	}
	if (!/^[A-Za-z]{3}$/.test(currency)) {
		throw new MoneyError(`currency has to be a three letter code, received ${currency}`);
	}
	return Object.freeze({ amount, currency: currency.toUpperCase() });
}

export function zero(currency: CurrencyCode = DEFAULT_CURRENCY): Money {
	return money(0, currency);
}

export function isMoney(value: unknown): value is Money {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<Money>;
	return Number.isSafeInteger(candidate.amount) && typeof candidate.currency === "string";
}

function assertSameCurrency(left: Money, right: Money): void {
	if (left.currency !== right.currency) {
		throw new MoneyError(
			`cannot combine ${left.currency} with ${right.currency}, convert one of them first`,
		);
	}
}

export function add(left: Money, right: Money): Money {
	assertSameCurrency(left, right);
	return money(left.amount + right.amount, left.currency);
}

export function subtract(left: Money, right: Money): Money {
	assertSameCurrency(left, right);
	return money(left.amount - right.amount, left.currency);
}

export function sum(values: readonly Money[], currency: CurrencyCode = DEFAULT_CURRENCY): Money {
	return values.reduce<Money>((total, value) => add(total, value), zero(currency));
}

export function negate(value: Money): Money {
	return money(-value.amount, value.currency);
}

export function absolute(value: Money): Money {
	return money(Math.abs(value.amount), value.currency);
}

/** Rounds half away from zero, which is what a person expects when splitting a bill. */
export function roundHalfAwayFromZero(value: number): number {
	return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Multiplies by a plain factor, for example a percentage or an exchange rate. */
export function multiply(value: Money, factor: number): Money {
	if (!Number.isFinite(factor)) {
		throw new MoneyError(`factor has to be a finite number, received ${factor}`);
	}
	return money(roundHalfAwayFromZero(value.amount * factor), value.currency);
}

export function compare(left: Money, right: Money): number {
	assertSameCurrency(left, right);
	if (left.amount === right.amount) return 0;
	return left.amount < right.amount ? -1 : 1;
}

export function equals(left: Money, right: Money): boolean {
	return left.currency === right.currency && left.amount === right.amount;
}

export function isZero(value: Money): boolean {
	return value.amount === 0;
}

export function isNegative(value: Money): boolean {
	return value.amount < 0;
}

export function isPositive(value: Money): boolean {
	return value.amount > 0;
}

/**
 * Renders the amount as a plain decimal string, with no grouping and a period as the
 * decimal separator. This is the exact form used for storage in files and for handing
 * the value to the formatter, which never sees a floating point number.
 */
export function toDecimalString(value: Money): string {
	const digits = minorDigits(value.currency);
	const sign = value.amount < 0 ? "-" : "";
	const absolute = Math.abs(value.amount)
		.toString()
		.padStart(digits + 1, "0");
	if (digits === 0) return `${sign}${absolute}`;
	const whole = absolute.slice(0, absolute.length - digits);
	const fraction = absolute.slice(absolute.length - digits);
	return `${sign}${whole}.${fraction}`;
}
