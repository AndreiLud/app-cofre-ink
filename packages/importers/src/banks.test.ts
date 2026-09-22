// The shapes banks in Brazil actually export.
//
// None of these is a real person's statement. Each one is the layout of a real export,
// taken from what the banks and the people who write importers for them describe in
// public, and filled with invented money:
//
//   1. Nubank card invoice, `date,title,amount`, and the newer one with a category
//      column. The day is written the ISO way, the decimal is a point, and a purchase
//      is a positive number, which is the one thing about this file that surprises
//      everybody who imports it for the first time.
//   2. Nubank account, `Data,Valor,Identificador,Descrição`, day first and signed.
//   3. OFX as the banks here send it: SGML with tags that never close, a header that
//      claims US ASCII while the bytes are Windows 1252, and a FITID on every entry.
//   4. The layout every bank with a mainframe behind it produces: semicolons, day
//      first, a comma for the decimal, and two columns for the two directions.
//
// What is checked is the whole path, from bytes to records, because that is where the
// mistakes live: an encoding read as the wrong one, a column nobody claimed, a
// thousands separator read as a decimal, and above all a sign the wrong way round.

import { describe, expect, it } from "vitest";
import { readFile } from "./pipeline.ts";

function utf8(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

/** Windows 1252, which is what an OFX header claiming US ASCII is usually made of. */
function latin1(text: string): Uint8Array {
	const bytes = new Uint8Array(text.length);
	for (let index = 0; index < text.length; index += 1) {
		bytes[index] = text.charCodeAt(index) & 0xff;
	}
	return bytes;
}

describe("a Nubank card invoice", () => {
	const invoice = [
		"date,title,amount",
		"2026-09-03,Padaria Sao Jorge,18.50",
		"2026-09-05,Mercado Livre,249.90",
		"2026-09-08,Spotify,21.90",
		"2026-09-14,Posto Ipiranga,180.00",
	].join("\n");

	it("reads the day, the words and the money", () => {
		const read = readFile(utf8(invoice), { fileName: "nubank-2026-09.csv" });

		expect(read.format).toBe("csv");
		expect(read.records).toHaveLength(4);
		expect(read.records[0]).toMatchObject({
			happenedOn: "2026-09-03",
			description: "Padaria Sao Jorge",
		});
		expect(read.records[1]?.amount).toBe(-24_990);
	});

	it("reads a purchase as money leaving, although the file writes it as positive", () => {
		const read = readFile(utf8(invoice), { fileName: "nubank.csv" });

		// Every line of a card invoice is a purchase. A file where nothing is negative
		// is a file where the sign is not carrying the direction.
		expect(read.records.every((record) => record.amount < 0)).toBe(true);
		expect(read.mapping?.positiveMeans).toBe("expense");
	});

	it("reads the newer export, which puts a category between the two", () => {
		const withCategory = [
			"date,category,title,amount",
			"2026-09-13,serviços,Example Storage,7.99",
			"2026-09-15,transporte,Uber,32.40",
			"2026-09-16,alimentação,iFood,54.70",
			"2026-09-18,transporte,99 Pop,17.30",
		].join("\n");

		const read = readFile(utf8(withCategory), { fileName: "nubank.csv" });

		expect(read.records).toHaveLength(4);
		expect(read.records[0]).toMatchObject({
			happenedOn: "2026-09-13",
			description: "Example Storage",
			category: "serviços",
			amount: -799,
		});
	});

	it("will not decide the direction from two lines, because two is a coincidence", () => {
		const two = ["date,title,amount", "2026-09-13,Padaria,7.99", "2026-09-15,Uber,32.40"].join(
			"\n",
		);

		const read = readFile(utf8(two), { fileName: "curto.csv" });
		expect(read.mapping?.positiveMeans).toBe("asWritten");
	});
});

describe("a Nubank account statement", () => {
	const statement = [
		"Data,Valor,Identificador,Descrição",
		"03/09/2026,-150.50,67d1e5f2-0001,Transferência enviada pelo Pix - JOAO",
		"05/09/2026,6120.00,67d1e5f2-0002,Transferência recebida pelo Pix - EMPRESA LTDA",
		"08/09/2026,-89.90,67d1e5f2-0003,Compra no débito - MERCADO DO BAIRRO",
	].join("\n");

	it("keeps the sign the bank wrote, because this file carries both directions", () => {
		const read = readFile(utf8(statement), { fileName: "NU_extrato.csv" });

		expect(read.mapping?.positiveMeans).toBe("asWritten");
		expect(read.records[0]?.amount).toBe(-15_050);
		expect(read.records[1]?.amount).toBe(612_000);
		expect(read.records[2]?.amount).toBe(-8_990);
	});

	it("takes the identifier, which is what makes a second import harmless", () => {
		const read = readFile(utf8(statement), { fileName: "NU_extrato.csv" });
		expect(read.records.map((record) => record.externalId)).toEqual([
			"67d1e5f2-0001",
			"67d1e5f2-0002",
			"67d1e5f2-0003",
		]);
	});

	it("reads the accented column name and the accented words under it", () => {
		const read = readFile(utf8(statement), { fileName: "NU_extrato.csv" });
		expect(read.records[0]?.description).toBe("Transferência enviada pelo Pix - JOAO");
	});
});

describe("an OFX file as the banks here send it", () => {
	// Tags that never close, a header that claims US ASCII, and bytes that are not.
	const ofx = [
		"OFXHEADER:100",
		"DATA:OFXSGML",
		"VERSION:102",
		"SECURITY:NONE",
		"ENCODING:USASCII",
		"CHARSET:1252",
		"COMPRESSION:NONE",
		"OLDFILEUID:NONE",
		"NEWFILEUID:NONE",
		"",
		"<OFX>",
		"<BANKMSGSRSV1><STMTTRNRS><STMTRS>",
		"<CURDEF>BRL",
		"<BANKACCTFROM><BANKID>0341<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>",
		"<BANKTRANLIST>",
		"<DTSTART>20260901<DTEND>20260930",
		"<STMTTRN>",
		"<TRNTYPE>DEBIT",
		"<DTPOSTED>20260903120000[-03:EST]",
		"<TRNAMT>-150.50",
		"<FITID>20260903001",
		"<MEMO>PAGAMENTO DE TÍTULO",
		"</STMTTRN>",
		"<STMTTRN>",
		"<TRNTYPE>CREDIT",
		"<DTPOSTED>20260905",
		"<TRNAMT>6120.00",
		"<FITID>20260905002",
		"<MEMO>SALÁRIO",
		"</STMTTRN>",
		"</BANKTRANLIST>",
		"<LEDGERBAL><BALAMT>5969.50<DTASOF>20260930</LEDGERBAL>",
		"</STMTRS></STMTTRNRS></BANKMSGSRSV1>",
		"</OFX>",
	].join("\r\n");

	it("reads both entries, with the identifier the bank gave them", () => {
		const read = readFile(latin1(ofx), { fileName: "extrato.ofx" });

		expect(read.format).toBe("ofx");
		expect(read.records).toHaveLength(2);
		expect(read.records[0]).toMatchObject({
			happenedOn: "2026-09-03",
			amount: -15_050,
			externalId: "20260903001",
		});
		expect(read.records[1]?.amount).toBe(612_000);
	});

	it("reads the accents, although the header says the file has none", () => {
		const read = readFile(latin1(ofx), { fileName: "extrato.ofx" });
		expect(read.records[0]?.description).toBe("PAGAMENTO DE TÍTULO");
		expect(read.records[1]?.description).toBe("SALÁRIO");
	});

	it("takes the account and the currency, which is what names the file on screen", () => {
		const read = readFile(latin1(ofx), { fileName: "extrato.ofx" });
		expect(read.accountHint).toBe("12345-6");
		expect(read.currency).toBe("BRL");
	});

	it("does not take the balance at the end for a transaction", () => {
		const read = readFile(latin1(ofx), { fileName: "extrato.ofx" });
		expect(read.records.some((record) => record.amount === 596_950)).toBe(false);
	});
});

describe("the layout a bank with a mainframe behind it produces", () => {
	// Semicolons, day first, a comma for the decimal, and the direction in the column
	// rather than in the sign.
	const statement = [
		"Data;Histórico;Documento;Débito;Crédito;Saldo",
		"03/09/2026;PAGTO ELETRONICO COSERN;000123;150,50;;1.849,50",
		"05/09/2026;CREDITO SALARIO;000124;;6.120,00;7.969,50",
		"08/09/2026;COMPRA CARTAO DEBITO;000125;89,90;;7.879,60",
	].join("\r\n");

	it("takes the direction from the column and never from the sign", () => {
		const read = readFile(utf8(statement), { fileName: "extrato.csv" });

		expect(read.records).toHaveLength(3);
		expect(read.records[0]?.amount).toBe(-15_050);
		expect(read.records[1]?.amount).toBe(612_000);
		expect(read.records[2]?.amount).toBe(-8_990);
	});

	it("does not read the running balance as money that moved", () => {
		const read = readFile(utf8(statement), { fileName: "extrato.csv" });
		expect(read.records.some((record) => Math.abs(record.amount) === 796_950)).toBe(false);
	});

	it("reads the thousands separator as thousands and not as a decimal", () => {
		const read = readFile(utf8(statement), { fileName: "extrato.csv" });
		expect(read.records[1]?.amount).toBe(612_000);
	});
});
