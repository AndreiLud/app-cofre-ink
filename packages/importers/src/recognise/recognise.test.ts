import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { natureOf } from "../nature.ts";
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
	// What the two purchases come to, so the invoice adds up (part 2, E.20.3 of the request for
	// 2.0.0): it said 1.234,56, which nothing on it added up to.
	"Total desta fatura R$ 40,30",
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
		expect(read.total).toBe(4030);

		expect(read.entries.map((entry) => entry.amount)).toEqual([-1840, -2190, 50_000]);
		// The invoice adds up to its total, so every line is as sure as a sign would make it.
		// It said the line naming itself was surer than the others, which is true only when
		// nothing checks them (part 2, E.9).
		expect(read.check).toEqual({ matches: true, difference: 0, flipped: false });
		expect(read.entries.every((entry) => entry.confidence >= 0.9)).toBe(true);
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

	// Part 2, E.16 of the request for 2.0.0: the receipt of an invoice paid was money spent.
	it("knows the receipt of an invoice paid for the payment of a card", () => {
		const read = recogniseReceipt(
			[
				"Comprovante de pagamento",
				"Pagamento de fatura Nubank",
				"Valor",
				"R$ 1.234,56",
				"Data do pagamento",
				"10/10/2026",
			],
			{ today },
		);
		expect(read.entries[0]).toMatchObject({ amount: -123_456, nature: "cardPayment" });
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

// Part 2, E.1 of the request for 2.0.0: the recogniser read amounts with an expression of its
// own, and lost signs the reader of a column knew.
describe("an amount read once", () => {
	it("reads every way a statement writes money leaving", () => {
		for (const written of ["50,00-", "-R$ 50,00", "−50,00"]) {
			const read = recogniseStatement(["Extrato", `10/09/2026 Loja ${written}`], { today });
			expect(read.entries.map((entry) => entry.amount)).toEqual([-5000]);
			// Read from the sign the bank wrote, and not from the guess that most lines are out.
			expect(read.entries[0]?.confidence).toBeGreaterThan(0.85);
		}
	});

	it("does not take the C of the next word for a credit", () => {
		const read = recogniseStatement(
			["Fatura do cartao", "Vencimento 10/10/2026", "10/09/2026 Restaurante 18,40 Centro"],
			{ today },
		);
		expect(read.entries.map((entry) => entry.amount)).toEqual([-1840]);
	});

	it("reads a large amount written without the thousands", () => {
		const read = recogniseStatement(["Extrato", "10/09/2026 TED 12345,67"], { today });
		expect(read.entries.map((entry) => Math.abs(entry.amount))).toEqual([1_234_567]);
	});
});

// Part 2, E.2: the sign written on a line meant the same on every document, so on an invoice
// that writes purchases as positive numbers, the refund and the payment became purchases.
describe("the sign by the kind of document", () => {
	const invoice = [
		"Fatura do cartao de credito",
		"Vencimento 10/10/2026",
		"Total desta fatura R$ 130,00",
		"12/09/2026 Padaria 18,40",
		"13/09/2026 Mercado 131,60",
		"13/09/2026 Farmacia 30,00",
		"14/09/2026 Estorno Loja X -50,00",
		"15/09/2026 Pagamento recebido -1.000,00",
	];

	it("reads an invoice by the way it writes a purchase", () => {
		const read = recogniseStatement(invoice, { today });
		expect(read.convention).toBe("chargesPositive");
		expect(read.entries.map((entry) => entry.amount)).toEqual([
			-1840, -13_160, -3000, 5000, 100_000,
		]);
	});

	it("reads the words of a statement as whole words", () => {
		const read = recogniseStatement(["Extrato", "10/09/2026 Parcela credito pessoal 300,00"], {
			today,
		});
		// "credito" in the name of a loan is not money coming in.
		expect(read.kind).toBe("statement");
		expect(read.entries[0]?.amount).toBe(-30_000);
	});
});

// Part 2, E.3: what a line is, apart from its sign.
describe("the nature of each line", () => {
	it("tells a purchase from a refund and from the bill being paid", () => {
		const read = recogniseStatement(
			[
				"Fatura do cartao de credito",
				"Total desta fatura R$ 130,00",
				"12/09/2026 Padaria 18,40",
				"13/09/2026 Mercado 131,60",
				"13/09/2026 Farmacia 30,00",
				"14/09/2026 Estorno Loja X -50,00",
				"15/09/2026 Pagamento recebido -1.000,00",
			],
			{ today },
		);
		expect(read.entries.map((entry) => entry.nature)).toEqual([
			"purchase",
			"purchase",
			"purchase",
			"credit",
			"payment",
		]);
	});

	it("knows a card paid from a statement", () => {
		const read = recogniseStatement(["Extrato", "10/09/2026 PAGTO CARTAO CREDITO 1.000,00"], {
			today,
		});
		expect(read.entries.map((entry) => [entry.nature, entry.amount])).toEqual([
			["cardPayment", -100_000],
		]);
	});

	it("names the fees a bank charges", () => {
		expect(natureOf("IOF compra internacional", "invoice")).toBe("fee");
		expect(natureOf("Encargos de parcelamento", "invoice")).toBe("fee");
		expect(natureOf("FATURA NUBANK", "statement", { cardBanks: ["Nubank"] })).toBe("cardPayment");
		expect(natureOf("Mercado do bairro", "statement")).toBe("purchase");
	});
});

// Part 2, E.4: the day of a line, the year it belongs to, and the mark of a part.
describe("days and parts", () => {
	const invoiceDue = (due: string, line: string) =>
		recogniseStatement(["Fatura do cartao", `Vencimento: ${due}`, line], { today });

	it("takes the day before the name, and the part after it", () => {
		const read = invoiceDue("10/10/2026", "12 SET Loja X PARC 02/10 150,00");
		expect(read.entries[0]).toMatchObject({
			happenedOn: "2026-09-12",
			description: "Loja X",
			installment: { number: 2, count: 10, sure: true },
			nature: "installment",
		});
	});

	it("does not take a day printed again after the name for a part", () => {
		const read = recogniseStatement(["Extrato", "05/09/2026 IFOOD 05/09 32,00"], { today });
		expect(read.entries[0]?.installment).toBe(null);
	});

	it("puts a day of December before an invoice due in January", () => {
		const read = invoiceDue("10/01/2027", "28 DEZ Loja 10,00");
		expect(read.entries[0]?.happenedOn).toBe("2026-12-28");
	});

	it("puts the purchase of a twentieth part a year and a half back", () => {
		const read = invoiceDue("10/10/2026", "12/03 Loja Y PARC 20/24 99,90");
		expect(read.entries[0]?.happenedOn).toBe("2025-03-12");
	});

	it("offers a loose mark outside a section of parts, and takes it inside one", () => {
		const outside = invoiceDue("10/10/2026", "12/09 Loja Z 02/10 50,00");
		expect(outside.entries[0]?.installment).toEqual({ number: 2, count: 10, sure: false });
		const inside = recogniseStatement(
			[
				"Fatura do cartao",
				"Vencimento: 10/10/2026",
				"Compras parceladas",
				"12/09 Loja Z 02/10 50,00",
			],
			{ today },
		);
		expect(inside.entries[0]?.installment).toEqual({ number: 2, count: 10, sure: true });
	});

	it("leaves a line whose day is further in than the second piece unread", () => {
		const read = recogniseStatement(["Extrato", "Compra no mercado em 10/09/2026 42,90"], {
			today,
		});
		expect(read.entries).toEqual([]);
		expect(read.unread).toHaveLength(1);
	});
});

// Part 2, E.5: what an invoice says about itself, its sections and its currency.
describe("the summary, the sections and the currency", () => {
	it("reads the due date off its line, and makes no purchase of it", () => {
		const read = recogniseStatement(
			["Fatura do cartao", "Vencimento 10/10/2026 R$ 1.234,56", "12/09/2026 Padaria 18,40"],
			{ today },
		);
		expect(read.dueOn).toBe("2026-10-10");
		expect(read.entries.map((entry) => entry.description)).toEqual(["Padaria"]);
	});

	it("keeps a shop whose name begins like a total", () => {
		const read = recogniseStatement(
			["Fatura do cartao", "Vencimento 10/10/2026", "12/09/2026 TOTALPASS 99,90"],
			{ today },
		);
		expect(read.entries.map((entry) => entry.amount)).toEqual([-9990]);
	});

	it("takes the amount in reais of a purchase abroad, and keeps the other", () => {
		const read = recogniseStatement(
			["Fatura do cartao", "Vencimento 10/10/2026", "15/09/2026 AMAZON US$ 10,00 R$ 52,30"],
			{ today },
		);
		expect(read.currency).toBe("BRL");
		expect(read.entries[0]).toMatchObject({
			amount: -5230,
			description: "AMAZON",
			notes: "US$ 10,00",
		});
	});

	it("reads nothing under the heading of what later invoices will charge", () => {
		const read = recogniseStatement(
			[
				"Fatura do cartao",
				"Vencimento 10/10/2026",
				"12/09/2026 Padaria 18,40",
				"Parcelas a vencer",
				"12/10/2026 Loja X PARC 03/10 150,00",
				"Pagina 2 de 2",
				"13/09/2026 Mercado 20,00",
			],
			{ today },
		);
		expect(read.entries.map((entry) => entry.description)).toEqual(["Padaria", "Mercado"]);
	});
});

// Part 2, E.6: what kind of document, and from which bank.
describe("the kind of document and the bank", () => {
	it("reads a statement that pays a card as a statement", () => {
		const read = recogniseStatement(
			[
				"Banco do Brasil",
				"Extrato de conta corrente",
				"Agencia 1234 Conta 56789-0",
				"Saldo anterior 3.000,00",
				"05/10/2026 PAG FATURA NUBANK 1.234,56 1.765,44",
				"Vencimento do boleto em 10/10/2026",
			],
			{ today },
		);
		expect(read.kind).toBe("statement");
		expect(read.entries[0]).toMatchObject({ amount: -123_456, nature: "cardPayment" });
	});

	it("takes the first bank named as a whole word", () => {
		const read = recogniseStatement(
			[
				"C6 Bank",
				"Fatura do cartao",
				"Vencimento: 10/10/2026",
				"12/09/2026 IOF compra internacional 3,20",
			],
			{ today },
		);
		expect(read.institution).toBe("C6");
	});

	it("reads it as the person says it is", () => {
		const read = recogniseStatement(["Banco qualquer", "12/09/2026 Padaria 18,40"], {
			today,
			kind: "invoice",
		});
		expect(read.kind).toBe("invoice");
	});
});

// Part 2, E.7: which card each line of an invoice is under.
describe("the cards of an invoice", () => {
	it("gives each line the digits of the card it is under", () => {
		const read = recogniseStatement(
			[
				"Itau",
				"Fatura do cartao",
				"Vencimento: 10/10/2026",
				"ANA SOUZA final 1234",
				"12/09/2026 Padaria 18,40",
				"Cartao adicional **** 5678",
				"13/09/2026 Mercado 131,60",
			],
			{ today },
		);
		expect(read.cards).toEqual(["1234", "5678"]);
		expect(read.entries.map((entry) => [entry.description, entry.cardDigits])).toEqual([
			["Padaria", "1234"],
			["Mercado", "5678"],
		]);
	});
});

// Part 2, E.9: the document checks itself against its own total, and its balances.
describe("the check of a document", () => {
	it("turns round the one line that keeps an invoice from adding up", () => {
		const read = recogniseStatement(
			[
				"Fatura do cartao",
				"Vencimento: 10/10/2026",
				"Total desta fatura R$ 130,00",
				"12/09/2026 Padaria -18,40",
				"13/09/2026 Mercado -131,60",
				"13/09/2026 Farmacia -30,00",
				"14/09/2026 Estorno Loja X -50,00",
			],
			{ today },
		);
		expect(read.convention).toBe("chargesNegative");
		expect(read.check).toEqual({ matches: true, difference: 0, flipped: true });
		expect(read.entries.map((entry) => entry.amount)).toEqual([-1840, -13_160, -3000, 5000]);
	});

	it("says by how much an invoice does not add up, and trusts no line without a sign", () => {
		const read = recogniseStatement(
			[
				"Fatura do cartao",
				"Vencimento: 10/10/2026",
				"Total desta fatura R$ 100,00",
				"12/09/2026 Padaria 18,40",
				"13/09/2026 Mercado 131,60",
			],
			{ today },
		);
		expect(read.check).toEqual({ matches: false, difference: 5000, flipped: false });
		expect(read.entries.every((entry) => entry.confidence < 2 / 3)).toBe(true);
	});

	it("checks a statement by the balance it opens and closes with", () => {
		const read = recogniseStatement(STATEMENT, { today });
		expect(read.check).toEqual({ matches: true, difference: 0, flipped: false });
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
