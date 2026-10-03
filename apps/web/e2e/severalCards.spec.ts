// More than one card, in every list that offers one and on every screen that adds them up.

import { expect, test } from "@playwright/test";
import { dayField, go, openCofre, record } from "./support.ts";

test.describe("more than one card", () => {
	// Part 2, B.1.1 and B.1.4 of the request for 2.0.0: the form that writes a card down gives
	// the plastic the name of its account, so the current account "Nubank" and the card "Nubank"
	// were two lines that read the same in "Pago com".
	test("tells the card and the current account of one bank apart", async ({ page }) => {
		await openCofre(page, { demo: false });
		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Nubank");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Nubank", exact: true })).toHaveCount(1);
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Nome").fill("Nubank");
		await dialog.getByLabel("Tipo").selectOption("credit");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Nubank", exact: true })).toHaveCount(2);

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const paidWith = page.getByRole("dialog").getByLabel("Pago com");
		await expect(paidWith.locator('optgroup[label="Cartões"] option')).toHaveText(["Nubank"]);
		await expect(paidWith.locator('optgroup[label="Contas"] option')).toHaveText(["Nubank"]);
	});

	// Part 2, B.1.2: a credit account no plastic reaches, after its card was removed, was
	// missing from "Pago com" altogether.
	test("pays with a credit account whose card was removed, and writes it with no card", async ({
		page,
	}) => {
		await openCofre(page);
		await go(page, "Contas");
		await page
			.getByRole("row")
			.filter({ has: page.getByRole("cell", { name: "Cartão de crédito", exact: true }) })
			.getByRole("button", { name: "Ações da conta" })
			.click();
		await page.getByRole("menuitem", { name: "Editar cartão Cartão do banco" }).click();
		await page.getByRole("button", { name: "Apagar cartão" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(0);

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		const paidWith = form.getByLabel("Pago com");
		await expect(
			paidWith.locator('optgroup[label="Cartões"] option', { hasText: "Cartão de crédito" }),
		).toHaveCount(1);
		await paidWith.selectOption({ label: "Cartão de crédito" });
		await form.getByLabel("Valor", { exact: true }).fill("80,00");
		await form.getByLabel("Descrição").fill("Padaria");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);
		await expect(record(page, "Padaria")).toContainText("Cartão de crédito");
	});

	// Part 2, B.1.3: a payment said "Pagamento da fatura de 2026-11", and with two cards
	// nothing said which card it paid.
	test("names the month and the card a payment paid", async ({ page }) => {
		await openCofre(page);
		await go(page, "Faturas");
		await page.getByRole("button", { name: "Pagar fatura" }).click();
		await page.getByRole("dialog").getByLabel("Dia").fill(dayField(0));
		await page.getByRole("dialog").getByRole("button", { name: "Pagar fatura" }).click();
		await expect(page.getByRole("heading", { level: 1 })).toContainText("está paga");

		await go(page, "Lançamentos");
		await expect(
			record(page, "Pagamento da fatura de novembro de 2026 (Cartão de crédito)"),
		).toHaveCount(1);
	});
});
