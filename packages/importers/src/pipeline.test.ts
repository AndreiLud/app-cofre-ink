import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildPdf, drawLines } from "./pdf/buildPdf.ts";
import { guessFormat, markDuplicates, readFile } from "./pipeline.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

const statement = [
	"Data;Histórico;Valor",
	"10/09/2026;Mercado do bairro;-42,90",
	"05/09/2026;Salário;5.000,00",
	"11/09/2026;;-10,00",
	"sem data;Nada;-1,00",
].join("\n");

describe("working out what a file is", () => {
	it("looks at the file rather than at its name", () => {
		expect(guessFormat(bytes("Data;Valor\n01/09/2026;10"))).toBe("csv");
		expect(guessFormat(bytes("OFXHEADER:100\n<OFX>"))).toBe("ofx");
		expect(guessFormat(bytes("!Type:Bank\nD10/09/2026\n^"))).toBe("qif");
		expect(guessFormat(bytes('{"transactions": []}'))).toBe("json");
		// A zip begins with the two letters of the man who wrote the format.
		expect(guessFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe("xlsx");
	});
});

describe("reading a statement", () => {
	it("turns the lines into records, and says what it could not read", () => {
		const result = readFile(bytes(statement), { fileName: "extrato.csv" });

		expect(result.format).toBe("csv");
		expect(result.records).toHaveLength(3);
		expect(result.skipped).toHaveLength(1);
		expect(result.skipped[0]?.reason).toBe("noDate");

		expect(result.records[0]).toMatchObject({
			happenedOn: "2026-09-10",
			amount: -4290,
			description: "Mercado do bairro",
			line: 2,
		});
		expect(result.records[1]?.amount).toBe(500_000);
		// A line with no description still counts, and says so.
		expect(result.records[2]?.description).toBe("Sem descrição");
	});

	it("keeps the identifier the bank gave each entry", () => {
		const ofx = `OFXHEADER:100
<OFX><BANKTRANLIST>
<STMTTRN><DTPOSTED>20260910<TRNAMT>-42.90<FITID>abc<MEMO>MERCADO</STMTTRN>
</BANKTRANLIST></OFX>`;

		const result = readFile(bytes(ofx));
		expect(result.format).toBe("ofx");
		expect(result.records[0]?.externalId).toBe("abc");
	});

	it("reads back what this application exported", () => {
		const exported = JSON.stringify({
			transactions: [
				{ happenedOn: "2026-09-10", amount: -4290, description: "Mercado", externalId: "x" },
				{ happenedOn: "nao é um dia", amount: -1, description: "Errado" },
			],
		});

		const result = readFile(bytes(exported));
		expect(result.format).toBe("json");
		expect(result.records).toHaveLength(1);
		expect(result.skipped).toHaveLength(1);
	});

	it("says it could not read a file instead of falling over", () => {
		const result = readFile(bytes("{ isto nao e json"));
		expect(result.records).toEqual([]);
		expect(result.skipped[0]?.reason).toBe("unreadable");
	});
});

describe("a document, rather than a table", () => {
	const statement = buildPdf({
		content: drawLines([
			"Banco Inter",
			"Extrato da conta corrente",
			"Periodo de 01/09/2026 a 30/09/2026",
			"01/09/2026 Saldo anterior 1.000,00",
			"05/09/2026 Salario 5.000,00 6.000,00",
			"10/09/2026 Mercado do bairro 42,90 5.957,10",
		]),
		compress: true,
	});

	it("recognises a statement and says what it believes each line says", () => {
		const result = readFile(statement, { fileName: "extrato.pdf" });

		expect(result.format).toBe("pdf");
		expect(result.document?.kind).toBe("statement");
		expect(result.document?.institution).toBe("Inter");
		expect(result.accountHint).toBe("Inter");

		expect(result.records.map((record) => record.amount)).toEqual([500_000, -4290]);
		expect(result.records.every((record) => record.confidence > 0.9)).toBe(true);
		expect(result.records[1]?.source).toContain("Mercado do bairro");
	});

	it("marks what is already here, the same as any other file", () => {
		const result = readFile(statement);
		const marked = markDuplicates(result.records, [
			{
				id: "one",
				happenedOn: "2026-09-10",
				amount: -4290,
				description: "Mercado do bairro",
				externalId: null,
			},
		]);

		expect(marked[1]?.duplicateOf).toBe("one");
	});

	it("says plainly when a PDF is a picture instead of a document", () => {
		const picture = buildPdf({ content: "q 100 0 0 100 50 700 cm /Im0 Do Q\n" });
		const result = readFile(picture, { fileName: "foto.pdf" });

		expect(result.records).toEqual([]);
		expect(result.skipped[0]?.reason).toBe("noText");
	});

	it("knows a PDF by its first bytes, whatever it is called", () => {
		expect(guessFormat(statement, "qualquer.txt")).toBe("pdf");
	});
});

describe("marking what is already here", () => {
	const existing = [
		{
			id: "one",
			happenedOn: "2026-09-10",
			amount: -4290,
			description: "Mercado do bairro",
			externalId: "abc",
		},
	];

	it("is certain when the bank says it is the same entry", () => {
		const marked = markDuplicates(
			[
				{
					happenedOn: "2026-09-10",
					amount: -4290,
					description: "outro texto",
					notes: null,
					externalId: "abc",
					category: null,
					line: 1,
					confidence: 1,
					source: null,
				},
			],
			existing,
		);

		expect(marked[0]?.duplicateOf).toBe("one");
		expect(marked[0]?.certain).toBe(true);
	});

	it("suggests, without being certain, when only the shape matches", () => {
		const marked = markDuplicates(
			[
				{
					happenedOn: "2026-09-10",
					amount: -4290,
					description: "Mercado do bairro",
					notes: null,
					externalId: null,
					category: null,
					line: 1,
					confidence: 1,
					source: null,
				},
			],
			existing,
		);

		expect(marked[0]?.duplicateOf).toBe("one");
		expect(marked[0]?.certain).toBe(false);
	});

	it("never points two records at the same one", () => {
		const twice = Array.from({ length: 2 }, (_unused, index) => ({
			happenedOn: "2026-09-10",
			amount: -4290,
			description: "Mercado do bairro",
			notes: null,
			externalId: null,
			category: null,
			line: index + 1,
			confidence: 1,
			source: null,
		}));

		const marked = markDuplicates(twice, existing);
		expect(marked[0]?.duplicateOf).toBe("one");
		expect(marked[1]?.duplicateOf).toBe(null);
	});

	it("leaves alone what is not here", () => {
		const marked = markDuplicates(
			[
				{
					happenedOn: "2026-09-11",
					amount: -1000,
					description: "Padaria",
					notes: null,
					externalId: null,
					category: null,
					line: 1,
					confidence: 1,
					source: null,
				},
			],
			existing,
		);
		expect(marked[0]?.duplicateOf).toBe(null);
	});
});

describe("whatever the file holds", () => {
	it("never throws, and never invents a record", () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 400 }), (text) => {
				const result = readFile(bytes(text));
				expect(Array.isArray(result.records)).toBe(true);
				expect(
					result.records.every(
						(record) =>
							/^\d{4}-\d{2}-\d{2}$/.test(record.happenedOn) &&
							Number.isSafeInteger(record.amount) &&
							record.description.length > 0,
					),
				).toBe(true);
			}),
			{ numRuns: 200 },
		);
	});
});
