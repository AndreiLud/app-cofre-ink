import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type QuickEntryAccount, readQuickEntry } from "./quickEntry.ts";

const today = "2026-09-21";

const accounts: QuickEntryAccount[] = [
	{ id: "checking", name: "Conta corrente" },
	{ id: "card", name: "Nubank" },
	{ id: "cash", name: "Carteira" },
	{ id: "voucher", name: "Vale refeição" },
];

const read = (text: string) => readQuickEntry(text, { today, accounts });

describe("reading a line of text", () => {
	it("reads the line from the brief", () => {
		const entry = read("ifood 42,90 ontem nubank");

		expect(entry.description).toBe("ifood");
		expect(entry.amount).toBe(4290);
		expect(entry.happenedOn).toBe("2026-09-20");
		expect(entry.accountId).toBe("card");
		expect(entry.kind).toBe("expense");
		expect(entry.status).toBe("settled");
		expect(entry.problems).toEqual([]);
	});

	it("treats what it cannot find as missing instead of inventing it", () => {
		expect(read("mercado").problems).toEqual(["amountMissing"]);
		expect(read("42,90").problems).toEqual(["descriptionMissing"]);
		expect(read("   ").problems).toEqual(["amountMissing", "descriptionMissing"]);
	});

	it("falls back to today and to the account the screen offers", () => {
		const entry = read("cafe 7");

		expect(entry.happenedOn).toBe(today);
		expect(entry.accountId).toBe(null);
		expect(entry.amount).toBe(700);
	});

	it("keeps the amount positive and puts the direction in the kind", () => {
		expect(read("salario 4500 hoje").kind).toBe("income");
		expect(read("salario 4500 hoje").amount).toBe(450_000);
		expect(read("+1200 freela").kind).toBe("income");
		expect(read("mercado 89,90").kind).toBe("expense");
	});
});

describe("the day", () => {
	it("understands the words people use for recent days", () => {
		expect(read("uber 18 hoje").happenedOn).toBe("2026-09-21");
		expect(read("uber 18 ontem").happenedOn).toBe("2026-09-20");
		expect(read("uber 18 anteontem").happenedOn).toBe("2026-09-19");
		expect(read("uber 18 amanha").happenedOn).toBe("2026-09-22");
	});

	it("understands a day written with slashes", () => {
		expect(read("livro 60 15/09").happenedOn).toBe("2026-09-15");
		expect(read("livro 60 15/9/2025").happenedOn).toBe("2025-09-15");
		expect(read("livro 60 15/9/25").happenedOn).toBe("2025-09-15");
		expect(read("livro 60 2026-09-15").happenedOn).toBe("2026-09-15");
	});

	it("reads a day of this month without eating it as the amount", () => {
		const entry = read("aluguel 1450 dia 5");

		expect(entry.happenedOn).toBe("2026-09-05");
		expect(entry.amount).toBe(145_000);
		expect(entry.description).toBe("aluguel");
	});

	it("reads a date far in the future as one from last year", () => {
		// Written in September, a date in December is this year. One in February is
		// almost certainly the one that already happened.
		expect(read("presente 200 20/12").happenedOn).toBe("2026-12-20");
		expect(read("ipva 900 10/02").happenedOn).toBe("2026-02-10");
	});

	it("calls a day that has not arrived planned", () => {
		expect(read("aluguel 1450 amanha").status).toBe("planned");
		expect(read("aluguel 1450 ontem").status).toBe("settled");
		expect(read("aluguel 1450 hoje").status).toBe("settled");
		expect(read("aluguel 1450 vence dia 30").status).toBe("planned");
	});
});

describe("the account", () => {
	it("finds it by one word of its name", () => {
		expect(read("cafe 7 carteira").accountId).toBe("cash");
		expect(read("cafe 7 nubank").accountId).toBe("card");
	});

	it("ignores case and accents", () => {
		expect(read("almoco 32 VALE REFEICAO").accountId).toBe("voucher");
		expect(read("almoco 32 vale refeição").accountId).toBe("voucher");
	});

	it("prefers the longer name when both could match", () => {
		const two = [
			{ id: "a", name: "Conta corrente" },
			{ id: "b", name: "Conta conjunta" },
		];
		expect(readQuickEntry("mercado 50 conta corrente", { today, accounts: two }).accountId).toBe(
			"a",
		);
		expect(readQuickEntry("mercado 50 conta conjunta", { today, accounts: two }).accountId).toBe(
			"b",
		);
	});

	it("leaves the choice open when a word names two accounts", () => {
		const two = [
			{ id: "a", name: "Conta corrente" },
			{ id: "b", name: "Conta conjunta" },
		];
		expect(readQuickEntry("mercado 50 conta", { today, accounts: two }).accountId).toBe(null);
	});

	it("takes the account name out of the description", () => {
		expect(read("mercado do bairro 50 no nubank").description).toBe("mercado do bairro");
		expect(read("50 carteira cafe").description).toBe("cafe");
	});
});

describe("installments", () => {
	it("reads them written either way", () => {
		expect(read("geladeira 1234,56 3x nubank").installments).toBe(3);
		expect(read("geladeira 1234,56 em 3 vezes").installments).toBe(3);
		expect(read("geladeira 1234,56 10 parcelas").installments).toBe(10);
	});

	it("keeps the number of parts out of the amount and the description", () => {
		const entry = read("geladeira 1234,56 3x nubank");

		expect(entry.amount).toBe(123_456);
		expect(entry.description).toBe("geladeira");
	});

	it("is one when nothing says otherwise", () => {
		expect(read("mercado 50").installments).toBe(1);
	});
});

describe("what is left becomes the description", () => {
	it("drops the words that only lead into something it read", () => {
		expect(read("paguei 120 de luz ontem").description).toBe("luz");
		expect(read("almoco no vale refeicao 32").description).toBe("almoco");
	});

	it("keeps a linking word that belongs to the words around it", () => {
		expect(read("pao de queijo 12").description).toBe("pao de queijo");
		expect(read("agua e luz 180").description).toBe("agua e luz");
	});

	it("keeps the capitals and the accents of what was typed", () => {
		expect(read("Farmácia São João 48,70").description).toBe("Farmácia São João");
	});

	it("ignores the currency people write out of habit", () => {
		expect(read("mercado R$ 89,90").description).toBe("mercado");
		expect(read("mercado R$89,90").amount).toBe(8990);
		expect(read("mercado 50 reais").description).toBe("mercado");
	});
});

describe("whatever is typed", () => {
	it("never throws and never returns a negative amount", () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 60 }), (text) => {
				const entry = readQuickEntry(text, { today, accounts });
				expect(entry.amount === null || entry.amount > 0).toBe(true);
				expect(entry.installments >= 1).toBe(true);
				// The day is always a day that exists, whatever the text said.
				expect(entry.happenedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			}),
		);
	});

	it("reads back what the formatter would write", () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 9_999_999 }), (cents) => {
				const written = (cents / 100).toFixed(2).replace(".", ",");
				expect(readQuickEntry(`teste ${written}`, { today }).amount).toBe(cents);
			}),
		);
	});
});
