// The whole month on one page, for paper and for the PDF a browser writes.
//
// What is checked is that the page holds the month in the order it promises, that it
// names the file it wants to be, and that it says nothing a person is not allowed to see.

import { expect, test } from "@playwright/test";
import { go, openCofre } from "./support.ts";

test.describe("the month on paper", () => {
	test("holds the month in order, with a table under every figure", async ({ page }) => {
		await openCofre(page);
		await go(page, "Relatórios");
		await page.getByRole("link", { name: "Salvar em PDF" }).click();

		await expect(page.getByRole("heading", { level: 1 })).toContainText("Pessoal");

		// Every part of the file, in the order the month is read in.
		for (const part of [
			"O mês",
			"Cartões",
			"Por categoria",
			"Os últimos doze meses",
			"Guardar e metas",
			"Diagnóstico",
			"Os meses à frente",
			"Investimentos",
		]) {
			await expect(page.getByRole("heading", { name: part, exact: true })).toBeVisible();
		}

		// Nothing here is only a picture: every figure has a table it can be read from,
		// which is what makes the PDF the browser writes readable with a screen reader.
		expect(await page.getByRole("table").count()).toBeGreaterThan(5);
	});

	test("asks the browser to call the file what it is", async ({ page }) => {
		await openCofre(page);
		await page.goto("/relatorio?mes=2026-09");

		// Once the whole page is there, and not before.
		//
		// The document title is the only say this page has over the name the browser
		// suggests when somebody chooses to save as PDF, and the shell was writing its own
		// title over it the moment the space arrived. This assertion succeeds the first time
		// it matches, so asking straight after the address caught the moment before that and
		// passed while the file came out named after the tab.
		await expect(page.getByRole("heading", { level: 1 })).toContainText("Pessoal");
		await expect(page.getByRole("heading", { name: "Investimentos" })).toBeVisible();
		await expect(page).toHaveTitle("cofre_relatorio_2026-09");
	});

	test("reads a month already over as it stood on its last day", async ({ page }) => {
		await openCofre(page);
		await page.goto("/relatorio?mes=2026-08");

		// The day is written out, because this file is a document and not a table: it said
		// "como estavam em 2026-08-31" until the sweep before 1.1.0 read it as one.
		await expect(page.getByText(/como estavam em 31 de agosto de 2026/)).toBeVisible();
	});

	test("says nothing about the whole household to somebody who sees their own", async ({
		page,
	}) => {
		await openCofre(page);
		await page.goto("/relatorio?mes=2026-09");

		// The owner of the sample space sees everything, so the check up is in the file.
		await expect(page.getByRole("heading", { name: "Diagnóstico" })).toBeVisible();
		await expect(page.getByText("Só os seus lançamentos")).toHaveCount(0);
	});

	/**
	 * The same file in the other language, because a document is the one thing somebody
	 * hands to another person and a half translated page is worse than either language.
	 *
	 * The address decides, which is the first of the four answers in registry 0034, so this
	 * needs nothing stored and nothing about the machine running it.
	 */
	test("is the whole month in English too", async ({ page }) => {
		await openCofre(page);
		await page.goto("/relatorio?mes=2026-09&lang=en");

		for (const part of [
			"The month",
			"Cards",
			"By category",
			"The last twelve months",
			"Putting aside, and goals",
			"The check up",
			"The months ahead",
			"Investments",
		]) {
			await expect(page.getByRole("heading", { name: part, exact: true })).toBeVisible();
		}

		// And the name the browser suggests is the same either way, because it is a file name
		// and not a sentence.
		await expect(page).toHaveTitle("cofre_relatorio_2026-09");
	});

	/**
	 * Nothing in the file is a key, and no row is nameless.
	 *
	 * Money nobody sorted and spending with no priority on it are both ordinary, and both
	 * printed badly: an empty first cell against two thirds of a month, and a row headed
	 * `priority.null`. The screen next door had a sentence for each of them all along.
	 */
	test("names the money nobody sorted, in words", async ({ page }) => {
		await openCofre(page);
		await page.goto("/relatorio?mes=2026-08");

		await expect(page.getByText(/priority\./)).toHaveCount(0);
		await expect(page.getByText(/^[a-z]+\.[a-zA-Z]+$/)).toHaveCount(0);
		await expect(page.getByRole("cell", { name: "Sem categoria" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "Sem prioridade" })).toBeVisible();
	});

	test("reads a month already over in English as well", async ({ page }) => {
		await openCofre(page);
		await page.goto("/relatorio?mes=2026-08&lang=en");

		await expect(page.getByText(/as they stood on August 31, 2026/)).toBeVisible();
	});
});
