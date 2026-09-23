import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { recognise, recogniseReceipt, recogniseStatement } from "./index.ts";

const today = "2026-09-22";

const STATEMENT = [
	"Banco Inter",
	"Extrato da conta corrente",
	"Periodo de 01/09/2026 a 30/09/2026",
	"Data Historico Valor Saldo",
	"01/09/2026 Saldo anterior 1.000,00",
	"05/09/2026 Salario 5.000,00 6.000,00",
	"10/09/2026 Mercado do bairro 42,90 5.957,10",
	"11/09/2026 Pix enviado para Joao 150,00 5.807,10",
	"Pagina 1 de 2",
];

const INVOICE = [
	"Nubank",
	"Fatura do cartao de credito",
	"Vencimento: 10/10/2026",
	"Total desta fatura R$ 1.234,56",
	"Data Descricao Valor",
	"12 SET Padaria da esquina 18,40",
	"13 SET Assinatura de musica 21,90",
	"14 SET Pagamento recebido 500,00",
	"Limite total R$ 8.000,00",
];

const RECEIPT = [
	"Comprovante de transferencia",
	"Pix enviado",
	"Valor",
	"R$ 250,00",
	"Data do pagamento",
	"14/09/2026",
	"Para",
	"Maria Oliveira",
	"ID da transacao: E18236120202609141200abc123",
];

describe("a statement", () => {
	it("reads every line that names a day and an amount", () => {
		const read = recogniseStatement(STATEMENT, { today });

		expect(read.kind).toBe("statement");
		expect(read.institution).toBe("Inter");
		expect(read.period).toEqual({ from: "2026-09-01", to: "2026-09-30" });
		expect(read.entries).toHaveLength(3);
	});

	it("takes the direction from the balance, which is the surest thing on the page", () => {
		const read = recogniseStatement(STATEMENT, { today });
		const [salary, market, pix] = read.entries;

		expect(salary).toMatchObject({ happenedOn: "2026-09-05", amount: 500_000 });
		expect(market).toMatchObject({ happenedOn: "2026-09-10", amount: -4290 });
		expect(pix).toMatchObject({ happenedOn: "2026-09-11", amount: -15_000 });

		// The balance moved, so there is nothing to guess about.
		expect(market?.confidence).toBeGreaterThan(0.9);
	});

	it("leaves the furniture out", () => {
		const read = recogniseStatement(STATEMENT, { today });
		const said = read.entries.map((entry) => entry.description).join(" ");

		expect(said).not.toContain("Saldo anterior");
		expect(said).not.toContain("Pagina");
	});
});

describe("a card invoice", () => {
	it("knows a charge from a payment", () => {
		const read = recogniseStatement(INVOICE, { today });

		expect(read.kind).toBe("invoice");
		expect(read.institution).toBe("Nubank");
		expect(read.dueOn).toBe("2026-10-10");
		expect(read.total).toBe(123_456);

		expect(read.entries.map((entry) => entry.amount)).toEqual([-1840, -2190, 50_000]);
		// The one that says what it is arrives surer than the ones that do not.
		expect(read.entries[2]?.confidence).toBeGreaterThan(read.entries[0]?.confidence ?? 1);
	});

	it("reads a day written with the name of the month", () => {
		const read = recogniseStatement(INVOICE, { today });
		expect(read.entries[0]?.happenedOn).toBe("2026-09-12");
	});

	it("keeps the line each record came from", () => {
		const read = recogniseStatement(INVOICE, { today });
		expect(read.entries[0]?.source).toContain("Padaria da esquina");
	});
});

describe("a receipt", () => {
	it("reads one payment, and the identifier that makes it unique", () => {
		const read = recogniseReceipt(RECEIPT, { today });

		expect(read.kind).toBe("receipt");
		expect(read.entries).toHaveLength(1);
		expect(read.entries[0]).toMatchObject({
			happenedOn: "2026-09-14",
			amount: -25_000,
			description: "Maria Oliveira",
			externalId: "E18236120202609141200abc123",
		});
		expect(read.entries[0]?.confidence).toBeGreaterThan(0.8);
	});

	it("turns it round when the money came in", () => {
		const read = recogniseReceipt(
			[
				"Comprovante",
				"Pix recebido",
				"Valor",
				"R$ 80,00",
				"Data",
				"14/09/2026",
				"De",
				"Carlos Souza",
			],
			{ today },
		);

		expect(read.entries[0]?.amount).toBe(8000);
		expect(read.entries[0]?.description).toBe("Carlos Souza");
	});

	it("says it could not read a receipt with no amount on it", () => {
		const read = recogniseReceipt(["Comprovante", "obrigado pela preferencia"], { today });
		expect(read.entries).toEqual([]);
		expect(read.unread).toHaveLength(1);
	});

	it("is the reader a receipt gets, without being asked", () => {
		expect(recognise(RECEIPT, { today }).kind).toBe("receipt");
		expect(recognise(STATEMENT, { today }).kind).toBe("statement");
		expect(recognise(INVOICE, { today }).kind).toBe("invoice");
	});
});

describe("what it is not sure about", () => {
	it("marks a line with no sign and no words to go on", () => {
		const read = recogniseStatement(
			["Extrato", "Data Historico Valor", "10/09/2026 Qualquer coisa 42,90"],
			{ today },
		);

		expect(read.entries[0]?.amount).toBe(-4290);
		// Half sure: negative is the common case and the document did not say.
		expect(read.entries[0]?.confidence).toBeLessThan(0.7);
	});

	it("collects the lines that held money and named no day", () => {
		const read = recogniseStatement(
			["Extrato", "Rendimento do mes 12,34", "10/09/2026 Mercado 42,90"],
			{ today },
		);

		expect(read.unread.map((line) => line.text)).toEqual(["Rendimento do mes 12,34"]);
		expect(read.confidence).toBeLessThan(read.entries[0]?.confidence ?? 1);
	});
});

describe("whatever the lines hold", () => {
	it("never throws, and never invents a record", () => {
		fc.assert(
			fc.property(fc.array(fc.string({ maxLength: 60 }), { maxLength: 30 }), (lines) => {
				const read = recognise(lines, { today });
				expect(
					read.entries.every(
						(entry) =>
							/^\d{4}-\d{2}-\d{2}$/.test(entry.happenedOn) &&
							Number.isSafeInteger(entry.amount) &&
							entry.amount !== 0 &&
							entry.description.length > 0 &&
							entry.confidence > 0 &&
							entry.confidence <= 1,
					),
				).toBe(true);
			}),
			{ numRuns: 300 },
		);
	});
});
