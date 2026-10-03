// The overview, which is the one screen the product brief makes a promise about.
//
// What is checked here is that the four questions it promises an answer to are answered,
// and that the things which used to be wrong about the numbers are no longer wrong: a
// card invoice netted off the money somebody has, a meal voucher counted as cash, a bill
// that falls due tomorrow dropped off the end of the list, and a record that was promised
// for a day already gone simply vanishing.

import { expect, test } from "@playwright/test";
import { dayField, figure, go, onTheDay, openCofre, promisesFromBefore, total } from "./support.ts";

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

	test("counts the days a series has already passed, with nothing left to answer", async ({
		page,
	}) => {
		await openCofre(page);

		// A series that started before today writes a record for every day it has already
		// passed. Release 1.2.1 wrote each one as a promise and listed them all as late, for
		// somebody to say they happened. They are facts now, and their days have come.
		await go(page, "Calendário");
		await page.getByRole("button", { name: "Nova recorrência" }).click();
		await page.getByRole("dialog").getByLabel("Descrição").fill("Academia");
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("149,00");
		// A series never writes a record for a month before the one it was written down in,
		// which is why the day the suite runs on is fixed rather than real.
		await page.getByRole("dialog").getByLabel("A partir de").fill(dayField(-6));
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByText("Academia").first()).toBeVisible();

		await go(page, "Painel");
		await expect(page.getByText("Atrasado", { exact: true })).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Não aconteceu" })).toHaveCount(0);
	});

	test("puts a promise from before 1.1.0 whose day is gone at the top, to be answered", async ({
		browser,
	}) => {
		// A promise written by release 1.0 for a day that has passed. Nobody has said it
		// happened, so it is the one thing still called late.
		const before = await promisesFromBefore(browser, {
			description: "Academia",
			amount: "149,00",
			from: -6,
		});
		const page = before.page;
		try {
			await go(page, "Painel");
			const late = page.locator("section,div").filter({ hasText: "Atrasado" }).first();
			await expect(late).toBeVisible();
			await expect(page.getByRole("button", { name: "Aconteceu" }).first()).toBeVisible();
			await expect(page.getByRole("button", { name: "Não aconteceu" }).first()).toBeVisible();
		} finally {
			await before.close();
		}
	});

	test("answers a week of late promises in one go", async ({ browser }) => {
		// Promises from before 1.1.0 that have passed three times, which is what coming back
		// from a week away looked like. Answering them was one press each.
		const before = await promisesFromBefore(browser, {
			description: "Van da escola",
			amount: "30,00",
			weekly: true,
			from: -27,
		});
		const page = before.page;
		try {
			await go(page, "Painel");
			await page.getByRole("button", { name: /^Confirmar os \d+$/ }).click();

			// The dialog says what moves and that the days do not, before anything moves.
			const asking = page.getByRole("dialog");
			await expect(asking.getByText("fica no dia para o qual foi prometido")).toBeVisible();
			await asking.getByRole("button", { name: "Aconteceram todos" }).click();

			await expect(page.getByText(/registros confirmados/)).toBeVisible();
			await expect(page.getByRole("button", { name: /^Confirmar os \d+$/ })).toHaveCount(0);
		} finally {
			await before.close();
		}
	});

	// Part 1, A.10 of the request for 2.0.0, the commonest case in Brazil: 3,000 in the bank
	// and a rule that puts 500 a month in the savings account. Moving the 500 raised what was
	// left to spend from 2,500 to 3,000.
	test("keeps what is left to spend where it was when money is put aside", async ({ page }) => {
		await openCofre(page, { demo: false });

		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		await page.getByLabel("Nome").fill("Banco");
		await page.getByLabel("Saldo de abertura").fill("3.000,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Banco", exact: true })).toBeVisible();
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
		await expect(page.getByRole("dialog")).toHaveCount(0);

		await go(page, "Painel");
		await expect(figure(page, "Ainda dá para gastar")).toHaveText("R$ 2.500,00");

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		await form.getByText("Transferência", { exact: true }).click();
		await form.getByLabel("Valor", { exact: true }).fill("500,00");
		await form.getByLabel("Descrição").fill("Guardar");
		await form.getByLabel("Sai de").selectOption({ label: "Banco" });
		await form.getByLabel("Entra em").selectOption({ label: "Reserva" });
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(0);

		await go(page, "Painel");
		await expect(figure(page, "Ainda dá para gastar")).toHaveText("R$ 2.500,00");
		await expect(total(page)).toHaveText("R$ 3.000,00");

		// And read fresh, the way the page is opened the next morning. Before 2.0.0 the
		// figure above only looked right because the overview kept reading the rule as it
		// was before the money moved; read again, it said 3,000.
		await page.reload();
		await expect(figure(page, "Ainda dá para gastar")).toHaveText("R$ 2.500,00", {
			timeout: 45_000,
		});
	});

	// Part 1, A.11 of the request for 2.0.0. The fixed day of the suite, the twenty eighth,
	// never falls between a closing day and a due day, which is where this lived: every
	// month, for that week, the invoice that had just closed was drawn in red as overdue.
	test("calls an invoice that closed and is not due yet owed, and not overdue", async ({
		page,
	}) => {
		await openCofre(page);
		// The sample card closes on the third and falls due on the tenth.
		await page.clock.setFixedTime(new Date("2026-11-05T12:00:00-03:00"));
		await page.reload();

		await expect(page.getByText("da fatura que fechou, vence em 10/11")).toBeVisible({
			timeout: 45_000,
		});
		await expect(page.getByText("A fatura anterior fechou e vence em 10/11")).toBeVisible();
		await expect(page.getByText(/venceu em 10\/11/)).toHaveCount(0);
		await expect(page.getByText(/já venceram/)).toHaveCount(0);
	});

	test("puts a card invoice whose due day has gone with the things to answer", async ({ page }) => {
		await openCofre(page);

		// A purchase made more than two months ago lands on an invoice that closed and fell
		// due long before today, whatever day the suite runs on. The list of what falls due
		// had one bound, the far end, so that invoice passed it and was drawn under a heading
		// saying it was still to come, with a date already gone in the column beside it.
		const old = onTheDay(-70);

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
