// The overview, which is the one screen the product brief makes a promise about.
//
// What is checked here is that the four questions it promises an answer to are answered,
// and that the things which used to be wrong about the numbers are no longer wrong: a
// card invoice netted off the money somebody has, a meal voucher counted as cash, a bill
// that falls due tomorrow dropped off the end of the list, and a record that was promised
// for a day already gone simply vanishing.

import { expect, test } from "@playwright/test";
import { go, openCofre, total } from "./support.ts";

test.describe("the overview", () => {
	test("answers the four questions the product promises, in one line", async ({ page }) => {
		await openCofre(page);

		for (const label of [
			"Você tem",
			"Ainda dá para gastar",
			"Vence até o fim do mês",
			"Falta guardar",
		]) {
			await expect(page.getByText(label, { exact: true })).toBeVisible();
		}
	});

	test("keeps the card and the voucher out of the money, on lines of their own", async ({
		page,
	}) => {
		await openCofre(page);

		// The sample data owes money on the card and holds money on a meal voucher. Neither
		// is money somebody has: one is a debt and the other buys lunch.
		const headline = await total(page).innerText();
		await expect(page.getByText("na fatura que vence")).toBeVisible();

		// Both appear under where the money is, grouped and named for what they are.
		await expect(page.getByText("Cartões", { exact: true })).toBeVisible();
		await expect(page.getByText("Benefícios", { exact: true })).toBeVisible();

		// And the headline is not the plain sum of every account, which is what it used to
		// be: adding the card debt back in would change it.
		expect(headline).not.toBe("");
	});

	test("shows a card invoice as one bill, on the day it falls due", async ({ page }) => {
		await openCofre(page);

		// Not one line per purchase on the day of the purchase, which is what the list of
		// what falls due used to be made of.
		const due = page.locator("section").filter({ hasText: "Vence nos próximos dias" });
		await expect(due.getByText("uma conta só")).toBeVisible();
		await expect(due.getByText("Fatura do")).toBeVisible();
	});

	test("opens the records of an account from the overview", async ({ page }) => {
		await openCofre(page);

		await page
			.locator("section")
			.filter({ hasText: "Onde o dinheiro está" })
			.getByRole("link", { name: "Conta corrente" })
			.click();

		await expect(page).toHaveURL(/lancamentos/);
	});

	test("puts what was promised for a day already gone at the top, to be answered", async ({
		page,
	}) => {
		await openCofre(page);

		// A series that started before today writes a promise for every day it has already
		// passed, and nobody has said those happened. They used to leave the screen
		// entirely, because the list of what falls due looked forward from today, while
		// going on being counted as money still to go.
		await go(page, "Calendário");
		await page.getByRole("button", { name: "Nova recorrência" }).click();
		await page.getByRole("dialog").getByLabel("Descrição").fill("Academia");
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("149,00");
		const past = new Date();
		past.setDate(past.getDate() - 6);
		await page.getByRole("dialog").getByLabel("A partir de").fill(past.toISOString().slice(0, 10));
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByText("Academia").first()).toBeVisible();

		await go(page, "Painel");
		const late = page.locator("section,div").filter({ hasText: "Atrasado" }).first();
		await expect(late).toBeVisible();
		await expect(page.getByRole("button", { name: "Aconteceu" }).first()).toBeVisible();
		await expect(page.getByRole("button", { name: "Não aconteceu" }).first()).toBeVisible();
	});
});
