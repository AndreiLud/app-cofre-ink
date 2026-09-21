// Writing money down, which is the thing the product exists to make fast.

import { expect, test } from "@playwright/test";
import { nav, openCofre, total } from "./support.ts";

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

		await expect(page.getByRole("cell", { name: "Mercado do bairro" })).toBeVisible();
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
		await expect(page.getByRole("cell", { name: "Geladeira 1/3" })).toBeVisible();

		await page.getByLabel("Mês").fill("2026-10");
		await expect(page.getByRole("cell", { name: "Geladeira 2/3" })).toBeVisible();

		await page.getByLabel("Mês").fill("2026-11");
		await expect(page.getByRole("cell", { name: "Geladeira 3/3" })).toBeVisible();
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

		await expect(page.getByRole("cell", { name: "Aluguel" })).toBeVisible();

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

		await page.getByLabel("Buscar").fill("padaria");
		await expect(page.getByRole("cell", { name: "Padaria da esquina" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "Farmácia" })).toHaveCount(0);
	});
});
