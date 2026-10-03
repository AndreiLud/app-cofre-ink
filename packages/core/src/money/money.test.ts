import { describe, expect, it } from "vitest";
import { formatMoney, maskMoney } from "./format.ts";
import {
	add,
	compare,
	MoneyError,
	money,
	multiply,
	roundHalfAwayFromZero,
	subtract,
	sum,
	toDecimalString,
	zero,
} from "./money.ts";
import { parseMoney, parseScaled } from "./parse.ts";

// Intl puts a narrow no break space between the symbol and the number.
const plain = (text: string) => text.replace(/ | /g, " ");

describe("money", () => {
	it("refuses anything that is not an integer of minor units", () => {
		expect(() => money(42.9)).toThrow(MoneyError);
		expect(() => money(Number.NaN)).toThrow(MoneyError);
		expect(() => money(100, "reais")).toThrow(MoneyError);
	});

	it("adds and subtracts without drifting", () => {
		let total = zero();
		for (let index = 0; index < 1000; index += 1) {
			total = add(total, money(1));
		}
		expect(total.amount).toBe(1000);
		expect(subtract(money(1000), money(1)).amount).toBe(999);
	});

	it("refuses to mix currencies", () => {
		expect(() => add(money(100, "BRL"), money(100, "USD"))).toThrow(MoneyError);
	});

	it("sums a list", () => {
		expect(sum([money(1099), money(1), money(-100)]).amount).toBe(1000);
	});

	it("rounds half away from zero", () => {
		expect(roundHalfAwayFromZero(2.5)).toBe(3);
		expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
		expect(multiply(money(1000), 0.075).amount).toBe(75);
		expect(multiply(money(-1000), 0.075).amount).toBe(-75);
	});

	it("orders amounts", () => {
		expect(compare(money(100), money(200))).toBe(-1);
		expect(compare(money(200), money(200))).toBe(0);
	});

	it("renders an exact decimal string", () => {
		expect(toDecimalString(money(4290))).toBe("42.90");
		expect(toDecimalString(money(-5))).toBe("-0.05");
		expect(toDecimalString(money(7, "JPY"))).toBe("7");
	});
});

describe("formatMoney", () => {
	it("formats for Brazil by default", () => {
		expect(plain(formatMoney(money(123456)))).toBe("R$ 1.234,56");
		expect(plain(formatMoney(money(-5)))).toBe("-R$ 0,05");
	});

	it("formats without the symbol for dense tables", () => {
		expect(formatMoney(money(123456), { withoutSymbol: true })).toBe("1.234,56");
	});

	it("follows the locale", () => {
		expect(plain(formatMoney(money(123456, "USD"), { locale: "en-US" }))).toBe("$1,234.56");
	});

	it("masks every digit in privacy mode", () => {
		expect(maskMoney(money(123456))).not.toMatch(/\d/);
	});
});

describe("parseMoney", () => {
	const cases: Array<[string, number]> = [
		["R$ 42,90", 4290],
		["42,90", 4290],
		["42.90", 4290],
		["1.234,56", 123456],
		["1,234.56", 123456],
		["1.234.567,89", 123456789],
		["1.234", 123400],
		["1234", 123400],
		["0,01", 1],
		["-50", -5000],
		["(1.234,56)", -123456],
		["1.234,56-", -123456],
		["12,3456", 1235],
		["R$ 1.000,00", 100000],
		// Part 2, E.1 of the request for 2.0.0: the minus after the symbol was not looked for.
		["R$ -50,00", -5000],
		["-R$ 50,00", -5000],
		["(R$ 50,00)", -5000],
	];

	for (const [input, expected] of cases) {
		it(`reads ${input}`, () => {
			expect(parseMoney(input).amount).toBe(expected);
		});
	}

	it("accepts a forced separator from an importer", () => {
		// Guessing reads 1.234 as a thousands group. An importer that knows the file
		// uses a period for decimals gets one real and twenty three cents instead.
		expect(parseMoney("1.234").amount).toBe(123400);
		expect(parseMoney("1.234", { decimalSeparator: "." }).amount).toBe(123);
		expect(parseMoney("1234.50", { decimalSeparator: "." }).amount).toBe(123450);
	});

	it("refuses text with no number", () => {
		expect(() => parseMoney("sem valor")).toThrow(MoneyError);
	});
});

/**
 * The same reading, to a scale that is not a currency.
 *
 * A quantity of units of a fund takes eight decimal places, and the thousands rule that
 * is right for money is wrong there: three digits after a lone separator is a third
 * decimal place and not a group, because there is no rule saying a quantity stops at two.
 * An eighth of a unit was read as a hundred and twenty five of them.
 */
describe("parseScaled", () => {
	const UNITS = 8;

	const asAQuantity: Array<[string, number]> = [
		["0.125", 12_500_000],
		["0,125", 12_500_000],
		["1.234", 123_400_000],
		["0.005", 500_000],
		["10.5", 1_050_000_000],
		["1,5", 150_000_000],
		["0.12345678", 12_345_678],
		["1.000,50", 100_050_000_000],
		["1,000.50", 100_050_000_000],
		["7", 700_000_000],
	];

	for (const [input, expected] of asAQuantity) {
		it(`reads ${input} as a quantity`, () => {
			expect(parseScaled(input, UNITS, { groupsOfThree: false })).toBe(expected);
		});
	}

	it("keeps the thousands rule for money, where it belongs", () => {
		// The same text, read the two ways, which is the whole reason the option exists.
		expect(parseScaled("1.234", 2)).toBe(123_400);
		expect(parseScaled("1.234", UNITS, { groupsOfThree: false })).toBe(123_400_000);
	});

	it("rounds what does not fit, at either scale", () => {
		expect(parseScaled("0,123456789", UNITS, { groupsOfThree: false })).toBe(12_345_679);
		expect(parseScaled("12,3456", 2)).toBe(1235);
	});

	it("refuses what it cannot read, so nothing wrong is written down", () => {
		for (const bad of ["", "   ", "cinco", "1,5,0"]) {
			expect(() => parseScaled(bad, UNITS, { groupsOfThree: false })).toThrow(MoneyError);
		}
	});
});
