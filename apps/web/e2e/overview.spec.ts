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

	test("says when a voucher renews, because the figure has to last until then", async ({
		page,
	}) => {
		await openCofre(page);

		// What is left on a meal card means nothing without the day the next one lands: three
		// hundred has to cover twenty days or two, and the line said neither.
		await expect(
			page.getByText(/O próximo crédito cai em \d\d\/\d\d, daqui a \d+ dias?\./),
		).toBeVisible();
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
		// On a fixed day, late enough in its month to have days behind it.
		//
		// A series never writes a record for a month before the one it was written down in,
		// which is the rule that stops a rent paid since 2019 arriving as six years of
		// promises. So "six days ago" produced no overdue promise at all whenever the suite
		// ran in the first days of a month, and this test went red for a reason that had
		// nothing to do with the screen it is about.
		await page.clock.setFixedTime(new Date("2026-10-20T12:00:00-03:00"));
		await openCofre(page);

		// A series that started before today writes a promise for every day it has already
		// passed, and nobody has said those happened. They used to leave the screen
		// entirely, because the list of what falls due looked forward from today, while
		// going on being counted as money still to go.
		await go(page, "Calendário");
		await page.getByRole("button", { name: "Nova recorrência" }).click();
		await page.getByRole("dialog").getByLabel("Descrição").fill("Academia");
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("149,00");
		await page.getByRole("dialog").getByLabel("A partir de").fill("2026-10-14");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByText("Academia").first()).toBeVisible();

		await go(page, "Painel");
		const late = page.locator("section,div").filter({ hasText: "Atrasado" }).first();
		await expect(late).toBeVisible();
		await expect(page.getByRole("button", { name: "Aconteceu" }).first()).toBeVisible();
		await expect(page.getByRole("button", { name: "Não aconteceu" }).first()).toBeVisible();
	});

	test("answers a week of late promises in one go", async ({ page }) => {
		// A series that has already passed three times, which is what coming back from a week
		// away looks like. Answering them was one press each, each its own write.
		await page.clock.setFixedTime(new Date("2026-10-20T12:00:00-03:00"));
		await openCofre(page);

		await go(page, "Calendário");
		await page.getByRole("button", { name: "Nova recorrência" }).click();
		await page.getByRole("dialog").getByLabel("Descrição").fill("Van da escola");
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("30,00");
		await page.getByRole("dialog").getByLabel("Repete").selectOption("weekly");
		await page.getByRole("dialog").getByLabel("A partir de").fill("2026-10-01");
		await page.getByRole("button", { name: "Salvar" }).click();

		await go(page, "Painel");
		await page.getByRole("button", { name: /^Confirmar os \d+$/ }).click();

		// The dialog says what moves and that the days do not, before anything moves.
		const asking = page.getByRole("dialog");
		await expect(asking.getByText("fica no dia para o qual foi prometido")).toBeVisible();
		await asking.getByRole("button", { name: "Aconteceram todos" }).click();

		await expect(page.getByText(/registros confirmados/)).toBeVisible();
		await expect(page.getByRole("button", { name: /^Confirmar os \d+$/ })).toHaveCount(0);
	});

	test("puts a card invoice whose due day has gone with the things to answer", async ({ page }) => {
		await openCofre(page);

		// A purchase made more than two months ago lands on an invoice that closed and fell
		// due long before today, whatever day the suite runs on. The list of what falls due
		// had one bound, the far end, so that invoice passed it and was drawn under a heading
		// saying it was still to come, with a date already gone in the column beside it.
		const old = new Date();
		old.setDate(old.getDate() - 70);

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		await page
			.getByRole("dialog")
			.getByLabel("Pago com")
			.selectOption({ label: "Cartão do banco (Crédito)" });
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("210,00");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Pneu");
		await page.getByRole("dialog").getByLabel("Dia").fill(old.toISOString().slice(0, 10));
		await page.getByRole("button", { name: "Salvar" }).click();

		await go(page, "Painel");

		// The sample card closes on the third and falls due on the tenth, so the bill for that
		// purchase was due on the tenth of the month after the one it was bought in.
		const month = new Date(old.getFullYear(), old.getMonth(), 1);
		if (old.getDate() >= 3) month.setMonth(month.getMonth() + 1);
		const dueOn = `10/${String(month.getMonth() + 1).padStart(2, "0")}`;

		const late = page.locator("section,div").filter({ hasText: "Atrasado" }).first();
		await expect(late.getByText("fatura vencida")).toBeVisible();

		const due = page.locator("section").filter({ hasText: "Vence nos próximos dias" });
		await expect(due.getByText(dueOn)).toHaveCount(0);
	});
});
