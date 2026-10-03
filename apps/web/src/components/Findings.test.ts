// The sentences of what falls due, in both languages. Part 2, J.7.7 of the request for 2.0.0:
// "Uma conta vence nos próximos quinze dias, de R$ 0,00. Você tem -R$ 1.114,20" was said with
// nothing falling due, and an invoice already due could read "vence em -3 dias".

import type { Finding } from "@cofre/storage";
import i18next from "i18next";
import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import pt from "../locales/pt.json";
import { findingLine } from "./Findings.tsx";

async function sayer(language: "pt" | "en") {
	const instance = i18next.createInstance();
	await instance.init({
		lng: language,
		resources: { pt: { translation: pt }, en: { translation: en } },
		interpolation: { escapeValue: false },
	});
	const money = (cents: number) =>
		new Intl.NumberFormat(language === "en" ? "en" : "pt-BR", {
			style: "currency",
			currency: "BRL",
		}).format(cents / 100);
	// The space a currency is written with is the one that does not break, read here as a space.
	return (finding: Finding) =>
		findingLine(
			finding,
			money,
			(key, values) => instance.t(key, values) as string,
			language,
		).replace(/ /g, " ");
}

const invoice = (days: number, late = 0, money = 118_580): Finding => ({
	code: "invoiceOverBalance",
	weight: "problem",
	subject: "Nubank",
	amounts: { amount: 230_000, money, short: 230_000 - money, days, late },
	atStake: 230_000 - money,
});

const dues = (namingIsLate: number): Finding => ({
	code: "duesOverBalance",
	weight: "problem",
	subject: "Nubank",
	amounts: {
		count: 2,
		total: 310_000,
		largest: 230_000,
		money: 120_000,
		short: 190_000,
		days: 15,
		late: namingIsLate,
		subjectIsInvoice: 1,
		namingIsLate,
	},
	atStake: 190_000,
});

describe("what falls due, said", () => {
	it("says today, tomorrow and in so many days, and never a negative count", async () => {
		const say = await sayer("pt");
		expect(say(invoice(0))).toContain("vence hoje");
		expect(say(invoice(1))).toContain("vence amanhã");
		expect(say(invoice(13))).toContain("vence em 13 dias");
		const late = say(invoice(0, 1));
		expect(late).toContain("já venceu");
		expect(late).not.toMatch(/-\d+ dias/);

		const english = await sayer("en");
		expect(english(invoice(0))).toContain("falls due today");
		expect(english(invoice(1))).toContain("falls due tomorrow");
		expect(english(invoice(0, 1))).toContain("past its due day");
	});

	it("names the invoice by its card, and the money in the accounts, never what you have", async () => {
		for (const language of ["pt", "en"] as const) {
			const say = await sayer(language);
			for (const finding of [invoice(13), dues(0), dues(1)]) {
				const line = say(finding);
				expect(line).not.toMatch(/Você tem|You have/);
				expect(line).not.toContain("R$ 0,00");
				expect(line).not.toContain("R$0.00");
			}
		}
		const say = await sayer("pt");
		expect(say(dues(0))).toContain("a maior é a fatura do cartão Nubank");
		expect(say(dues(1))).toContain("a fatura do cartão Nubank já venceu");
		expect(say(invoice(13))).toContain("Nas contas há R$ 1.185,80, faltam R$ 1.114,20.");
	});

	it("says the accounts are negative rather than that there is a negative amount", async () => {
		const say = await sayer("pt");
		expect(say(invoice(5, 0, -111_420))).toContain(
			"As contas estão negativas em R$ 1.114,20, faltam R$ 3.414,20.",
		);
	});

	it("says a charge twice on the same day as the same day", async () => {
		const say = await sayer("pt");
		const line = say({
			code: "chargedTwice",
			weight: "attention",
			subject: "Mercado",
			amounts: { amount: 18_990, days: 0 },
			atStake: 18_990,
		});
		expect(line).toContain("no mesmo dia");
	});
});
