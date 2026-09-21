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
import { parseMoney } from "./parse.ts";

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
