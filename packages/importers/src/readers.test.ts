import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { guessDelimiter, readCsv, splitLine } from "./csv.ts";
import { guessMapping } from "./mapping.ts";
import { readOfx } from "./ofx.ts";
import { readQif } from "./qif.ts";
import { decode, guessDateOrder, readAmount, readDate } from "./text.ts";
import { dayFromSerial, readXlsx } from "./xlsx.ts";

describe("turning bytes into text", () => {
	it("reads what a spreadsheet wrote, mark and all", () => {
		const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Data;Valor")]);
		expect(decode(bytes)).toBe("Data;Valor");
	});

	it("reads what a mainframe wrote", () => {
		// Latin 1 for "Histórico", which is not valid UTF 8.
		const bytes = new Uint8Array([0x48, 0x69, 0x73, 0x74, 0xf3, 0x72, 0x69, 0x63, 0x6f]);
		expect(decode(bytes)).toBe("Histórico");
	});
});

describe("reading a day", () => {
	it("takes the order it is given", () => {
		expect(readDate("03/04/2026", "dayFirst")).toBe("2026-04-03");
		expect(readDate("03/04/2026", "monthFirst")).toBe("2026-03-04");
		expect(readDate("2026-04-03")).toBe("2026-04-03");
		expect(readDate("20260403")).toBe("2026-04-03");
		expect(readDate("03.04.26", "dayFirst")).toBe("2026-04-03");
	});

	it("works out the order from the file when the file says", () => {
		expect(guessDateOrder(["03/04/2026", "25/04/2026"])).toBe("dayFirst");
		expect(guessDateOrder(["04/25/2026", "04/03/2026"])).toBe("monthFirst");
		expect(guessDateOrder(["2026-04-03"])).toBe("yearFirst");
		// Nothing to go on, so the reader is told what to assume.
		expect(guessDateOrder(["03/04/2026"], "monthFirst")).toBe("monthFirst");
	});

	it("refuses a day that does not exist", () => {
		expect(readDate("31/02/2026")).toBe(null);
		expect(readDate("qualquer coisa")).toBe(null);
		expect(readDate("")).toBe(null);
	});
});

describe("reading an amount", () => {
	it("reads both ways of writing one", () => {
		expect(readAmount("1.234,56")).toBe(123_456);
		expect(readAmount("1,234.56")).toBe(123_456);
		expect(readAmount("-42,90")).toBe(-4290);
		expect(readAmount("R$ 42,90")).toBe(4290);
		expect(readAmount("(42,90)")).toBe(-4290);
	});

	it("reads the letter some banks put after it", () => {
		expect(readAmount("42,90 D")).toBe(-4290);
		expect(readAmount("42,90 C")).toBe(4290);
	});

	it("gives nothing back for what is not a number", () => {
		expect(readAmount("")).toBe(null);
		expect(readAmount("saldo")).toBe(null);
	});
});

describe("delimited text", () => {
	it("finds the character that makes a table", () => {
		const commas = "data,descricao,valor\n01/09/2026,Mercado,-42,90";
		const semicolons = "data;descricao;valor\n01/09/2026;Mercado, do bairro;-42,90";

		expect(guessDelimiter(commas)).toBe(",");
		expect(guessDelimiter(semicolons)).toBe(";");
	});

	it("keeps what is inside quotes together", () => {
		expect(splitLine('01/09/2026,"Mercado, do bairro",-42.90', ",")).toEqual([
			"01/09/2026",
			"Mercado, do bairro",
			"-42.90",
		]);
		expect(splitLine('a,"diz ""oi""",b', ",")).toEqual(["a", 'diz "oi"', "b"]);
	});

	it("skips what the bank wrote above the table", () => {
		const text = [
			"Banco Ficticio",
			"Extrato da conta 12345",
			"",
			"Data;Historico;Valor",
			"01/09/2026;Mercado;-42,90",
			"02/09/2026;Salario;5000,00",
		].join("\n");

		const table = readCsv(text);
		expect(table.header).toEqual(["Data", "Historico", "Valor"]);
		expect(table.rows).toHaveLength(2);
		expect(table.preamble.length).toBeGreaterThan(0);
	});

	it("reads a file with no header at all", () => {
		const table = readCsv("01/09/2026;Mercado;-42,90\n02/09/2026;Padaria;-10,00");
		expect(table.header).toEqual([]);
		expect(table.rows).toHaveLength(2);
	});
});

