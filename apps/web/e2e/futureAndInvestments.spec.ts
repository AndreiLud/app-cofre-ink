// The months ahead, and the money put aside.
//
// Both screens answer a question with a number, so both tests check the number and not
// the shape of the page: does the projection say what a month is made of, and does a
// holding that was typed in turn into a portfolio that is worth something.

import { expect, type Page, test } from "@playwright/test";
import { go, openCofre, total } from "./support.ts";

test.describe("the months ahead", () => {
	test("says what each month is made of, and lets a scenario change it", async ({ page }) => {
		await openCofre(page);
		await go(page, "Projeção");

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

/** What the Banco Central answers, for the request it is: three days of the CDI at 0,050788%. */
async function bancoCentral(page: Page): Promise<void> {
	await page.route("**api.bcb.gov.br/**", async (route) => {
		const url = route.request().url();
		const body = url.includes("bcdata.sgs.12/")
			? [
					{ data: "28/09/2026", valor: "0.050788" },
					{ data: "29/09/2026", valor: "0.050788" },
					{ data: "30/09/2026", valor: "0.050788" },
				]
			: url.includes("bcdata.sgs.4391/")
				? [{ data: "01/09/2026", valor: "1.05" }]
				: [];
		await route.fulfill({
			status: 200,
			headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	});
}

/**
 * Opens the form, chooses what the holding is, and leaves the second step open, at the broker of
 * the demonstration, which since 2.0.0 is one of two investment accounts in it.
 */
async function newHolding(page: Page, product: string) {
	await page.getByRole("button", { name: "Novo investimento" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("button", { name: product, exact: true }).click();
	await dialog.getByLabel("Instituição").selectOption({ label: "Corretora" });
	return dialog;
}

/** What one row of the holdings says. */
function holdingRow(page: Page, name: string) {
	return page.getByRole("row").filter({ hasText: name }).first();
}

test.describe("what is put aside", () => {
	// Part 2, H.8 of 2.0.0: every holding was asked a quantity, a price today and a cost, so a
	// share kept the F of the fractional market and a caixinha was a quantity of one.
	test("writes a share down by its code and its average price, and takes a new price", async ({
		page,
	}) => {
		await openCofre(page);
		await go(page, "Investimentos");

		// The demonstration data comes with a couple of holdings, so the screen starts
		// with a portfolio rather than an explanation of one.
		await expect(holdingRow(page, "Tesouro Selic 2029")).toBeVisible();

		const dialog = await newHolding(page, "Ação");
		await dialog.getByLabel("Código").fill("petr4f");
		await dialog.getByLabel("Quantidade").fill("2");
		await dialog.getByLabel("Preço médio").fill("150,00");
		await page.getByRole("button", { name: "Salvar" }).click();

		// The code of the B3 in capitals and without the F, two shares at a hundred and fifty.
		const row = holdingRow(page, "PETR4");
		await expect(row).toContainText("R$ 300,00");
		await expect(page.getByText("PETR4F")).toHaveCount(0);

		// A new price is kept beside the old one rather than replacing the history.
		await row.getByRole("button", { name: "O que fazer com PETR4" }).click();
		await page.getByRole("menuitem", { name: "Atualizar valor" }).click();
		await page.getByRole("dialog").getByLabel("Preço de uma unidade").fill("160,00");
		await page.getByRole("button", { name: "Salvar" }).click();

		await expect(row).toContainText("R$ 320,00");
		await expect(row).toContainText("R$ 20,00");
	});

	// Part 2, H.5 and H.8.5 of 2.0.0: a caixinha grows by the CDI the Banco Central published,
	// and says up to which day.
	test("grows a caixinha by the CDI and says up to which day", async ({ page }) => {
		await bancoCentral(page);
		await openCofre(page);
		await go(page, "Investimentos");

		const dialog = await newHolding(page, "Caixinha");
		await dialog.getByLabel("Nome", { exact: true }).fill("Reserva");
		await expect(dialog.getByLabel("Quanto rende do CDI (%)")).toHaveValue("100");
		await dialog.getByLabel("Quanto colocou").fill("10000,00");
		await dialog.getByLabel("Quando colocou").fill("2026-09-28");
		await page.getByRole("button", { name: "Salvar" }).click();

		// Nothing fetched yet: what went in, and the screen says it has no indices.
		const row = holdingRow(page, "Reserva");
		await expect(row).toContainText("R$ 10.000,00");
		await expect(page.getByText("Ainda não tenho os índices")).toBeVisible();

		await page.getByRole("button", { name: "Atualizar os índices" }).click();

		// Three days of 0,050788% on ten thousand, each day the money was there included.
		await expect(row).toContainText("R$ 10.015,24");
		await expect(row).toContainText("calculado até 30/09/2026");
		// And against the CDI it is the CDI, to the cent.
		await expect(page.getByText("Somando, rendeu R$ 0,00 a mais que o CDI.")).toBeVisible();
	});

	// Found reading the code for the report of 2.0.0: a CDB, an LCI and an LCA asked "Quanto tem
	// hoje" whatever they followed, and one at the CDI stored that as money put in on the day it
	// was bought, so it grew from it and counted the yield twice.
	test("asks a CDB at the CDI what was put in, and one at the IPCA what it holds", async ({
		page,
	}) => {
		await openCofre(page);
		await go(page, "Investimentos");
		const dialog = await newHolding(page, "CDB ou RDB");
		await expect(dialog.getByLabel("Quanto colocou")).toBeVisible();
		await expect(dialog.getByLabel("Quanto tem hoje")).toHaveCount(0);
		await dialog.getByLabel("Rende por").selectOption("ipca");
		await expect(dialog.getByLabel("Quanto tem hoje")).toBeVisible();
	});

	test("says it has no indices before anybody asks for them", async ({ page }) => {
		await openCofre(page);
		await go(page, "Investimentos");

		const dialog = await newHolding(page, "Fundo");
		await dialog.getByLabel("Nome", { exact: true }).fill("Fundo");
		await dialog.getByLabel("Quantidade").fill("1");
		await dialog.getByLabel("Preço de uma unidade").fill("100,00");
		await page.getByRole("button", { name: "Salvar" }).click();

		// Nothing has been fetched, and the screen says so instead of drawing an empty
		// comparison.
		await expect(page.getByText("Ainda não tenho os índices")).toBeVisible();
		await expect(page.getByRole("button", { name: "Atualizar os índices" })).toBeVisible();
	});

	// Part 2, H.10.6 of 2.0.0: a goal in an investment account counted every holding of the
	// account, and its shortcut opened Move between accounts, which offers no investment account.
	test("keeps a goal in one caixinha, and puts money into it from the goal", async ({ page }) => {
		await openCofre(page);
		await go(page, "Investimentos");
		for (const [name, amount] of [
			["Viagem", "2000,00"],
			["Reserva", "5000,00"],
		]) {
			const dialog = await newHolding(page, "Caixinha");
			await dialog.getByLabel("Nome", { exact: true }).fill(name as string);
			await dialog.getByLabel("Quanto colocou").fill(amount as string);
			await page.getByRole("button", { name: "Salvar" }).click();
			await expect(page.getByRole("dialog")).toHaveCount(0);
		}

		await go(page, "Orçamento");
		await page.getByRole("button", { name: "Nova meta" }).click();
		const goal = page.getByRole("dialog");
		await goal.getByLabel("Nome").fill("Viagem");
		await goal.getByLabel("Quanto", { exact: true }).fill("5.000,00");
		await goal.getByLabel("Onde o dinheiro fica").selectOption({ label: "Corretora" });
		await goal.getByLabel("Em qual aplicação").selectOption({ label: "Viagem" });
		await page.getByRole("button", { name: "Salvar" }).click();

		// The caixinha alone, and not the Reserva or the rest of the broker.
		const line = page.getByRole("listitem").filter({ hasText: "Viagem" });
		await expect(line).toContainText("R$ 2.000,00");

		await line.getByRole("button", { name: "Pôr na meta" }).click();
		const guardar = page.getByRole("dialog");
		await expect(guardar.getByRole("heading", { name: "Guardar em Viagem" })).toBeVisible();
		await guardar.getByLabel("Quanto", { exact: true }).fill("300,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(guardar).toHaveCount(0);
		await expect(line).toContainText("R$ 2.300,00");
	});

	// Part 2, H.9.8 of 2.0.0: the overview, Accounts and Investments read the holdings under
	// two keys, so putting money into a caixinha changed one screen and not the other two.
	test("agrees on the overview, on Accounts and on Investments after Guardar", async ({ page }) => {
		await openCofre(page);
		await go(page, "Investimentos");

		const dialog = await newHolding(page, "Caixinha");
		await dialog.getByLabel("Nome", { exact: true }).fill("Viagem");
		await dialog.getByLabel("Quanto colocou").fill("1000,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(holdingRow(page, "Viagem")).toContainText("R$ 1.000,00");

		await go(page, "Painel");
		await expect(total(page)).toBeVisible();
		const before = await total(page).innerText();

		await go(page, "Investimentos");
		await holdingRow(page, "Viagem")
			.getByRole("button", { name: "O que fazer com Viagem" })
			.click();
		await page.getByRole("menuitem", { name: "Guardar" }).click();
		const guardar = page.getByRole("dialog");
		await guardar.getByLabel("Quanto", { exact: true }).fill("500,00");
		await expect(guardar.getByLabel("De onde sai o dinheiro")).toHaveValue(/.+/);
		await page.getByRole("button", { name: "Salvar" }).click();

		// The demonstration's Tesouro Selic at R$ 4.570,20, BOVA11 at R$ 1.184,40, HGLG11 at R$
		// 1.582,00 and the CDB at the R$ 2.000,00 put in, with no index fetched, and the caixinha at
		// R$ 1.500,00: the broker is worth R$ 10.836,60 on every screen. The screen adds the
		// caixinha of R$ 3.000,00 in the other investment account, R$ 13.836,60.
		await expect(holdingRow(page, "Viagem")).toContainText("R$ 1.500,00");
		await expect(page.getByRole("heading", { level: 1 })).toContainText("R$ 13.836,60");

		await go(page, "Contas");
		await expect(page.getByRole("row").filter({ hasText: "Corretora" })).toContainText(
			"R$ 10.836,60",
		);

		await go(page, "Painel");
		await expect(
			page
				.locator("section")
				.filter({ hasText: "Onde o dinheiro está" })
				.getByRole("link", { name: /Corretora/ }),
		).toContainText("R$ 10.836,60");
		// Money moved from the current account into a holding of the same person: what they
		// have is what it was.
		await expect(total(page)).toHaveText(before);
	});

	// Found reviewing the pictures of 2.0.0: "chegaria lá em 24 anos e 1 meses". The demonstration
	// with a caixinha of R$ 10.000,00 put in on the twenty eighth of September gets there in
	// twenty four years and one month.
	test("says one month in the singular, and leaves out a month of none", async ({ page }) => {
		await openCofre(page);
		await page.goto("/investimentos");
		await expect(
			page.getByText("chegaria lá em 25 anos e 4 meses.", { exact: false }),
		).toBeVisible();
		await page.getByRole("button", { name: "Novo investimento" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByRole("button", { name: "Caixinha", exact: true }).click();
		await dialog.getByLabel("Nome", { exact: true }).fill("Reserva");
		await dialog.getByLabel("Quanto colocou").fill("10.000,00");
		await dialog.getByLabel("Quando colocou").fill("2026-09-28");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(dialog).toHaveCount(0);
		await expect(page.getByText("chegaria lá em 24 anos e 1 mês.", { exact: false })).toBeVisible();
		await expect(page.getByText("1 meses", { exact: false })).toHaveCount(0);
	});
});
