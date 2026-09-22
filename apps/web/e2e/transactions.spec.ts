// Writing money down, which is the thing the product exists to make fast.

import { expect, test } from "@playwright/test";
import { nav, openCofre, record, total } from "./support.ts";

test.describe("records", () => {
	test("writes an expense and takes it off the balance", async ({ page }) => {
		await openCofre(page);

		const before = await total(page).innerText();

		await nav(page, "Lançamentos").click();
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();

		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("42,90");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Mercado do bairro");
		await page
			.getByRole("dialog")
			.getByLabel("Conta", { exact: true })
			.selectOption({ label: "Conta corrente" });
		await page.getByRole("button", { name: "Salvar" }).click();

		await expect(record(page, "Mercado do bairro")).toBeVisible();
		await expect(page.getByRole("cell", { name: "-R$ 42,90" })).toBeVisible();

		await nav(page, "Painel").click();
		await expect(total(page)).not.toHaveText(before);
	});

	test("splits a card purchase into parts that land on their own months", async ({ page }) => {
		await openCofre(page);

		await nav(page, "Lançamentos").click();
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();

		await page
			.getByRole("dialog")
			.getByLabel("Conta", { exact: true })
			.selectOption({ label: "Cartão de crédito" });
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("1.234,56");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Geladeira");
		await page.getByRole("dialog").getByLabel("Dia").fill("2026-09-05");
		await page.getByRole("dialog").getByLabel("Parcelas").selectOption("3");
		await page.getByRole("button", { name: "Salvar" }).click();

		await page.getByLabel("Mês").fill("2026-09");
		await expect(record(page, "Geladeira 1/3")).toBeVisible();

		await page.getByLabel("Mês").fill("2026-10");
		await expect(record(page, "Geladeira 2/3")).toBeVisible();

		await page.getByLabel("Mês").fill("2026-11");
		await expect(record(page, "Geladeira 3/3")).toBeVisible();
		await expect(page.getByRole("cell", { name: "-R$ 411,52" })).toBeVisible();
	});

	test("keeps what is planned out of the balance until it is paid", async ({ page }) => {
		await openCofre(page);

		await nav(page, "Lançamentos").click();
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();

		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("1.450,00");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Aluguel");
		await page
			.getByRole("dialog")
			.getByLabel("Conta", { exact: true })
			.selectOption({ label: "Conta corrente" });
		await page.getByRole("dialog").getByText("Ainda não aconteceu").click();
		await page.getByRole("button", { name: "Salvar" }).click();

		await expect(record(page, "Aluguel")).toBeVisible();

		await nav(page, "Painel").click();
		await expect(page.getByText("Depois do que está previsto:")).toBeVisible();

		// It falls due today, so the overview offers to settle it right there.
		await page.getByRole("button", { name: "Marcar como pago" }).first().click();
		await expect(page.getByText("Depois do que está previsto:")).toHaveCount(0);
	});

	test("finds a record by a word in its description", async ({ page }) => {
		await openCofre(page);

		await nav(page, "Lançamentos").click();
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("30,00");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Padaria da esquina");
		await page.getByRole("button", { name: "Salvar" }).click();

		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("80,00");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Farmácia");
		await page.getByRole("button", { name: "Salvar" }).click();

		// Typing into the screen behind a dialog that is still closing is a race, so
		// this waits for the dialog to be gone before touching the filters.
		await expect(page.getByRole("dialog")).toHaveCount(0);
		await page.getByLabel("Buscar").fill("padaria");
		await expect(record(page, "Padaria da esquina")).toBeVisible();
		await expect(record(page, "Farmácia")).toHaveCount(0);
	});

	test("writes a whole record from one line of text", async ({ page }) => {
		await openCofre(page);
		await nav(page, "Lançamentos").click();

		await page.getByLabel("Lançamento rápido").fill("pastel 63,40 ontem carteira");
		// What it understood is shown before anything is written.
		await expect(page.getByText("-R$ 63,40")).toBeVisible();

		await page.getByRole("button", { name: "Lançar", exact: true }).click();

		const row = record(page, "pastel");
		await expect(row).toBeVisible();
		await expect(row).toContainText("Carteira");

		// And it can be taken back without hunting for the record in the list.
		await page.getByRole("button", { name: "Desfazer" }).click();
		await expect(record(page, "pastel")).toHaveCount(0);
	});

	test("changes a selection of records in one go", async ({ page }) => {
		await openCofre(page);
		await nav(page, "Lançamentos").click();

		for (const [description, amount] of [
			["Conta de luz", "180,00"],
			["Conta de água", "90,00"],
		]) {
			await page.getByRole("button", { name: "Novo lançamento" }).first().click();
			await page
				.getByRole("dialog")
				.getByLabel("Valor", { exact: true })
				.fill(amount ?? "");
			await page
				.getByRole("dialog")
				.getByLabel("Descrição")
				.fill(description ?? "");
			await page.getByRole("dialog").getByText("Ainda não aconteceu").click();
			await page.getByRole("button", { name: "Salvar" }).click();
		}

		await page.getByRole("checkbox", { name: "Selecionar Conta de luz" }).check();
		await page.getByRole("checkbox", { name: "Selecionar Conta de água" }).check();
		await expect(page.getByText("2 selecionados")).toBeVisible();

		await page.getByRole("button", { name: "Marcar como pago" }).first().click();

		await expect(page.getByText("2 selecionados")).toHaveCount(0);
		await expect(record(page, "Conta de luz")).not.toContainText("Previsto");
		await expect(record(page, "Conta de água")).not.toContainText("Previsto");
	});

	test("keeps a filter and brings it back by name", async ({ page }) => {
		await openCofre(page);
		await nav(page, "Lançamentos").click();

		await page.getByLabel("Buscar").fill("cinema");
		await page.getByRole("button", { name: "Salvar este filtro" }).click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Lazer");
		await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();

		await expect(page.getByRole("dialog")).toHaveCount(0);
		await page.getByLabel("Buscar").fill("");
		await expect(record(page, "Salário")).toBeVisible();

		await page.getByRole("button", { name: "Lazer", exact: true }).click();
		await expect(page.getByLabel("Buscar")).toHaveValue("cinema");
		await expect(record(page, "Salário")).toHaveCount(0);
	});
});

test.describe("the card invoice", () => {
	test("says when it closes and what it will charge", async ({ page }) => {
		await openCofre(page);
		await nav(page, "Faturas").click();

		// The demonstration data buys on the card, so the invoice is not empty.
		await expect(page.getByRole("heading", { level: 1 })).toContainText("fatura");
		await expect(record(page, "Fone de ouvido 1/3")).toBeVisible();
	});
});
