// Deciding money before spending it, and dividing what was spent together.

import { expect, test } from "@playwright/test";
import { go, openCofre, openSetting, record } from "./support.ts";

test.describe("the budget", () => {
	test("puts a limit on a category and says how it is doing", async ({ page }) => {
		await openCofre(page);
		await go(page, "Orçamento");

		await page.getByRole("button", { name: "Novo limite" }).first().click();
		// The radio itself is only for the screen reader, so a person clicks the label.
		await page.getByRole("dialog").getByText("Tudo", { exact: true }).click();
		await page.getByRole("dialog").getByLabel("Quanto por mês").fill("1.000,00");
		await page.getByRole("button", { name: "Salvar" }).click();

		// The demonstration data already spent something this month.
		const limit = page.getByRole("listitem").filter({ hasText: "Tudo" });
		await expect(limit).toBeVisible();
		await expect(limit).toContainText("R$ 1.000,00");
	});

	test("promises to save first and says whether the promise was kept", async ({ page }) => {
		await openCofre(page);
		await go(page, "Orçamento");

		await page.getByRole("button", { name: "Definir a regra" }).click();
		await page.getByRole("dialog").getByLabel("Porcentagem do que entra").fill("10");
		await page.getByRole("button", { name: "Salvar" }).click();

		// The demonstration person earned 6120, so the rule asks for 612.
		await expect(page.getByText("A regra é guardar 10 por cento")).toBeVisible();
		await expect(page.getByText("R$ 612,00")).toBeVisible();
		await expect(page.getByText("Ainda falta para cumprir")).toBeVisible();
	});

	test("keeps a goal and reads the account behind it", async ({ page }) => {
		await openCofre(page);

		// A place for the money to sit.
		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Reserva");
		await page.getByRole("dialog").getByLabel("Tipo").selectOption("savings");
		await page.getByRole("dialog").getByLabel("Saldo de abertura").fill("2.500,00");
		await page.getByRole("button", { name: "Salvar" }).click();

		await go(page, "Orçamento");
		await page.getByRole("button", { name: "Nova meta" }).click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Reserva de emergência");
		await page.getByRole("dialog").getByLabel("Quanto", { exact: true }).fill("10.000,00");
		await page
			.getByRole("dialog")
			.getByLabel("Onde o dinheiro fica")
			.selectOption({ label: "Reserva" });
		await page.getByRole("button", { name: "Salvar" }).click();

		const goal = page.getByRole("listitem").filter({ hasText: "Reserva de emergência" });
		await expect(goal).toContainText("R$ 2.500,00");
		await expect(goal).toContainText("R$ 10.000,00");
	});
});

test.describe("dividing with the house", () => {
	test("splits an expense and clears the debt", async ({ page }) => {
		await openCofre(page);

		// The demonstration data comes with a shared space and a second person in it.
		await openSetting(page, "Gerenciar espaços");
		await page.getByRole("button", { name: "Entrar" }).click();
		await expect(page.getByRole("banner")).toContainText("Casa");

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("200,00");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Conta de luz da casa");
		await page.getByRole("button", { name: "Salvar" }).click();

		await record(page, "Conta de luz da casa").getByRole("button", { name: "Ações" }).click();
		await page.getByRole("menuitem", { name: "Dividir com a casa" }).click();
		await page.getByRole("button", { name: "Salvar" }).click();

		// Who owes whom lives with the people, not with the money.
		await openSetting(page, "Membros");
		await expect(page.getByText("Para zerar")).toBeVisible();
		await expect(page.getByText("R$ 100,00").first()).toBeVisible();

		await page.getByRole("button", { name: "Marcar como pago" }).first().click();
		await expect(page.getByText("Ninguém deve nada a ninguém")).toBeVisible();
	});
});

test.describe("what needs attention", () => {
	test("says on the overview when a limit is over", async ({ page }) => {
		await openCofre(page);
		await go(page, "Orçamento");

		// A limit small enough that the demonstration month is already past it.
		await page.getByRole("button", { name: "Novo limite" }).first().click();
		// The radio itself is only for the screen reader, so a person clicks the label.
		await page.getByRole("dialog").getByText("Tudo", { exact: true }).click();
		await page.getByRole("dialog").getByLabel("Quanto por mês").fill("10,00");
		await page.getByRole("button", { name: "Salvar" }).click();

		await go(page, "Painel");
		await expect(page.getByText("O que precisa de atenção")).toBeVisible();
		await expect(page.getByText("passou do limite")).toBeVisible();
	});
});
