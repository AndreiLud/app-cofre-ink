// Moving money between two accounts of the same person, which is not spending and not
// money coming in, and which used to be the third kind on the form for a record.

import { expect, type Page, test } from "@playwright/test";
import { figure, go, openCofre } from "./support.ts";

/** An amount as the screen writes it, in cents, sign included. */
function cents(text: string): number {
	const digits = Number(text.replace(/\D/g, ""));
	return text.includes("-") ? -digits : digits;
}

/** What an account holds now, read from its row on the accounts screen. */
async function balanceOf(page: Page, name: string): Promise<number> {
	const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) });
	return cents(await row.getByRole("cell").nth(3).innerText());
}

test.describe("moving money between accounts", () => {
	// Part 2, A.8.1 of the request for 2.0.0, and decision 1: the form for a record has money
	// out and money in, a spend that was really money put aside opens Move between accounts
	// with what was typed, and the move of the sample opens with both of its ends.
	test("keeps two kinds on the form and hands a move over with what was typed", async ({
		page,
	}) => {
		await openCofre(page);
		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		const kinds = form.getByRole("group", { name: "Tipo" }).getByRole("radio");
		await expect(kinds).toHaveCount(2);
		await expect(form.getByRole("group", { name: "Tipo" })).toContainText("Saída");
		await expect(form.getByRole("group", { name: "Tipo" })).toContainText("Entrada");
		await expect(form.getByText("Transferência")).toHaveCount(0);

		await form.getByLabel("Valor", { exact: true }).fill("250,00");
		await form.getByLabel("Descrição").fill("Para a reserva");
		await form.getByRole("button", { name: "use Mover entre contas." }).click();

		const move = page.getByRole("dialog");
		await expect(move.getByRole("heading", { name: "Mover entre contas" })).toBeVisible();
		await expect(move.getByLabel("Valor", { exact: true })).toHaveValue("250,00");
		await expect(move.getByLabel("Descrição")).toHaveValue("Para a reserva");
		await move.getByRole("button", { name: "Cancelar" }).click();

		// The sample's own move, from the current account into the wallet.
		const sample = page.getByRole("row").filter({ hasText: "Guardar um pouco" });
		await sample.getByRole("button", { name: "Ações" }).click();
		await page.getByRole("menuitem", { name: "Editar" }).click();
		const editing = page.getByRole("dialog");
		await expect(editing.getByLabel("Sai de").locator("option:checked")).toHaveText(
			"Conta corrente",
		);
		await expect(editing.getByLabel("Entra em").locator("option:checked")).toHaveText("Carteira");
		await expect(
			editing.getByLabel("Sai de").locator("option", { hasText: "Cartão de crédito" }),
		).toHaveCount(0);
		await editing.getByLabel("Valor", { exact: true }).fill("1.200,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(editing).toHaveCount(0);
		await expect(sample).toContainText("R$ 1.200,00");
	});

	// Part 2, A.8.2 of the request for 2.0.0: a savings account and a rule of putting 500
	// aside in it, which the sample has neither of, and 500 moved from the current account.
	test("puts money aside without calling it spending or money coming in", async ({ page }) => {
		await openCofre(page);

		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Reserva");
		await page.getByRole("dialog").getByLabel("Tipo").selectOption("savings");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Reserva", exact: true })).toBeVisible();

		await go(page, "Orçamento");
		await page.getByRole("button", { name: "Definir a regra" }).click();
		const rule = page.getByRole("dialog");
		await rule.getByText("Um valor fixo", { exact: true }).click();
		await rule.getByLabel("Valor por mês").fill("500,00");
		await rule.getByLabel("Vai para").selectOption({ label: "Reserva" });
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByText("A regra é guardar")).toBeVisible();

		await go(page, "Painel");
		const saved = page.getByText(/Guardados R\$/);
		await expect(saved).toContainText("Guardados R$ 0,00");
		const cameIn = await figure(page, "Entrou").innerText();
		const wentOut = await figure(page, "Saiu").innerText();
		const canSpend = cents(await figure(page, "Ainda dá para gastar").innerText());

		await go(page, "Contas");
		const checking = await balanceOf(page, "Conta corrente");
		await page
			.getByRole("row")
			.filter({ has: page.getByRole("cell", { name: "Conta corrente", exact: true }) })
			.getByRole("button", { name: "Ações da conta" })
			.click();
		await page.getByRole("menuitem", { name: "Mover dinheiro daqui" }).click();

		const move = page.getByRole("dialog");
		const from = move.getByLabel("De", { exact: true });
		const to = move.getByLabel("Para", { exact: true });
		await expect(from.locator("option:checked")).toHaveText("Conta corrente");
		// Only money somebody can spend leaves; a benefit card can be topped up as well.
		for (const never of ["Cartão de crédito", "Vale refeição", "Corretora"]) {
			await expect(from.locator("option", { hasText: never })).toHaveCount(0);
		}
		for (const never of ["Cartão de crédito", "Corretora", "Conta corrente"]) {
			await expect(to.locator("option", { hasText: never })).toHaveCount(0);
		}
		await expect(to.locator("option", { hasText: "Vale refeição" })).toHaveCount(1);

		await to.selectOption({ label: "Reserva" });
		await move.getByLabel("Valor", { exact: true }).fill("500,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(move).toHaveCount(0);

		// The page read again, because the clock of the suite stands still and nothing goes
		// stale by itself.
		await page.reload();
		await expect(page.getByRole("cell", { name: "Reserva", exact: true })).toBeVisible();
		await expect.poll(() => balanceOf(page, "Conta corrente")).toBe(checking - 50_000);

		await go(page, "Painel");
		await expect(saved).toContainText("Guardados R$ 500,00");
		await expect(figure(page, "Entrou")).toHaveText(cameIn);
		await expect(figure(page, "Saiu")).toHaveText(wentOut);
		expect(cents(await figure(page, "Ainda dá para gastar").innerText())).toBeLessThanOrEqual(
			canSpend,
		);
	});
});
