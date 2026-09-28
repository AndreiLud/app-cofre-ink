// The other way of writing a month down: three numbers instead of a list.
//
// What matters here is not that the fields accept text. It is that what they write are
// ordinary records, that the rest of the application picks them up, that typing the same
// month a second time corrects those records rather than writing three more, and that
// the card ends the month paid rather than owing the invoice forever.

import { expect, type Page, test } from "@playwright/test";
import { go, openCofre, record } from "./support.ts";

/**
 * The row of one record, matched case sensitively.
 *
 * The plain helper takes a string, and a string is matched without case, so "Fatura de"
 * would also find "Pagamento da fatura de" and every assertion about one of the two
 * would be about both.
 */
function row(page: Page, text: RegExp) {
	return page.getByRole("row").filter({ hasText: text });
}

/** What the overview says is in one account right now. */
async function balanceOf(page: Page, account: string): Promise<string> {
	await go(page, "Painel");
	const row = page.getByRole("listitem").filter({ hasText: account });
	await expect(row).toBeVisible();
	return (await row.innerText()).replace(/\s+/g, " ");
}

test.describe("a month in three numbers", () => {
	test("writes the records, and the rest of the application reads them", async ({ page }) => {
		await openCofre(page);

		const cardBefore = await balanceOf(page, "Cartão de crédito");

		await go(page, "O mês");
		await page.getByLabel("Quanto entrou").fill("5.000,00");
		await page.getByLabel("Quanto você gastou").fill("2.200,50");
		await page.getByLabel("A fatura do cartão").fill("1.800,00");
		await page.getByLabel("Em qual conta").selectOption({ label: "Conta corrente" });

		// What is left over is worked out before anything is written.
		await expect(page.getByText("R$ 999,50")).toBeVisible();

		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Está tudo no lugar de sempre")).toBeVisible();

		const written = page.getByRole("table");
		await expect(written).toContainText("Entradas de");
		await expect(written).toContainText("Gastos de");
		await expect(written).toContainText("Fatura de");
		await expect(written).toContainText("Pagamento da fatura de");

		// They are records like any other, so they are in the list with everything else.
		await go(page, "Lista");
		await expect(record(page, "Entradas de")).toBeVisible();
		await expect(page.getByRole("cell", { name: "R$ 5.000,00", exact: true })).toBeVisible();

		// The card one is charged to the card rather than to the account, which is what
		// puts it on an invoice. Which invoice is settled in the unit tests, because it
		// moves with the closing day and with what today happens to be.
		await expect(row(page, /Fatura de/)).toContainText("Cartão de crédito");

		// And the invoice is paid, so the card comes out of the month where it went in.
		// Without that record the account the wages arrive in would climb by the whole
		// invoice every month and the card would sink by the same amount.
		expect(await balanceOf(page, "Cartão de crédito")).toBe(cardBefore);
	});

	test("says what the month already holds, so the same money is not counted twice", async ({
		page,
	}) => {
		await openCofre(page);

		// Written by hand, in the month the screen opens on. The demonstration data is
		// dated relative to today, so nothing here depends on what day it is.
		await go(page, "Lista");
		await page.getByLabel("Lançamento rápido").fill("mercado 120,00 hoje");
		await page.getByRole("button", { name: "Lançar", exact: true }).click();
		await expect(record(page, "mercado")).toBeVisible();

		await go(page, "O mês");
		await expect(page.getByText("Neste mês você também lançou um a um")).toBeVisible();
		await expect(page.getByText("Já lançado:")).toBeVisible();
	});

	test("corrects the same month instead of writing it twice", async ({ page }) => {
		await openCofre(page);
		await go(page, "O mês");

		await page.getByLabel("Quanto entrou").fill("4.000,00");
		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Está tudo no lugar de sempre")).toBeVisible();

		await page.getByLabel("Quanto entrou").fill("4.500,00");
		await page.getByRole("button", { name: "Guardar o mês" }).click();

		await go(page, "Lista");
		await expect(record(page, "Entradas de")).toHaveCount(1);
		await expect(page.getByRole("cell", { name: "R$ 4.500,00", exact: true })).toBeVisible();

		// An empty field is not a zero: it takes the record away.
		await go(page, "O mês");
		await page.getByLabel("Quanto entrou").fill("");
		await page.getByRole("button", { name: "Guardar o mês" }).click();

		await go(page, "Lista");
		await expect(record(page, "Entradas de")).toHaveCount(0);
	});

	test("takes the payment away with the invoice it paid", async ({ page }) => {
		await openCofre(page);
		await go(page, "O mês");

		await page.getByLabel("A fatura do cartão").fill("900,00");
		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Está tudo no lugar de sempre")).toBeVisible();
		await expect(page.getByRole("table")).toContainText("Pagamento da fatura de");

		await page.getByLabel("A fatura do cartão").fill("");
		await page.getByRole("button", { name: "Guardar o mês" }).click();

		await go(page, "Lista");
		await expect(row(page, /Fatura de/)).toHaveCount(0);
		await expect(row(page, /Pagamento da fatura de/)).toHaveCount(0);
	});

	test("refuses an amount it cannot read, and says nothing was typed", async ({ page }) => {
		await openCofre(page);
		await go(page, "O mês");

		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Escreva pelo menos um dos números.")).toBeVisible();

		await page.getByLabel("Quanto entrou").fill("uns cinco mil");
		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Não consegui ler um dos valores.")).toBeVisible();
	});
});
