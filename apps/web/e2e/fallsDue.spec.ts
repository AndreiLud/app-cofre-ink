// What falls due, on the overview, the check up and the month on paper.
//
// Part 2, J of the request for 2.0.0. On the fixed day, with no three months behind it: R$
// 1.185,80 in the current account, a Nubank closing on the third and falling due on the tenth,
// October paid and R$ 2.300,00 on the invoice of the tenth of November, nothing written ahead.
// The overview said "Uma conta vence nos próximos quinze dias, de R$ 0,00. Você tem -R$
// 1.114,20, faltam R$ 1.114,20." and listed nothing.

import { expect, type Page, test } from "@playwright/test";
import { go, openCofre } from "./support.ts";

/** The case, written through the screens in an empty browser. */
async function theCase(page: Page): Promise<void> {
	await openCofre(page, { demo: false });
	await go(page, "Contas");
	const account = async (
		name: string,
		fill: (dialog: ReturnType<Page["getByRole"]>) => Promise<void>,
	) => {
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Nome").fill(name);
		await fill(dialog);
		await page.getByRole("button", { name: "Salvar" }).click();
		// The first: "Conta corrente" is also what the column of kinds calls a current account.
		await expect(page.getByRole("table").getByText(name, { exact: true }).first()).toBeVisible();
	};
	await account("Conta corrente", (dialog) =>
		dialog.getByLabel("Saldo de abertura").fill("1.185,80"),
	);
	await account("Nubank", async (dialog) => {
		await dialog.getByLabel("Tipo").selectOption("credit");
		await dialog.getByLabel("Dia do fechamento").selectOption("3");
		await dialog.getByLabel("Dia do vencimento").selectOption("10");
	});

	await go(page, "Lançamentos");
	await page.getByRole("button", { name: "Novo lançamento" }).first().click();
	const form = page.getByRole("dialog");
	await form.getByLabel("Pago com").selectOption({ label: "Nubank" });
	await form.getByLabel("Valor", { exact: true }).fill("2.300,00");
	await form.getByLabel("Descrição").fill("Compras do mês");
	await form.getByLabel("Dia").fill("2026-10-15");
	await page.getByRole("button", { name: "Salvar" }).click();
	await expect(form).toHaveCount(0);
}

/** The block of what needs attention on the overview. */
function attention(page: Page) {
	return page.locator("section").filter({ hasText: "O que precisa de atenção" });
}

test.describe("what falls due", () => {
	test("names the invoice, its days and the money in the accounts", async ({ page }) => {
		await theCase(page);
		await go(page, "Painel");

		await expect(attention(page)).toContainText(
			/A fatura do cartão Nubank, de R\$\s2\.300,00, vence em 13 dias\. Nas contas há R\$\s1\.185,80, faltam R\$\s1\.114,20\./,
		);
		await expect(attention(page)).not.toContainText("R$ 0,00");
		await expect(attention(page)).not.toContainText("Você tem");

		// And the list of what falls due shows that invoice.
		const due = page.locator("section#vence");
		await expect(due).toContainText("Fatura do cartão Nubank");
		await expect(due).toContainText(/2\.300,00/);

		// The same sentence in English.
		await page.goto("/?lang=en");
		await expect(page.locator("section").filter({ hasText: "What needs attention" })).toContainText(
			/The Nubank card invoice, of R\$\s?2,300\.00, falls due in 13 days\. Your accounts hold R\$\s?1,185\.80, which is R\$\s?1,114\.20 short\./,
		);
	});

	test("says the days left between the closing and the due day", async ({ page }) => {
		await theCase(page);
		// The fifth of November: the invoice closed on the third and falls due on the tenth.
		await page.clock.setFixedTime(new Date("2026-11-05T12:00:00-03:00"));
		await page.reload();
		await go(page, "Painel");
		await expect(attention(page)).toContainText(/vence em 5 dias/);
	});

	test("says nothing when the cards owe more than the bank and nothing falls due", async ({
		page,
	}) => {
		await theCase(page);
		// The twentieth of October: the invoice falls due in twenty one days, past the fifteen.
		await page.clock.setFixedTime(new Date("2026-10-20T12:00:00-03:00"));
		await page.reload();
		await go(page, "Painel");
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
		await expect(page.getByText(/vence em|contas vencem|faltam R\$/)).toHaveCount(0);
	});

	test("puts what is short on the month on paper, now and not in a month gone", async ({
		page,
	}) => {
		await theCase(page);
		await page.goto("/relatorio?mes=2026-10");
		const signs = page.getByRole("table", { name: "Os quatro sinais" });
		await expect(signs.getByRole("row").filter({ hasText: "O que vence agora" })).toContainText(
			"Ruim",
		);
		await expect(page.getByText(/1\.114,20/).first()).toBeVisible();

		await page.goto("/relatorio?mes=2026-09");
		await expect(signs.getByRole("row").filter({ hasText: "O que vence agora" })).toContainText(
			"Bom",
		);
	});
});
