// The other way of writing a month down: three numbers instead of a list.
//
// What matters here is not that the fields accept text. It is that what they write are
// ordinary records, that the rest of the application picks them up, that typing the same
// month a second time corrects those records rather than writing three more, and that
// the card ends the month paid rather than owing the invoice forever.

import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { go, openCofre, record } from "./support.ts";

/**
 * The row of one record, matched case sensitively.
 *
 * The plain helper takes a string, and a string is matched without case, so "Fatura de"
 * would also find "Pagamento da fatura de" and every assertion about one of the two
 * would be about both.
 */
function row(page: Page, text: RegExp) {
	return page.getByRole("row").filter({ hasText: text });
}

/**
 * What the overview says is in one account right now.
 *
 * Scoped to the panel that lists the accounts, because the name of a card also turns up
 * in the line of what falls due, where it names an invoice and not a balance.
 */
async function balanceOf(page: Page, account: string): Promise<string> {
	await go(page, "Painel");
	const row = page
		.locator("section")
		.filter({ hasText: "Onde o dinheiro está" })
		.getByRole("listitem")
		.filter({ hasText: account });
	await expect(row).toBeVisible();
	return (await row.innerText()).replace(/\s+/g, " ");
}

test.describe("a month in three numbers", () => {
	test("writes the records, and the rest of the application reads them", async ({ page }) => {
		await openCofre(page);

		const cardBefore = await balanceOf(page, "Cartão de crédito");

		await go(page, "O mês");
		await page.getByLabel("Quanto entrou").fill("5.000,00");
		await page.getByLabel("Quanto você gastou").fill("2.200,50");
		await page.getByLabel("Fatura do cartão Cartão de crédito").fill("1.800,00");
		await page.getByLabel("Em qual conta").selectOption({ label: "Conta corrente" });

		// What is left over is worked out before anything is written.
		await expect(page.getByText("R$ 999,50")).toBeVisible();

		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Está tudo no lugar de sempre")).toBeVisible();

		const written = page.getByRole("table");
		await expect(written).toContainText("Entradas de");
		await expect(written).toContainText("Gastos de");
		await expect(written).toContainText("Fatura de");
		await expect(written).toContainText("Pagamento da fatura de");

		// They are records like any other, so they are in the list with everything else.
		await go(page, "Lista");
		await expect(record(page, "Entradas de")).toBeVisible();
		await expect(page.getByRole("cell", { name: "R$ 5.000,00", exact: true })).toBeVisible();

		// The card one is charged to the card rather than to the account, which is what
		// puts it on an invoice. Which invoice is settled in the unit tests, because it
		// moves with the closing day and with what today happens to be.
		await expect(row(page, /Fatura de/)).toContainText("Cartão de crédito");

		// And the invoice is paid, so the card comes out of the month where it went in.
		// Without that record the account the wages arrive in would climb by the whole
		// invoice every month and the card would sink by the same amount.
		expect(await balanceOf(page, "Cartão de crédito")).toBe(cardBefore);

		// The payment names the invoice it pays, which is what the Pay invoice button on
		// the invoice screen does too. It used to name none, and a payment that names none
		// pays down the oldest invoice still owing, so somebody filling in three months out
		// of order had each payment land on a month it was not about.
		await go(page, "Faturas");
		await expect(page.getByText(/Paga|Paga em parte/).first()).toBeVisible();
	});

	test("says what the month already holds, so the same money is not counted twice", async ({
		page,
	}) => {
		await openCofre(page);

		// Written by hand, in the month the screen opens on. The demonstration data is
		// dated relative to today, so nothing here depends on what day it is.
		await go(page, "Lista");
		await page.getByLabel("Lançamento rápido").fill("mercado 120,00 hoje");
		await page.getByRole("button", { name: "Lançar", exact: true }).click();
		await expect(record(page, "mercado")).toBeVisible();

		await go(page, "O mês");
		await expect(page.getByText("Neste mês você também lançou um a um")).toBeVisible();
		await expect(page.getByText("Já lançado:")).toBeVisible();
	});

	test("corrects the same month instead of writing it twice", async ({ page }) => {
		await openCofre(page);
		await go(page, "O mês");

		await page.getByLabel("Quanto entrou").fill("4.000,00");
		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Está tudo no lugar de sempre")).toBeVisible();

		await page.getByLabel("Quanto entrou").fill("4.500,00");
		await page.getByRole("button", { name: "Guardar o mês" }).click();

		await go(page, "Lista");
		await expect(record(page, "Entradas de")).toHaveCount(1);
		await expect(page.getByRole("cell", { name: "R$ 4.500,00", exact: true })).toBeVisible();

		// An empty field is not a zero: it takes the record away.
		await go(page, "O mês");
		await page.getByLabel("Quanto entrou").fill("");
		await page.getByRole("button", { name: "Guardar o mês" }).click();

		await go(page, "Lista");
		await expect(record(page, "Entradas de")).toHaveCount(0);
	});

	test("takes the payment away with the invoice it paid", async ({ page }) => {
		await openCofre(page);
		await go(page, "O mês");

		await page.getByLabel("Fatura do cartão Cartão de crédito").fill("900,00");
		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Está tudo no lugar de sempre")).toBeVisible();
		await expect(page.getByRole("table")).toContainText("Pagamento da fatura de");

		await page.getByLabel("Fatura do cartão Cartão de crédito").fill("");
		await page.getByRole("button", { name: "Guardar o mês" }).click();

		await go(page, "Lista");
		await expect(row(page, /Fatura de/)).toHaveCount(0);
		await expect(row(page, /Pagamento da fatura de/)).toHaveCount(0);
	});

	// Part 2, B.5 of the request for 2.0.0: one invoice field for one card, so somebody with
	// two chose which invoice the month had, and saving again moved the invoice, its payment
	// and the account to whatever the screen opened on.
	test("keeps an invoice for each card, and each in its place when the month is saved again", async ({
		page,
	}) => {
		await openCofre(page, { demo: false });
		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		await page.getByLabel("Nome").fill("Banco");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Banco", exact: true })).toBeVisible();
		for (const [name, closes, due] of [
			["Nubank", "15", "22"],
			["Itaú", "25", "5"],
		] as const) {
			await page.getByRole("button", { name: "Nova conta" }).first().click();
			const card = page.getByRole("dialog");
			await card.getByLabel("Nome").fill(name);
			await card.getByLabel("Tipo").selectOption("credit");
			await card.getByLabel("Dia do fechamento").selectOption(closes);
			await card.getByLabel("Dia do vencimento").selectOption(due);
			await page.getByRole("button", { name: "Salvar" }).click();
			await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
		}

		await go(page, "O mês");
		await page.getByLabel("Quanto entrou").fill("6.000,00");
		await page.getByLabel("Quanto você gastou").fill("1.000,00");
		await page.getByLabel("Fatura do cartão Nubank").fill("1.800,00");
		await page.getByLabel("Fatura do cartão Itaú").fill("900,00");
		// Both invoices come off what is left over.
		await expect(page.getByText(/^Sobrou/)).toContainText("R$ 2.300,00");
		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Está tudo no lugar de sempre")).toBeVisible();

		// Opened again the next morning, and only what came in corrected.
		await page.reload();
		await go(page, "O mês");
		// Written back the way a field holds an amount, without the thousands.
		await expect(page.getByLabel("Fatura do cartão Nubank")).toHaveValue("1800,00");
		await expect(page.getByLabel("Fatura do cartão Itaú")).toHaveValue("900,00");
		await page.getByLabel("Quanto entrou").fill("6.500,00");
		await expect(page.getByText(/^Sobrou/)).toContainText("R$ 2.800,00");
		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Está tudo no lugar de sempre")).toBeVisible();

		await page.goto("/lancamentos?mes=tudo");
		await expect(row(page, /^.*Fatura de outubro de 2026 \(Nubank\)/)).toContainText("Nubank");
		await expect(row(page, /Fatura de outubro de 2026 \(Itaú\)/)).toContainText("Itaú");
		await expect(row(page, /Pagamento da fatura de outubro de 2026 \(Nubank\)/)).toContainText(
			"Banco → Nubank",
		);
		await expect(row(page, /Pagamento da fatura de outubro de 2026 \(Itaú\)/)).toContainText(
			"Banco → Itaú",
		);
		await expect(row(page, /Fatura de outubro/)).toHaveCount(2);
		await expect(row(page, /Pagamento da fatura de outubro/)).toHaveCount(2);
	});

	// Part 2, B.5.2 and B.5.5: a month written by 1.2.1 carries marks that name no card. It
	// opens with its invoice on the card, and saving it writes no second line.
	test("reads a month written before 2.0.0 and writes it again in place", async ({ browser }) => {
		const first = await browser.newContext({ acceptDownloads: true });
		const second = await browser.newContext({ acceptDownloads: true });
		try {
			const one = await first.newPage();
			await openCofre(one);
			await go(one, "O mês");
			await one.getByLabel("Fatura do cartão Cartão de crédito").fill("900,00");
			await one.getByRole("button", { name: "Guardar o mês" }).click();
			await expect(one.getByText("Está tudo no lugar de sempre")).toBeVisible();

			await go(one, "Dados");
			const download = one.waitForEvent("download");
			await one.getByRole("button", { name: "Baixar", exact: true }).first().click();
			const backup = JSON.parse(await readFile(await (await download).path(), "utf8")) as {
				spaces: { tables: Record<string, Record<string, unknown>[]> }[];
			};
			let rewritten = 0;
			for (const space of backup.spaces) {
				for (const record of space.tables.transactions ?? []) {
					const mark = String(record.external_id ?? "");
					// The marks as 1.2.1 wrote them, with no card.
					if (/^mes:\d{4}-\d{2}:(invoice|payment):/.test(mark)) {
						record.external_id = mark.split(":").slice(0, 3).join(":");
						rewritten += 1;
					}
				}
			}
			expect(rewritten).toBe(2);

			const page = await second.newPage();
			await openCofre(page, { demo: false });
			await go(page, "Dados");
			await page.getByLabel("Escolher arquivo").setInputFiles({
				name: "cofre_backup_da_versao_1_2_1.json",
				mimeType: "application/json",
				buffer: Buffer.from(JSON.stringify(backup)),
			});
			await page.getByRole("dialog").getByRole("button", { name: "Trazer de volta" }).click();
			await expect(page.getByText("Restaurado", { exact: true })).toBeVisible({ timeout: 20_000 });

			await go(page, "O mês");
			const field = page.getByLabel("Fatura do cartão Cartão de crédito");
			await expect(field).toHaveValue("900,00");
			await page.getByLabel("Quanto entrou").fill("100,00");
			await page.getByRole("button", { name: "Guardar o mês" }).click();
			await expect(page.getByText("Está tudo no lugar de sempre")).toBeVisible();

			await page.goto("/lancamentos?mes=tudo");
			await expect(row(page, /Fatura de outubro/)).toHaveCount(1);
			await expect(row(page, /Pagamento da fatura de outubro/)).toHaveCount(1);
		} finally {
			await first.close();
			await second.close();
		}
	});

	test("reads the month back against a usual one", async ({ page }) => {
		await openCofre(page);
		await go(page, "O mês");

		// The screen used to show the three numbers, their difference, and nothing else: the
		// one question the numbers are for, which is whether this month was a normal one, had
		// no answer anywhere in the product.
		const usual = page.locator("section").filter({ hasText: "Comparado com um mês comum" });
		await expect(usual).toBeVisible();
		await expect(usual).toContainText("num mês comum");
		await expect(usual).toContainText("neste");
	});

	test("ranks what the month went on, and leaves the typed totals out of it", async ({ page }) => {
		await openCofre(page);
		await go(page, "O mês");

		await page.getByLabel("Quanto você gastou").fill("2.200,00");
		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Está tudo no lugar de sempre")).toBeVisible();

		const took = page.locator("section").filter({ hasText: "No que foi" });
		await expect(took).toBeVisible();

		// The typed total is named apart rather than ranked. Counted in, it would be the top
		// line of the block, announcing that the month went on nothing in particular.
		await expect(took).toContainText("R$ 2.200,00");
		await expect(took).toContainText("um total que ninguém detalhou");
		await expect(took.getByRole("listitem").filter({ hasText: "R$ 2.200,00" })).toHaveCount(0);
	});

	test("says which limit the month has broken, read as a whole month", async ({ page }) => {
		await openCofre(page);

		await go(page, "Orçamento");
		await page.getByRole("button", { name: "Novo limite" }).first().click();
		await page.getByRole("dialog").getByText("Tudo", { exact: true }).click();
		await page.getByRole("dialog").getByLabel("Quanto por mês").fill("1.000,00");
		await page.getByRole("button", { name: "Salvar" }).click();

		await go(page, "O mês");
		await page.getByLabel("Quanto você gastou").fill("3.000,00");
		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Está tudo no lugar de sempre")).toBeVisible();

		// Read whole, with no pace: three typed numbers are a claim about the whole month, and
		// measuring them against how far through it today is would warn a household on the
		// third that it is spending ten times too fast.
		const limits = page.locator("div").filter({ hasText: "Limites perto de estourar" }).first();
		await expect(limits).toContainText("passou em");
		await expect(limits).toContainText("Lido como um mês inteiro");
	});

	test("refuses an amount it cannot read, and says nothing was typed", async ({ page }) => {
		await openCofre(page);
		await go(page, "O mês");

		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Escreva pelo menos um dos números.")).toBeVisible();

		// On the field that is wrong, and in the words every amount field uses. It used to
		// say one of three amounts could not be read without saying which, beside three
		// fields that looked identical.
		await page.getByLabel("Quanto entrou").fill("uns cinco mil");
		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Não consegui ler um dos valores.")).toHaveCount(0);

		const income = page.getByLabel("Quanto entrou");
		await expect(income).toHaveAttribute("aria-invalid", "true");
		await expect(page.getByText("Não consegui ler esse valor")).toBeVisible();

		// And the other two are not blamed for it.
		await expect(page.getByLabel("Quanto você gastou")).not.toHaveAttribute("aria-invalid", "true");

		// Corrected, it saves, and the sentence goes with it.
		await income.fill("5.000,00");
		await page.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(page.getByText("Não consegui ler esse valor")).toHaveCount(0);
	});
});
