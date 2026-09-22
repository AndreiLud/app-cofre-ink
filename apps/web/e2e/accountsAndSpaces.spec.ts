import { expect, test } from "@playwright/test";
import { go, openCofre, openSetting, total } from "./support.ts";

test.describe("accounts", () => {
	test("creates one and shows it with the amount that was typed", async ({ page }) => {
		await openCofre(page, { demo: false });

		await go(page, "Contas");
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

	test("makes the card of a credit account without asking twice", async ({ page }) => {
		await openCofre(page);

		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();

		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Nome").fill("Cartão da loja");
		await dialog.getByLabel("Tipo").selectOption("credit");
		await dialog.getByLabel("Quatro últimos dígitos").fill("5566");
		// One plastic that works both ways, said once, while the account is described.
		await dialog.getByRole("checkbox").check();
		await dialog.getByRole("button", { name: "Salvar" }).click();

		// It is a card already, with no second form to fill in.
		await expect(page.getByText("Final 5566")).toBeVisible();
		await expect(page.getByText("Múltiplo: Fatura de Cartão da loja")).toBeVisible();

		// And it is looked after from the account it belongs to, not from the list.
		await page
			.getByRole("row")
			.filter({ hasText: "Cartão da loja" })
			.getByRole("button", { name: "Ações da conta" })
			.click();
		await expect(
			page.getByRole("menuitem", { name: "Editar cartão Cartão da loja" }),
		).toBeVisible();
	});

	test("adds a card and lets one purchase choose where it lands", async ({ page }) => {
		await openCofre(page);

		await go(page, "Contas");

		// A card is added from the account it reaches, and from nowhere else.
		await page
			.getByRole("row")
			.filter({ hasText: "Cartão de crédito" })
			.getByRole("button", { name: "Ações da conta" })
			.click();
		await page.getByRole("menuitem", { name: "Adicionar cartão" }).click();

		// Opened from the invoice, so only the other side is asked about, and the kinds
		// offered are the two a credit account can be part of.
		const adding = page.getByRole("dialog");
		await adding.getByLabel("Tipo").selectOption("multiple");
		await expect(adding.getByLabel("Saldo que ele gasta")).toBeVisible();
		await adding.getByLabel("Nome").fill("Cartão novo");
		await adding.getByLabel("Quatro últimos dígitos").fill("7788");
		await adding.getByRole("button", { name: "Salvar" }).click();

		await expect(page.getByText("Final 7788")).toBeVisible();

		// The same plastic, used as credit: the purchase has to reach the invoice.
		await go(page, "Lista");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Valor", { exact: true }).fill("99,90");
		await dialog.getByLabel("Descrição").fill("Compra com o cartão novo");
		await dialog
			.getByLabel("Cartão", { exact: true })
			.selectOption({ label: "Cartão novo (Crédito)" });
		// Picking the plastic picked the account, which is the point of the picker.
		await expect(dialog.getByLabel("Conta", { exact: true })).toHaveValue(/.+/);
		await dialog.getByRole("button", { name: "Salvar" }).click();

		await go(page, "Faturas");
		await expect(page.getByText("Cartão novo (Final 7788)")).toBeVisible();
		await expect(page.getByRole("cell", { name: "Compra com o cartão novo" })).toBeVisible();
	});

	test("hides an archived account until it is asked for", async ({ page }) => {
		await openCofre(page);

		await go(page, "Contas");
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

		await go(page, "Contas");
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
