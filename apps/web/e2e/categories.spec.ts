// Sorting money into categories, which is what turns a list of records into an answer.

import { expect, test } from "@playwright/test";
import { go, openCofre, record } from "./support.ts";

test.describe("categories", () => {
	test("starts with a set that is already usable", async ({ page }) => {
		await openCofre(page);
		await go(page, "Categorias");

		await expect(page.getByRole("heading", { level: 1 })).toContainText("Categorias");
		// A category that stands on its own, and one that hangs under it.
		await expect(page.getByRole("listitem").filter({ hasText: "Alimentação" })).toBeVisible();
		await expect(page.getByRole("listitem").filter({ hasText: "Mercado" })).toBeVisible();
		// The priority is on the same line, because it is the point of the screen.
		await expect(page.getByRole("listitem").filter({ hasText: "Delivery" })).toContainText(
			"Supérfluo",
		);
	});

	test("adds one of your own and sorts a record into it", async ({ page }) => {
		await openCofre(page);
		await go(page, "Categorias");

		await page.getByRole("button", { name: "Nova categoria" }).first().click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Padaria da rua");
		await page.getByRole("dialog").getByLabel("Prioridade").selectOption("desirable");
		await page
			.getByRole("dialog")
			.getByLabel("Fica dentro de")
			.selectOption({ label: "Alimentação" });
		await page.getByRole("button", { name: "Salvar" }).click();

		await expect(page.getByRole("listitem").filter({ hasText: "Padaria da rua" })).toContainText(
			"Desejável",
		);

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("18,00");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Pão e café");
		await page
			.getByRole("dialog")
			.getByLabel("Categoria", { exact: true })
			.selectOption({ label: "  Padaria da rua" });
		await page.getByRole("button", { name: "Salvar" }).click();

		const row = record(page, "Pão e café");
		await expect(row).toContainText("Padaria da rua");

		// And the filter finds it by that category.
		await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "  Padaria da rua" });
		await expect(record(page, "Pão e café")).toBeVisible();
		await expect(record(page, "Salário")).toHaveCount(0);
	});

	test("asking for a category asks for everything under it", async ({ page }) => {
		await openCofre(page);
		await go(page, "Lançamentos");

		// Alimentação has Mercado under it, and the demonstration data buys at one.
		await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "Alimentação" });
		await expect(record(page, "Feira da semana")).toBeVisible();
	});

	test("refuses a third level, and says why", async ({ page }) => {
		await openCofre(page);
		await go(page, "Categorias");

		await page.getByRole("button", { name: "Nova categoria" }).first().click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Hortifruti");
		// Mercado already hangs under Alimentação, so it cannot take one of its own.
		const parent = page.getByRole("dialog").getByLabel("Fica dentro de");
		await expect(parent.getByRole("option", { name: "Mercado", exact: true })).toHaveCount(0);
	});
});
