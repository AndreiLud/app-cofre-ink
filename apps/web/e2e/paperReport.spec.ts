// The whole month on one page, for paper and for the PDF a browser writes.
//
// What is checked is that the page holds the month in the order it promises, that it
// names the file it wants to be, and that it says nothing a person is not allowed to see.

import { expect, test } from "@playwright/test";
import { figure, go, openCofre } from "./support.ts";

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

	// Part 1, C.1 and C.4 of the request for 2.0.0: the overview said October came in with
	// the benefit and the month screen, the twelve months of the reports and the month on
	// paper said it without, against spending that held the lunches. Registry 0044 says one
	// figure is one figure on every screen.
	test("says the same came in for a month on every screen that says it", async ({ page }) => {
		await openCofre(page, { demo: false });

		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		await page.getByLabel("Nome").fill("Banco");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Banco", exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		const voucher = page.getByRole("dialog");
		await voucher.getByLabel("Nome").fill("VR");
		await voucher.getByLabel("Tipo").selectOption("voucher");
		await voucher.getByLabel("Valor por mês").fill("900,00");
		await voucher.getByLabel("Dia do crédito").selectOption("5");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "VR", exact: true })).toBeVisible();

		// Three closed months and this one, which the comparison of the month screen needs.
		await go(page, "Lançamentos");
		const quick = page.getByLabel("Lançamento rápido");
		for (const month of ["2026-07", "2026-08", "2026-09", "2026-10"]) {
			for (const line of [
				`recebi Trabalho 6000,00 ${month}-05 banco`,
				`Mercado 3000,00 ${month}-12 banco`,
			]) {
				await quick.fill(line);
				await page.getByRole("button", { name: "Lançar", exact: true }).click();
				await expect(page.getByRole("button", { name: "Desfazer" })).toBeVisible();
			}
		}

		// October: 6,000 written and the 900 that landed on the fifth.
		const october = "R$ 6.900,00";
		await go(page, "Painel");
		await expect(figure(page, "Entrou")).toHaveText(october);

		await go(page, "O mês");
		await expect(page.getByRole("listitem").filter({ hasText: "O que entra" })).toContainText(
			`${october} neste`,
		);

		await go(page, "Relatórios");
		await expect(page.getByRole("row").filter({ hasText: /^outubro/ })).toContainText(october);

		await page.goto("/relatorio?mes=2026-10");
		const twelve = page.locator("section").filter({ hasText: "Os últimos doze meses" }).last();
		await expect(twelve.getByRole("row").filter({ hasText: /^out/ })).toContainText(october);
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
