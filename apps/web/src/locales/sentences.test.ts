// Sentences that once sent somebody the wrong way, held to what the screens now do.

import { describe, expect, it } from "vitest";
import en from "./en.json";
import pt from "./pt.json";

describe("what a sentence tells somebody to do", () => {
	// Part 1, H.1.1 of the request for 2.0.0: a card with no cycle was told to delete its account
	// and make it again, when the edit of the account has had both days since 1.2.0.
	it("sends a card with no cycle to the edit of its account, and never to deleting it", () => {
		expect(pt.invoice.noCycleBody).toContain("Editar conta");
		expect(en.invoice.noCycleBody).toContain("Edit account");
		expect(pt.invoice.noCycleBody).not.toMatch(/apague/i);
		expect(en.invoice.noCycleBody).not.toMatch(/delete/i);
	});

	// Part 1, H.1.2: an invoice with a purchase in another currency and no rate was told to type
	// the rate, and no field takes one.
	it("asks for no rate that no field takes", () => {
		expect(pt.invoice.noRateBody).not.toMatch(/informe a cotação/i);
		expect(en.invoice.noRateBody).not.toMatch(/say what the rate was/i);
		expect(pt.invoice.noRateBody).toContain("lance de novo");
		expect(en.invoice.noRateBody).toContain("write it again");
	});

	// Found reading the code for the report of 2.0.0: the import said a repeat is found by the day,
	// the amount and the start of the description, and since part 2, E.15 the description plays no
	// part: the amount and the days do, and a move or a series is proof enough.
	it("says how the import finds what is already here, as it finds it", () => {
		expect(pt.importing.duplicatesBody).not.toMatch(/descrição/);
		expect(en.importing.duplicatesBody).not.toMatch(/description/);
		expect(pt.importing.duplicatesBody).toContain("a até três dias (dez num pagamento de fatura)");
		expect(en.importing.duplicatesBody).toContain("within three days (ten for an invoice payment)");
	});

	// Found reading the code for the report of 2.0.0: the month screen said it writes on the last
	// day of the month, which is not true of the month somebody is in; spoke of one card and "a
	// fourth" record; said a payment not yet due goes in as planned, which nothing writes since
	// 2.0.0; and said nothing of an invoice paid with another card or split.
	it("says what the month screen writes, as it writes it", () => {
		expect(pt.theMonth.whatItWritesBody).toContain("no dia de hoje quando o mês é este");
		expect(en.theMonth.whatItWritesBody).toContain("today when the month is this one");
		expect(pt.theMonth.whatItWritesBody).toContain("Para cada cartão vem mais um");
		expect(en.theMonth.whatItWritesBody).toContain("For each card there is one more");
		expect(pt.theMonth.whatItWritesBody).not.toMatch(/previsto|um quarto/);
		expect(en.theMonth.whatItWritesBody).not.toMatch(/planned|a fourth/);
		expect(pt.theMonth.whatItWritesBody).toContain("parcelou não ganha pagamento");
		expect(en.theMonth.whatItWritesBody).toContain("split into parts gets no payment");
		expect(pt.theMonth.whereHint).toContain("o pagamento de cada fatura sai dela");
		expect(en.theMonth.whereHint).toContain("the payment of each invoice leaves it");
		expect(pt.theMonth.limitsTotalOnly).toContain("por prioridade");
		expect(en.theMonth.limitsTotalOnly).toContain("on a priority");
	});

	// Found reviewing the pictures of 2.0.0: with a new version of the page installed, the overview
	// had two buttons called "Recarregar", one that reloads the page and one that tops up a voucher,
	// and a screen reader says only the name.
	it("does not give the reload of the page the name of the top up of a voucher", () => {
		expect(pt.shell.reload).not.toBe(pt.move.topUp);
		expect(en.shell.reload).not.toBe(en.move.topUp);
		expect(pt.shell.reload).toBe("Recarregar a página");
		expect(en.shell.reload).toBe("Reload the page");
	});

	// Found reviewing the pictures of 2.0.0: in the dialog that splits an invoice, the amount and
	// the choice of whether it is the total or each part were both called "Valor das parcelas".
	it("names the amount of the parts and the way it is read apart", () => {
		expect(pt.invoice.partsAmountIs).toBe("Como ler o valor");
		expect(en.invoice.partsAmountIs).toBe("How to read the amount");
		expect(pt.invoice.partsAmountIs).not.toBe(pt.invoice.partsAmount);
		expect(en.invoice.partsAmountIs).not.toBe(en.invoice.partsAmount);
	});
});
