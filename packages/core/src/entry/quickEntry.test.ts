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

	// Release 1.2.1 wrote a day ahead as a promise, and nothing ever turned a promise into
	// a fact, so the rent written for tomorrow stayed out of the balance on its day and
	// was called late the day after. The day holds a record back now, and only the day.
	it("writes a day that has not arrived as a fact, which its day holds back", () => {
		expect(read("aluguel 1450 amanha").status).toBe("settled");
		expect(read("aluguel 1450 amanha").happenedOn).toBe("2026-09-22");
		expect(read("aluguel 1450 ontem").status).toBe("settled");
		expect(read("aluguel 1450 hoje").status).toBe("settled");

		const due = read("aluguel 1450 vence dia 30");
		expect(due.status).toBe("settled");
		expect(due.happenedOn).toBe("2026-09-30");
		// The word that used to ask for a promise is still read, so it stays out of the name.
		expect(due.description).toBe("aluguel");
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

describe("the name of a card", () => {
	const ways = [
		{ id: "corrente", name: "Conta corrente" },
		{ id: "cartao", name: "Nubank", cardId: "plastico" },
	];

	it("reads a card by name and says which one", () => {
		// It knew only account names, so this line went to whichever account came first
		// alphabetically and a purchase on a card landed on a current account.
		const reading = readQuickEntry("mercado 80 no nubank", {
			today: "2026-09-29",
			accounts: ways,
		});
		expect(reading.accountId).toBe("cartao");
		expect(reading.cardId).toBe("plastico");
	});

	it("says no card when the line named an account", () => {
		const reading = readQuickEntry("mercado 80 na conta corrente", {
			today: "2026-09-29",
			accounts: ways,
		});
		expect(reading.accountId).toBe("corrente");
		expect(reading.cardId).toBeNull();
	});

	it("says no card when the line named neither", () => {
		const reading = readQuickEntry("mercado 80", { today: "2026-09-29", accounts: ways });
		expect(reading.accountId).toBeNull();
		expect(reading.cardId).toBeNull();
	});

	// Part 1, D.2 of the request for 2.0.0: the form that writes a card down gives it the name
	// of its account, so the account and the card both answered to "nubank", the tie was left
	// alone and the purchase went to the default account. "mercado 80 nubank" worked in 1.0.5.
	it("takes the card when a card and an account share a name, of one word or two", () => {
		for (const name of ["Nubank", "Banco Inter"]) {
			const ways = [
				{ id: "checking", name, takesIncome: true },
				{ id: "credit", name, takesIncome: false },
				{ id: "credit", name, cardId: "plastic", side: "credit" as const, takesIncome: false },
			];
			const line = `mercado 80 ${name.toLowerCase()}`;
			const spent = readQuickEntry(line, { today, accounts: ways });
			expect([spent.accountId, spent.cardId, spent.description]).toEqual([
				"credit",
				"plastic",
				"mercado",
			]);

			// Money coming in never lands on the card, which is where the salary went.
			const earned = readQuickEntry(`salario 6120 ${name.toLowerCase()}`, {
				today,
				accounts: ways,
			});
			expect([earned.kind, earned.accountId, earned.cardId]).toEqual(["income", "checking", null]);
		}
	});

	// Part 2, B.9: a cartao multiplo reaches two accounts, and the line said which by nothing.
	it("lets the line say which side of a card that does both", () => {
		const ways = [
			{ id: "corrente", name: "Conta corrente", takesIncome: true },
			{ id: "fatura", name: "Cartão de crédito", takesIncome: false },
			{ id: "fatura", name: "Cartão do banco", cardId: "multiplo", side: "credit" as const },
			{ id: "corrente", name: "Cartão do banco", cardId: "multiplo", side: "debit" as const },
		];
		const debit = readQuickEntry("mercado 80 cartão do banco débito", { today, accounts: ways });
		expect([debit.accountId, debit.cardId, debit.description]).toEqual([
			"corrente",
			"multiplo",
			"mercado",
		]);
		const credit = readQuickEntry("mercado 80 cartão do banco", { today, accounts: ways });
		expect([credit.accountId, credit.cardId]).toEqual(["fatura", "multiplo"]);
		const said = readQuickEntry("mercado 80 cartão do banco crédito", { today, accounts: ways });
		expect([said.accountId, said.description]).toEqual(["fatura", "mercado"]);
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

	it("treats a zero as somebody who has not said how much yet", () => {
		const entry = read("mercado 0");
		expect(entry.amount).toBe(null);
		expect(entry.problems).toContain("amountMissing");
		// And the zero stays on screen, because it is what the person typed.
		expect(entry.description).toBe("mercado 0");
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
