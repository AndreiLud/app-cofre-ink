// Paying an invoice with another card, splitting one, and the interest of the revolving credit.
//
// Part 2, C.14.7 of the request for 2.0.0, on the four cards of the test data (part 2, B.2.3)
// and the fixed day of the suite, the twenty eighth of October: Nubank is late by R$ 300,00 on
// October, Itaú closed October at R$ 900,00, due on the fifth of November, and C6 holds R$ 500,00
// on its open invoice.

import { expect, type Page, test } from "@playwright/test";
import { fourCards, go } from "./support.ts";

/** The invoice screen of one card, one month before the open invoice it opens on. */
async function closedInvoiceOf(page: Page, card: string): Promise<void> {
	await go(page, "Faturas");
	await page.getByRole("group", { name: "Cartão" }).getByText(card, { exact: true }).click();
	await expect(page.getByRole("heading", { level: 1 })).toContainText(card);
	await page.getByRole("button", { name: "Fatura anterior", exact: true }).click();
	await expect(page.getByRole("heading", { level: 1 })).toContainText("outubro");
}

test.describe("an invoice paid another way", () => {
	test("pays an invoice with another card in three, and says how it was paid", async ({ page }) => {
		await fourCards(page);
		await closedInvoiceOf(page, "Nubank");

		await page.getByRole("button", { name: "Pagar fatura" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByText("Com outro cartão de crédito", { exact: true }).click();
		await dialog.getByLabel("Cartão que paga").selectOption({ label: "C6" });
		await expect(dialog.getByLabel("Quanto esta fatura recebe")).toHaveValue("300,00");
		await dialog.getByLabel("Parcelas", { exact: true }).selectOption({ label: "3 vezes" });
		await dialog.getByLabel("Quanto o outro cartão cobra").fill("330,00");
		// Said before anything is written.
		await expect(dialog).toContainText(
			"O cartão C6 cobra R$ 30,00 a mais do que faltava, nas faturas de novembro a janeiro de 2027.",
		);
		await dialog.getByRole("button", { name: "Pagar com o cartão" }).click();
		await expect(dialog).toHaveCount(0);

		const paid = page.locator("section").filter({ hasText: "Como foi paga" });
		await expect(paid).toContainText(
			"Paga com o cartão C6: Em 3 de R$ 110,00, de novembro a janeiro de 2027",
		);
		await expect(page.getByText("Paga", { exact: true })).toBeVisible();

		// On C6, each part is a purchase on its own invoice, beside what it costs.
		await go(page, "Faturas");
		await page.getByRole("group", { name: "Cartão" }).getByText("C6", { exact: true }).click();
		await expect(
			page.getByRole("row").filter({ hasText: "Pagamento da fatura de outubro (Nubank), 1 de 3" }),
		).toContainText("-R$ 100,00");
		await expect(page.getByRole("row").filter({ hasText: /^.*Custo do pagamento/ })).toContainText(
			"-R$ 10,00",
		);
	});

	test("splits an invoice in six with an entry, and only the cost is spending", async ({
		page,
	}) => {
		await fourCards(page);
		await closedInvoiceOf(page, "Itaú");

		await page.getByRole("button", { name: "Pagar fatura" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByText("Parcelando", { exact: true }).click();
		await dialog.getByLabel("Entrada", { exact: true }).fill("300,00");
		await dialog.getByLabel("Parcelas", { exact: true }).selectOption({ label: "6 vezes" });
		await dialog.getByText("O valor é de cada parcela", { exact: true }).click();
		await dialog.getByLabel("Valor das parcelas").fill("110,00");
		// Agreed today, so it settles the invoice now rather than on the day it falls due.
		await dialog.getByLabel("Dia do acordo").fill("2026-10-28");
		await expect(dialog.getByLabel("Categoria do custo")).toHaveValue(/.+/);
		await expect(dialog).toContainText(
			"Você paga R$ 60,00 a mais do que faltava, nas faturas de novembro a abril de 2027.",
		);
		await dialog.getByRole("button", { name: "Parcelar" }).click();
		await expect(dialog).toHaveCount(0);

		await expect(page.getByRole("heading", { level: 1 })).toContainText(
			"Itaú: a fatura de outubro foi parcelada",
		);
		const paid = page.locator("section").filter({ hasText: "Como foi paga" });
		await expect(paid).toContainText("Parcelada: Em 6 de R$ 110,00, de novembro a abril de 2027");
		await expect(paid).toContainText("Entrada do parcelamento");

		await go(page, "Painel");
		await expect(page.locator("#cartoes")).toContainText("Fatura de outubro: parcelada.");

		// The first cost, written on the day of the agreement, under "Tarifas e juros".
		await go(page, "Relatórios");
		await expect(
			page.getByRole("row").filter({ hasText: "Tarifas e juros" }).first(),
		).toContainText("R$ 10,00");

		// And the month screen writes no payment for an invoice that is in parts.
		await go(page, "O mês");
		await expect(page.getByText(/A fatura de outubro do cartão Itaú foi parcelada/)).toBeVisible();
		await page.getByLabel("Quanto entrou").fill("5.000,00");
		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Está tudo no lugar de sempre")).toBeVisible();
		await expect(
			page.getByRole("row").filter({ hasText: /Pagamento da fatura.*Itaú/ }),
		).toHaveCount(0);
		await closedInvoiceOf(page, "Itaú");
		await expect(page.getByRole("heading", { level: 1 })).toContainText("foi parcelada");
	});

	test("writes down the interest the bank charged on what was left", async ({ page }) => {
		await fourCards(page);
		// A closed invoice of R$ 2.000,00 on C6, with R$ 800,00 of it paid.
		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		await form.getByLabel("Pago com").selectOption({ label: "C6" });
		await form.getByLabel("Valor", { exact: true }).fill("2.000,00");
		await form.getByLabel("Descrição").fill("Viagem");
		await form.getByLabel("Dia").fill("2026-09-20");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);

		await closedInvoiceOf(page, "C6");
		await page.getByRole("button", { name: "Pagar fatura" }).click();
		const paying = page.getByRole("dialog");
		await paying.getByLabel("Valor", { exact: true }).fill("800,00");
		await paying.getByLabel("Dia", { exact: true }).fill("2026-10-10");
		await paying.getByRole("button", { name: "Pagar fatura" }).click();
		await expect(paying).toHaveCount(0);
		await expect(page.getByText(/O custo de parcelar é o que o banco oferece/)).toBeVisible();

		await page.getByRole("button", { name: "Lançar os juros que o banco cobrou" }).click();
		const interest = page.getByRole("dialog");
		await interest.getByLabel("Valor", { exact: true }).fill("150,00");
		await interest.getByRole("button", { name: "Lançar os juros que o banco cobrou" }).click();
		await expect(interest).toHaveCount(0);

		// October still owes what it owed, and the interest is on the open invoice.
		await expect(page.getByText(/Falta:/)).toContainText("R$ 1.200,00");
		await page.getByRole("button", { name: "Próxima fatura", exact: true }).click();
		await expect(page.getByText("R$ 650,00").first()).toBeVisible();
		await expect(
			page.getByRole("row").filter({ hasText: "Juros da fatura de outubro" }),
		).toContainText("-R$ 150,00");
	});
});
