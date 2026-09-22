// What happens again, and what gets sorted without anybody being asked.

import { expect, test } from "@playwright/test";
import { nav, openCofre, record } from "./support.ts";

test.describe("the calendar", () => {
	test("shows the month with what is already in it", async ({ page }) => {
		await openCofre(page);
		await nav(page, "Calendário").click();

		await expect(page.getByRole("heading", { level: 1 })).toContainText("mês");
		// The demonstration data bought a few things this month.
		await expect(page.getByText("Café da esquina").first()).toBeVisible();
	});

	test("puts what repeats on the days it falls due", async ({ page }) => {
		await openCofre(page);
		await nav(page, "Calendário").click();

		await page.getByRole("button", { name: "Nova recorrência" }).click();
		await page.getByRole("dialog").getByLabel("Descrição").fill("Aluguel do mês");
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("1.450,00");
		await page.getByRole("button", { name: "Salvar" }).click();

		// It shows up in the list of what repeats, with the day it happens next.
		await expect(page.getByRole("listitem").filter({ hasText: "Aluguel do mês" })).toContainText(
			"Todo mês",
		);

		// And the calendar itself now carries it, as something that has not happened.
		await expect(page.getByText("Aluguel do mês").first()).toBeVisible();

		// The list of records shows it as planned, not as money that moved.
		await nav(page, "Lançamentos").click();
		await expect(record(page, "Aluguel do mês")).toContainText("Previsto");
	});

	test("writes the same day only once, however many times the screen is opened", async ({
		page,
	}) => {
		await openCofre(page);
		await nav(page, "Calendário").click();

		await page.getByRole("button", { name: "Nova recorrência" }).click();
		await page.getByRole("dialog").getByLabel("Descrição").fill("Internet");
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("120,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByText("Internet").first()).toBeVisible();

		await nav(page, "Painel").click();
		await nav(page, "Calendário").click();
		await nav(page, "Lançamentos").click();

		await expect(record(page, "Internet")).toHaveCount(1);
	});
});

test.describe("rules", () => {
	test("learns from one record and sorts the next one on its own", async ({ page }) => {
		await openCofre(page);
		await nav(page, "Lançamentos").click();

		// One record, sorted by hand.
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("42,90");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Ifood da noite");
		await page
			.getByRole("dialog")
			.getByLabel("Categoria", { exact: true })
			.selectOption({ label: "  Delivery" });
		await page.getByRole("button", { name: "Salvar" }).click();

		// Teaching it takes one click from the record itself.
		await record(page, "Ifood da noite").getByRole("button", { name: "Ações" }).click();
		await page.getByRole("menuitem", { name: "Sempre categorizar assim" }).click();
		await expect(page.getByText("Pronto.")).toBeVisible();

		// The next one arrives sorted, without anybody choosing.
		await page.getByLabel("Lançamento rápido").fill("ifood da noite 38,00 hoje");
		await page.getByRole("button", { name: "Lançar", exact: true }).click();

		await expect(record(page, "-R$ 38,00")).toContainText("Delivery");
	});

	test("shows the rule on the categories screen and sorts the old records", async ({ page }) => {
		await openCofre(page);

		// A record nobody sorted, written before the rule exists.
		await nav(page, "Lançamentos").click();
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("25,00");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Uber para o centro");
		await page.getByRole("button", { name: "Salvar" }).click();

		await nav(page, "Categorias").click();
		await page.getByRole("button", { name: "Nova regra" }).click();
		await page.getByRole("dialog").getByLabel("Quando a descrição tiver").fill("uber");
		await page
			.getByRole("dialog")
			.getByLabel("Vai para")
			.selectOption({ label: "  Aplicativo e táxi" });
		await page.getByRole("button", { name: "Salvar" }).click();

		await expect(page.getByRole("listitem").filter({ hasText: "Quando tiver uber" })).toBeVisible();

		await page.getByRole("button", { name: "Aplicar nos antigos" }).click();
		await expect(page.getByText("Categorizei 1 lançamento")).toBeVisible();

		await nav(page, "Lançamentos").click();
		await expect(record(page, "Uber para o centro")).toContainText("Aplicativo e táxi");
	});
});
