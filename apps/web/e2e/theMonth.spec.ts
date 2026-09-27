// The other way of writing a month down: three numbers instead of a list.
//
// What matters here is not that the fields accept text. It is that what they write are
// ordinary records, that the rest of the application picks them up, and that typing the
// same month a second time corrects those records rather than writing three more.

import { expect, test } from "@playwright/test";
import { go, openCofre, record } from "./support.ts";

test.describe("a month in three numbers", () => {
	test("writes three records, and the rest of the application reads them", async ({ page }) => {
		await openCofre(page);
		await go(page, "O mês");

		// The demonstration data has records in this month, so the screen says so before
		// anybody types a total that would count them twice.
		await expect(page.getByText("Neste mês você também lançou um a um")).toBeVisible();

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

		// They are records like any other, so they are in the list with everything else.
		await go(page, "Lista");
		await expect(record(page, "Entradas de")).toBeVisible();
		await expect(page.getByRole("cell", { name: "R$ 5.000,00", exact: true })).toBeVisible();

		// And the card one is charged to the card rather than to the account, which is
		// what puts it on an invoice. Which invoice is settled in the unit tests, because
		// it moves with the closing day and with what today happens to be.
		await expect(record(page, "Fatura de")).toContainText("Cartão de crédito");
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
