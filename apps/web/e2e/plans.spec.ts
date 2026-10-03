// Plans of up to forty eight parts, through the form. Part 2, section D of the request for 2.0.0,
// on the sample data and the fixed day of the suite, the twenty eighth of October of 2026.

import { expect, type Page, test } from "@playwright/test";
import { cents, go, openCofre } from "./support.ts";

/** Opens a new record on the card of the sample data, with an amount and a number of parts. */
async function onTheCard(page: Page, description: string, amount: string, parts: string) {
	await go(page, "Lançamentos");
	await page.getByRole("button", { name: "Novo lançamento" }).first().click();
	const form = page.getByRole("dialog");
	await form.getByLabel("Pago com").selectOption({ label: "Cartão do banco (Crédito)" });
	await form.getByLabel("Valor", { exact: true }).fill(amount);
	await form.getByLabel("Descrição").fill(description);
	await form.getByLabel("Parcelas").selectOption({ label: parts });
	return form;
}

/** The records of one month, by the month field of the list. */
async function month(page: Page, value: string) {
	await go(page, "Lançamentos");
	await page.getByLabel("Mês", { exact: true }).fill(value);
}

/** A figure on a card's line of the overview, as cents. */
async function onCardLine(page: Page, words: RegExp): Promise<number> {
	await go(page, "Painel");
	// Read fresh: the clock of the suite is fixed, so nothing on the page goes stale by itself.
	await page.reload();
	const line = page.locator("#cartoes").getByText(words).first();
	await expect(line).toBeVisible();
	return cents(await line.innerText());
}

test.describe("plans of up to forty eight parts", () => {
	// D.2.1: what each part comes to, said before it is written, the equal ones together.
	test("says what each of forty eight parts comes to, and the whole when the amount is each", async ({
		page,
	}) => {
		await openCofre(page);
		const form = await onTheCard(page, "Notebook", "1.000,00", "48 vezes");
		await expect(form).toContainText("16 de R$ 20,84 e 32 de R$ 20,83");

		await form.getByText("O valor é de cada parcela", { exact: true }).click();
		await form.getByLabel("Valor de cada parcela").fill("99,90");
		await expect(form).toContainText("Total R$ 4.795,20");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);

		await month(page, "2027-03");
		await expect(page.getByRole("row").filter({ hasText: "Notebook 6/48" })).toContainText(
			"-R$ 99,90",
		);
	});

	// D.2.2: forty eight parts on the card, to September 2030.
	test("writes R$ 2.400,00 in forty eight on the card, out to September 2030", async ({ page }) => {
		await openCofre(page);
		const laterBefore = await onCardLine(page, /em parcelas depois/);

		const form = await onTheCard(page, "Geladeira", "2.400,00", "48 vezes");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);

		await month(page, "2030-09");
		await expect(page.getByRole("row").filter({ hasText: "Geladeira 48/48" })).toContainText(
			"-R$ 50,00",
		);
		expect((await onCardLine(page, /em parcelas depois/)) - laterBefore).toBe(235_000);

		await go(page, "Diagnóstico");
		await expect(page.getByText(/comprometido em parcelas, até setembro de 2030/)).toBeVisible();
	});

	// D.3.4.3: bought on the twenty eighth of December of 2025, ten parts paid before.
	test("writes a plan from the part after the ones already paid", async ({ page }) => {
		await openCofre(page);
		const leftBefore = await onCardLine(page, /Ainda dá para gastar no cartão/);
		const form = await onTheCard(page, "Fogao", "2.400,00", "48 vezes");
		await form.getByLabel("Dia").fill("2025-12-28");
		await form.getByLabel("Já paguei").fill("10");
		await expect(form).toContainText(
			"A primeira que fica é a 11/48, em 28/10/2026, na fatura de novembro.",
		);
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);

		await month(page, "2026-10");
		await expect(page.getByRole("row").filter({ hasText: "Fogao 11/48" })).toContainText(
			"-R$ 50,00",
		);
		await month(page, "2029-11");
		await expect(page.getByRole("row").filter({ hasText: "Fogao 48/48" })).toBeVisible();
		await month(page, "2026-09");
		await expect(page.getByRole("row").filter({ hasText: "Fogao" })).toHaveCount(0);
		// Thirty eight parts of R$ 50,00 still to pay, and nothing of the ten paid before.
		expect(leftBefore - (await onCardLine(page, /Ainda dá para gastar no cartão/))).toBe(190_000);
	});

	// D.4: "tv 48x de 99,90" split R$ 99,90 into forty eight parts, and "freela +6120 3x" wrote
	// three incomes. The line says the plan before it is written and refuses what it cannot write.
	test("reads a plan off one line, says it, and takes all of it back", async ({ page }) => {
		await openCofre(page);
		await go(page, "Lançamentos");
		const quick = page.getByLabel("Lançamento rápido");
		const add = page.getByRole("button", { name: "Lançar", exact: true });

		await quick.fill("tv 48x de 99,90");
		await expect(page.getByText("48 parcelas de R$ 99,90, total R$ 4.795,20")).toBeVisible();
		await quick.fill("tv 2400 49x");
		await expect(page.getByText("Dá para parcelar em até 48 vezes.")).toBeVisible();
		await expect(add).toBeDisabled();
		await quick.fill("freela +6120 3x");
		await expect(page.getByText("Só saídas podem ser parceladas.")).toBeVisible();
		await expect(add).toBeDisabled();

		await quick.fill("geladeira 2400 48x");
		await expect(page.getByText("48 parcelas de R$ 50,00, total R$ 2.400,00")).toBeVisible();
		await add.click();
		await expect(page.getByText("Lancei geladeira em 48 parcelas.")).toBeVisible();
		await page.getByLabel("Mês", { exact: true }).fill("2030-09");
		await expect(page.getByRole("row").filter({ hasText: "geladeira 48/48" })).toBeVisible();

		await page.getByRole("button", { name: "Desfazer" }).click();
		await expect(page.getByRole("row").filter({ hasText: "geladeira" })).toHaveCount(0);
		await month(page, "2026-10");
		await expect(page.getByRole("row").filter({ hasText: "geladeira" })).toHaveCount(0);
	});

	// D.5.1: changing only the category of the whole plan rewrote the amount of every part with
	// the one of the part being edited, R$ 1.000,00 in forty eight becoming R$ 1.000,32.
	test("changes the category of a plan without rewriting what each part is worth", async ({
		page,
	}) => {
		await openCofre(page);
		const form = await onTheCard(page, "Monitor", "1.000,00", "48 vezes");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);

		await month(page, "2026-10");
		const first = page.getByRole("row").filter({ hasText: "Monitor 1/48" });
		await first.getByRole("button", { name: "Ações do lançamento" }).click();
		await page.getByRole("menuitem", { name: "Editar" }).click();
		const editing = page.getByRole("dialog");
		await editing.getByText("Esta e as próximas (48)", { exact: true }).click();
		await editing.getByLabel("Categoria").selectOption({ label: "Hobby" });
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(editing).toHaveCount(0);

		await month(page, "2028-02");
		await expect(page.getByRole("row").filter({ hasText: "Monitor 17/48" })).toContainText(
			"-R$ 20,83",
		);
	});
});
