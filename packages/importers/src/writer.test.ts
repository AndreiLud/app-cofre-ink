import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { guessDelimiter, readCsv } from "./csv.ts";
import { readAmount } from "./text.ts";
import { writeAmount, writeCsv } from "./writer.ts";

describe("writing an amount", () => {
	it("writes cents the way a spreadsheet here reads them", () => {
		expect(writeAmount(-4290)).toBe("-42,90");
		expect(writeAmount(500_000)).toBe("5.000,00");
		expect(writeAmount(0)).toBe("0,00");
		expect(writeAmount(5)).toBe("0,05");
		expect(writeAmount(123_456_789)).toBe("1.234.567,89");
	});

	it("gives back the same number when read again", () => {
		fc.assert(
			fc.property(fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }), (cents) => {
				expect(readAmount(writeAmount(cents))).toBe(cents);
			}),
			{ numRuns: 300 },
		);
	});
});

describe("writing a table", () => {
	it("puts the header first and quotes what would break the row", () => {
		const text = writeCsv(
			["Data", "Descrição", "Valor"],
			[["2026-09-10", 'Mercado; "do bairro"', "-42,90"]],
			{ byteOrderMark: false },
		);

		expect(text.split("\r\n")[0]).toBe("Data;Descrição;Valor");
		expect(text).toContain('"Mercado; ""do bairro"""');
	});

	it("writes what this package can read back", () => {
		const text = writeCsv(
			["Data", "Descrição", "Valor"],
			[
				["2026-09-10", "Mercado do bairro", writeAmount(-4290)],
				["2026-09-05", "Salário", writeAmount(500_000)],
			],
			{ byteOrderMark: false },
		);

		expect(guessDelimiter(text)).toBe(";");
		const table = readCsv(text);
		expect(table.header).toEqual(["Data", "Descrição", "Valor"]);
		expect(table.rows).toHaveLength(2);
		expect(readAmount(table.rows[1]?.[2] ?? "")).toBe(500_000);
	});
});
