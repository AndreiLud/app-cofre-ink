import { expect, test } from "@playwright/test";
import { openCofre, openSetting, total } from "./support.ts";

test.describe("accounts", () => {
	test("creates one and shows it with the amount that was typed", async ({ page }) => {
		await openCofre(page, { demo: false });

		await page.getByRole("link", { name: "Contas" }).click();
		// The empty state offers the same action as the header, on purpose.
		await page.getByRole("button", { name: "Nova conta" }).first().click();

		await page.getByLabel("Nome").fill("Conta do banco");
		await page.getByLabel("Saldo de abertura").fill("1.234,56");
		await page.getByRole("button", { name: "Salvar" }).click();

		await expect(page.getByRole("cell", { name: "Conta do banco" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "R$ 1.234,56" })).toBeVisible();

		await page.getByRole("link", { name: "Painel" }).click();
		await expect(total(page)).toContainText("1.234,56");
	});

	test("hides an archived account until it is asked for", async ({ page }) => {
		await openCofre(page);

		await page.getByRole("link", { name: "Contas" }).click();
		await page.getByRole("button", { name: "Ações da conta" }).first().click();
		await page.getByRole("menuitem", { name: "Arquivar" }).click();

		// The same menu now offers the opposite, which is how this knows the write
		// landed before it goes looking for the consequence on another screen.
		await page.getByRole("button", { name: "Ações da conta" }).first().click();
		await expect(page.getByRole("menuitem", { name: "Desarquivar" })).toBeVisible();
		await page.keyboard.press("Escape");

		await page.getByRole("link", { name: "Painel" }).click();
		await expect(page.getByRole("listitem").filter({ hasText: "Carteira" })).toHaveCount(0);
	});
});

test.describe("spaces", () => {
	test("switches space and carries the accounts of that space", async ({ page }) => {
		await openCofre(page, { space: "Pessoal" });

		await openSetting(page, "Gerenciar espaços");
		await expect(page.getByRole("listitem").filter({ hasText: "Casa" })).toContainText(
			"Compartilhado",
		);

		await page.getByRole("button", { name: "Entrar" }).click();
		await expect(page.getByRole("banner")).toContainText("Casa");

		await page.getByRole("link", { name: "Contas" }).click();
		await expect(page.getByRole("cell", { name: "Conta conjunta" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "Carteira" })).toHaveCount(0);
	});

	test("says the personal space takes no members", async ({ page }) => {
		await openCofre(page);

		await openSetting(page, "Membros");
		await expect(
			page.getByText("Este espaço é só seu e não aceita membros", { exact: false }),
		).toBeVisible();
		await expect(page.getByRole("button", { name: "Convidar" })).toHaveCount(0);
	});

	test("shows who is in the shared space and with which role", async ({ page }) => {
		await openCofre(page);

		await openSetting(page, "Gerenciar espaços");
		await page.getByRole("button", { name: "Entrar" }).click();
		await openSetting(page, "Membros");

		await expect(page.getByRole("cell", { name: "Andrei (você)" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "Dono" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "João (exemplo)" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "Editor" })).toBeVisible();
	});
});
