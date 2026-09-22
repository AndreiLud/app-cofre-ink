// The months ahead, and the money put aside.
//
// Both screens answer a question with a number, so both tests check the number and not
// the shape of the page: does the projection say what a month is made of, and does a
// holding that was typed in turn into a portfolio that is worth something.

import { expect, test } from "@playwright/test";
import { nav, openCofre } from "./support.ts";

test.describe("the months ahead", () => {
	test("says what each month is made of, and lets a scenario change it", async ({ page }) => {
		await openCofre(page);
		await nav(page, "Projeção").click();

		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
		await expect(page.getByRole("table")).toBeVisible();

		// The balance of the last month, as it stands.
		const monthsAhead = page.getByLabel("Até quando");
		await monthsAhead.selectOption({ label: "6 meses" });
		const rows = page.getByRole("row");
		await expect(rows).toHaveCount(7);

		// The demonstration data has months behind it, so a month ahead has a habit in
		// it rather than nothing at all.
		const lastRow = page.getByRole("row").last();
		await expect(lastRow).toContainText("hábito");
		const asItIs = await lastRow.innerText();

		// A scenario is a question, and asking it writes nothing down.
		await page.getByRole("button", { name: "Novo cenário" }).click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Gastar menos");
		await page.getByRole("dialog").getByLabel("Em porcentagem").fill("-20");
		await page.getByRole("button", { name: "Salvar" }).click();

		// Exactly, because the button that deletes it is named after it too.
		await expect(page.getByRole("button", { name: "Gastar menos", exact: true })).toBeVisible();
		// The last month reads differently with the scenario applied.
		expect(await lastRow.innerText()).not.toBe(asItIs);

		// And going back to how it is brings the first number back.
		await page.getByRole("button", { name: "Como está" }).click();
		expect(await lastRow.innerText()).toBe(asItIs);
	});
});

test.describe("what is put aside", () => {
	test("adds a holding by hand and says what the portfolio is worth", async ({ page }) => {
		await openCofre(page);
		await nav(page, "Investimentos").click();

		// The demonstration data comes with a couple of holdings, so the screen starts
		// with a portfolio rather than an explanation of one.
		await expect(page.getByRole("cell", { name: "Tesouro Selic 2029" })).toBeVisible();
		const before = await page.getByRole("heading", { level: 1 }).innerText();

		await page.getByRole("button", { name: "Novo investimento" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Nome").fill("Ação da padaria");
		await dialog.getByLabel("Quantidade").fill("2");
		await dialog.getByLabel("Preço de hoje").fill("150,00");
		await dialog.getByLabel("Quanto custou no total").fill("280,00");
		await page.getByRole("button", { name: "Salvar" }).click();

		// Two units at a hundred and fifty is three hundred, and it cost two eighty, so
		// the gain is twenty.
		await expect(page.getByRole("cell", { name: "Ação da padaria" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "R$ 20,00" })).toBeVisible();
		expect(await page.getByRole("heading", { level: 1 }).innerText()).not.toBe(before);

		// A new price is kept beside the old one rather than replacing the history.
		const row = page.getByRole("row").filter({ hasText: "Ação da padaria" });
		await row.getByRole("button", { name: "Atualizar preço" }).click();
		await page.getByRole("dialog").getByLabel("Preço de hoje").fill("160,00");
		await page.getByRole("button", { name: "Salvar" }).click();

		await expect(row.getByRole("cell", { name: "R$ 320,00" })).toBeVisible();
	});

	test("says it has no indices before anybody asks for them", async ({ page }) => {
		await openCofre(page);
		await nav(page, "Investimentos").click();

		await page.getByRole("button", { name: "Novo investimento" }).click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Fundo");
		await page.getByRole("dialog").getByLabel("Preço de hoje").fill("100,00");
		await page.getByRole("button", { name: "Salvar" }).click();

		// Nothing has been fetched, and the screen says so instead of drawing an empty
		// comparison.
		await expect(page.getByText("Ainda não tenho os índices")).toBeVisible();
		await expect(page.getByRole("button", { name: "Atualizar os índices" })).toBeVisible();
	});
});
