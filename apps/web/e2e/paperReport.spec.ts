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

	// Part 1, C.2 of the request for 2.0.0: the flow of the reports took the income without the
	// benefit against spending that held the lunches, and drew the difference as money taken
	// from the reserves, under a sentence saying what came in counts the benefits.
	test("draws the benefit as a source of what came in", async ({ page }) => {
		await openCofre(page);
		await go(page, "Relatórios");
		const flow = page.locator("section").filter({ hasText: "Para onde o dinheiro foi" }).last();
		// In the drawing on a wide screen and in the lists on a narrow one.
		await expect(flow.getByText("Benefícios", { exact: true })).not.toHaveCount(0);
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
		// October, the month being lived in, which has every part. September no longer lists the
		// card of the sample data: it was written down in October with nothing on it by then
		// (part 1, F.3 of the request for 2.0.0).
		await page.goto("/relatorio?mes=2026-10&lang=en");

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
		await expect(page).toHaveTitle("cofre_relatorio_2026-10");
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
		// The demonstration sorts every record it writes, so the one nobody sorted is written
		// here: an expense of August with no category, and so with no priority either.
		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		await form.getByLabel("Valor", { exact: true }).fill("45,00");
		await form.getByLabel("Descrição").fill("Algo sem nome");
		await form.getByLabel("Dia").fill("2026-08-20");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);
		await page.goto("/relatorio?mes=2026-08");

		await expect(page.getByText(/priority\./)).toHaveCount(0);
		await expect(page.getByText(/^[a-z]+\.[a-zA-Z]+$/)).toHaveCount(0);
		await expect(page.getByRole("cell", { name: "Sem categoria" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "Sem prioridade" })).toBeVisible();
	});

	// Part 1, I.1 of the request for 2.0.0: the demonstration looked its rent and its bills up
	// as "Aluguel" and "Luz", which the starting set calls "Aluguel ou financiamento" and "Água,
	// luz e gás", so the file of September opened with R$ 1.693,00 nobody had sorted.
	test("sorts the rent and the bills of the demonstration", async ({ page }) => {
		await openCofre(page);
		await page.goto("/relatorio?mes=2026-09");
		await expect(page.getByRole("heading", { level: 1 })).toContainText("Pessoal");

		await expect(
			page.getByRole("row").filter({ hasText: "Aluguel ou financiamento" }).first(),
		).toContainText("R$ 1.480,00");
		await expect(
			page.getByRole("row").filter({ hasText: "Água, luz e gás" }).first(),
		).toContainText("R$ 213,00");
		await expect(page.getByRole("cell", { name: "Sem categoria" })).toHaveCount(0);
	});

	// Part 1, F of the request for 2.0.0: the file of September printed in October priced the
	// holdings written down in October at today's price, so its money at the end of the month
	// was R$ 21.279,90, which is R$ 15.525,30 and the R$ 5.754,60 the holdings are worth now.
	// And the check up read only July and August on the thirtieth, fewer than the three months
	// a reading needs, and said it could not tell yet while the overview had a finding.
	test("reads September as it stood on its last day, holdings and check up included", async ({
		page,
	}) => {
		await openCofre(page);
		await page.goto("/relatorio?mes=2026-09");
		await expect(page.getByRole("heading", { level: 1 })).toContainText("Pessoal");

		await expect(page.getByRole("row").filter({ hasText: "Dinheiro no fim do mês" })).toContainText(
			"R$ 15.525,30",
		);
		const holdings = page.locator("section").filter({ hasText: "Investimentos" }).last();
		await expect(
			holdings.getByText("Nenhuma aplicação existia em 30 de setembro de 2026."),
		).toBeVisible();
		await expect(page.getByText(/como estavam em 30 de setembro de 2026/)).toBeVisible();

		await expect(page.getByRole("table", { name: "Os quatro sinais" })).toBeVisible();
		await expect(page.getByText("Ainda não dá para dizer")).toHaveCount(0);

		// One sign in the whole file: the summary said "Saiu" with a minus over tables that
		// said the same money without one.
		const summary = page.getByRole("table", { name: "O resumo de setembro de 2026" });
		await expect(summary.getByRole("row").filter({ hasText: "Saiu" })).not.toContainText("-");

		// The month day by day, which the file never read.
		await expect(page.getByRole("heading", { name: "Dia a dia", exact: true })).toBeVisible();
	});

	// Part 1, F.8 of the request for 2.0.0, which waited for a holding with a day of its own: a
	// share bought in August is in the file of September at the price it was bought at, and the
	// sentence at the top covers it, because that price is from before the end of the month.
	test("reads a share bought in August in the file of September", async ({ page }) => {
		await openCofre(page);
		await go(page, "Investimentos");
		await page.getByRole("button", { name: "Novo investimento" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByRole("button", { name: "Ação", exact: true }).click();
		await dialog.getByLabel("Código").fill("ITSA4");
		await dialog.getByLabel("Quantidade").fill("10");
		await dialog.getByLabel("Preço médio").fill("30,00");
		await dialog.getByLabel("Quando colocou").fill("2026-08-10");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(0);

		await page.goto("/relatorio?mes=2026-09");
		const holdings = page.locator("section").filter({ hasText: "Investimentos" }).last();
		await expect(holdings.getByRole("row").filter({ hasText: "ITSA4" })).toContainText("R$ 300,00");
		await expect(holdings.getByText("Valia em 30 de setembro de 2026")).toBeVisible();
		await expect(page.getByText(/Sem preço anotado até o fim do mês/)).toHaveCount(0);
		await expect(
			page.getByText(/como estavam em 30 de setembro de 2026, o último dia do mês\./),
		).toBeVisible();
		// The broker is worth the share on that day, beside the R$ 15.525,30 of the accounts.
		await expect(page.getByRole("row").filter({ hasText: "Dinheiro no fim do mês" })).toContainText(
			"R$ 15.825,30",
		);
	});

	// Part 1, F.7 of the request for 2.0.0: a limit took its name from the spending of the month,
	// so one on a category with nothing spent in it printed an empty first cell.
	test("names a limit on a category with nothing spent in the month", async ({ page }) => {
		await openCofre(page);
		await go(page, "Orçamento");
		await page.getByRole("button", { name: "Novo limite" }).first().click();
		const dialog = page.getByRole("dialog");
		await dialog.getByText("Uma categoria", { exact: true }).click();
		await dialog.getByLabel("Categoria", { exact: true }).selectOption({ label: "Família" });
		await dialog.getByLabel("Quanto por mês").fill("500,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(dialog).toHaveCount(0);

		await page.goto("/relatorio?mes=2026-10");
		const limits = page.getByRole("table", { name: "Os limites de outubro de 2026" });
		await expect(limits.getByRole("row").filter({ hasText: "R$ 500,00" })).toContainText("Família");
	});

	test("reads a month already over in English as well", async ({ page }) => {
		await openCofre(page);
		await page.goto("/relatorio?mes=2026-08&lang=en");

		await expect(page.getByText(/as they stood on August 31, 2026/)).toBeVisible();
	});

	// Found reviewing the pictures of 2.0.0: the file of September in English wrote its months as
	// "Jul 26" and "Sep 26", and its days as "Sep 14" and "Sep 22", so a month read as a day.
	test("writes a month with its whole year, so it never reads as a day", async ({ page }) => {
		await openCofre(page);
		await page.goto("/relatorio?mes=2026-09&lang=en");
		await expect(page.getByRole("heading", { name: "The last twelve months" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "Sep 2026", exact: true })).toBeVisible();
		await expect(page.getByRole("cell", { name: "Jul 2026", exact: true })).toBeVisible();
		await expect(page.getByRole("cell", { name: "Sep 26", exact: true })).toHaveCount(0);
	});

	// Found reviewing the pictures of 2.0.0: the file of September, as it stood on the thirtieth,
	// said R$ 120,00 in parts were still to come until April 2027. They are the office chair of
	// the demonstration, bought in six on the seventeenth of October.
	test("leaves a plan bought after the month out of the months after it", async ({ page }) => {
		await openCofre(page);
		await page.goto("/relatorio?mes=2026-09");
		await expect(page.getByText(/como estavam em 30 de setembro de 2026/)).toBeVisible();
		await expect(page.getByRole("heading", { name: "Os meses à frente" })).toBeVisible();
		// The six months after September have been read, the last of them March of 2027.
		await expect(page.getByRole("cell", { name: /^mar\. de (20)?27$/ })).toBeVisible();
		// The space after R$ is the one that does not break.
		await expect(page.getByText(/ainda há R\$\s[\d.,]+ em parcelas/)).toHaveCount(0);
	});
});