describe("guessing what each column is", () => {
	it("reads the header when there is one", () => {
		const mapping = guessMapping(
			["Data", "Histórico", "Valor", "Saldo"],
			[["01/09/2026", "Mercado", "-42,90", "1.000,00"]],
		);
		expect(mapping.fields[0]).toBe("happenedOn");
		expect(mapping.fields[1]).toBe("description");
		expect(mapping.fields[2]).toBe("amount");
		// Two columns of numbers: the second one is not the amount again.
		expect(mapping.fields[3]).toBe("ignore");
	});

	it("reads the values when there is no header", () => {
		const mapping = guessMapping(
			[],
			[
				["01/09/2026", "Mercado do bairro", "-42,90"],
				["02/09/2026", "Padaria", "-10,00"],
			],
		);
		expect(mapping.fields).toEqual(["happenedOn", "description", "amount"]);
	});

	it("understands two columns for the two directions", () => {
		const mapping = guessMapping(
			["Data", "Descrição", "Débito", "Crédito"],
			[["01/09/2026", "Mercado", "42,90", ""]],
		);
		expect(mapping.fields[2]).toBe("debit");
		expect(mapping.fields[3]).toBe("credit");
	});
});

describe("OFX", () => {
	const statement = `OFXHEADER:100
DATA:OFXSGML

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>001<ACCTID>12345-6</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260910120000[-3:BRT]<TRNAMT>-42.90<FITID>abc123<MEMO>MERCADO DO BAIRRO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260905<TRNAMT>5000.00<FITID>def456<NAME>SALARIO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

	it("reads the old dialect, which never closes a tag", () => {
		const read = readOfx(statement);

		expect(read.accountId).toBe("12345-6");
		expect(read.currency).toBe("BRL");
		expect(read.entries).toHaveLength(2);

		expect(read.entries[0]).toMatchObject({
			externalId: "abc123",
			happenedOn: "2026-09-10",
			amount: -4290,
			description: "MERCADO DO BAIRRO",
		});
		expect(read.entries[1]).toMatchObject({
			externalId: "def456",
			happenedOn: "2026-09-05",
			amount: 500_000,
		});
	});

	it("reads the new dialect, which is ordinary XML", () => {
		const xml = `<?xml version="1.0"?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
			<CURDEF>USD</CURDEF>
			<BANKTRANLIST>
				<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260910</DTPOSTED><TRNAMT>-10.00</TRNAMT><FITID>x1</FITID><NAME>COFFEE</NAME></STMTTRN>
			</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

		const read = readOfx(xml);
		expect(read.currency).toBe("USD");
		expect(read.entries).toHaveLength(1);
		expect(read.entries[0]?.amount).toBe(-1000);
		expect(read.entries[0]?.description).toBe("COFFEE");
	});
});

describe("QIF", () => {
	it("reads an entry at a time", () => {
		const file = readQif(
			[
				"!Type:Bank",
				"D10/09/2026",
				"T-42,90",
				"PMercado do bairro",
				"MComprei fiado",
				"LAlimentação",
				"^",
				"D05/09/2026",
				"T5000,00",
				"PSalario",
				"^",
			].join("\n"),
		);

		expect(file.kind).toBe("Bank");
		expect(file.entries).toHaveLength(2);
		expect(file.entries[0]).toMatchObject({
			happenedOn: "2026-09-10",
			amount: -4290,
			description: "Mercado do bairro",
			memo: "Comprei fiado",
			category: "Alimentação",
		});
		expect(file.entries[1]?.amount).toBe(500_000);
	});
});

describe("a spreadsheet", () => {
	it("turns a day back from the number a spreadsheet keeps", () => {
		// The two anchors everybody checks against: the first day of the count, and the
		// day the rest of computing counts from.
		expect(dayFromSerial(1)).toBe("1900-01-01");
		expect(dayFromSerial(25_569)).toBe("1970-01-01");
		expect(dayFromSerial(45_905)).toBe("2025-09-05");
		expect(dayFromSerial(0)).toBe(null);
	});

	it("reads the first sheet of a file", () => {
		const sheet = `<?xml version="1.0"?><worksheet><sheetData>
			<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
			<row r="2"><c r="A2"><v>46000</v></c><c r="B2" t="inlineStr"><is><t>Mercado</t></is></c><c r="C2"><v>-42.9</v></c></row>
		</sheetData></worksheet>`;

		const shared = `<?xml version="1.0"?><sst><si><t>Data</t></si><si><t>Descrição</t></si><si><t>Valor</t></si></sst>`;
		const workbook = `<?xml version="1.0"?><workbook><sheets><sheet name="Extrato" sheetId="1" r:id="rId1"/></sheets></workbook>`;

		const bytes = zipSync({
			"xl/workbook.xml": strToU8(workbook),
			"xl/sharedStrings.xml": strToU8(shared),
			"xl/worksheets/sheet1.xml": strToU8(sheet),
		});

		const table = readXlsx(bytes);
		expect(table.name).toBe("Extrato");
		expect(table.rows[0]).toEqual(["Data", "Descrição", "Valor"]);
		expect(table.rows[1]).toEqual(["46000", "Mercado", "-42.9"]);
	});
});
