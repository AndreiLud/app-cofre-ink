// The sentence at the top of the invoice screen, in the words each language really uses.

import type { InvoiceState } from "@cofre/core";
import i18next from "i18next";
import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import pt from "../locales/pt.json";
import { invoiceHeadline } from "./invoiceHeadline.ts";

async function speaking(language: "pt" | "en") {
	const instance = i18next.createInstance();
	await instance.init({
		resources: { pt: { translation: pt }, en: { translation: en } },
		lng: language,
		interpolation: { escapeValue: false },
	});
	return (key: string, values?: Record<string, unknown>) => instance.t(key, values);
}

describe("the sentence at the top of an invoice", () => {
	// Found while testing part 1, G.6 of the request for 2.0.0: before the invoice was read the
	// sentence asked for a count of nought, which Portuguese counts as one, so the screen said
	// the invoice closed tomorrow until it knew when it closed.
	it("says nothing about days before the invoice is read", async () => {
		expect(invoiceHeadline(await speaking("pt"), "novembro", "Nubank", undefined)).toBe(
			"Nubank: a fatura de novembro",
		);
		expect(invoiceHeadline(await speaking("en"), "November", "Nubank", undefined)).toBe(
			"Nubank: the November invoice",
		);
	});

	it("says how many days are left once it is", async () => {
		const open = { standing: "open", daysToClose: 6, daysToDue: 13 } as InvoiceState;
		expect(invoiceHeadline(await speaking("pt"), "novembro", "Nubank", open)).toBe(
			"Nubank: a fatura de novembro fecha em 6 dias",
		);
	});
});
