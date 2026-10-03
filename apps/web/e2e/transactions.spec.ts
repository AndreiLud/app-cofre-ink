// Writing money down, which is the thing the product exists to make fast.

import { expect, test } from "@playwright/test";
import { dayField, figure, go, onTheDay, openCofre, record, total } from "./support.ts";

/**
 * A day ahead of the day the suite runs on, as the date field wants it.
 *
 * The suite runs in America/Sao_Paulo, which the configuration pins, and on one fixed day,
 * which support.ts pins, so the day the browser is on and the day this counts from are the
 * same one.
 */
function inDays(count: number): string {
	return dayField(count);
}

/** The month a day belongs to, because the list opens on this month and a day ahead may not be in it. */
function monthOfDay(day: string): string {
	return day.slice(0, 7);
}

test.describe("records", () => {
	test("writes an expense and takes it off the balance", async ({ page }) => {
		await openCofre(page);

		const before = await total(page).innerText();

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();

		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("42,90");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Mercado do bairro");
		await page.getByRole("dialog").getByLabel("Pago com").selectOption({ label: "Conta corrente" });
		await page.getByRole("button", { name: "Salvar" }).click();

		await expect(record(page, "Mercado do bairro")).toBeVisible();
		await expect(page.getByRole("cell", { name: "-R$ 42,90" })).toBeVisible();

		await go(page, "Painel");
		await expect(total(page)).not.toHaveText(before);
	});

	test("splits a card purchase into parts that land on their own months", async ({ page }) => {
		await openCofre(page);

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();

		// A credit account is reached by its plastic and by nothing else, so the way to pay
		// is named after the card. The sample card works both ways, so it says which.
		await page
			.getByRole("dialog")
			.getByLabel("Pago com")
			.selectOption({ label: "Cartão do banco (Crédito)" });
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("1.234,56");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Geladeira");
		await page.getByRole("dialog").getByLabel("Dia").fill("2026-09-05");
		await page.getByRole("dialog").getByLabel("Parcelas").selectOption("3");
		await page.getByRole("button", { name: "Salvar" }).click();

		await page.getByLabel("Mês", { exact: true }).fill("2026-09");
		await expect(record(page, "Geladeira 1/3")).toBeVisible();

		await page.getByLabel("Mês", { exact: true }).fill("2026-10");
		await expect(record(page, "Geladeira 2/3")).toBeVisible();

		await page.getByLabel("Mês", { exact: true }).fill("2026-11");
		await expect(record(page, "Geladeira 3/3")).toBeVisible();
		await expect(page.getByRole("cell", { name: "-R$ 411,52" })).toBeVisible();
	});

	// Release 1.2.1 wrote a day ahead as a promise, and nothing ever made a promise a fact:
	// on its day it stayed out of the balance, and the day after it was called late. The
	// case from the request for 2.0.0, part 1, A.1.3: a record from the form and an
	// occurrence of a series, three days out, with the clock moved to their day.
	test("counts a record and a series dated three days ahead on their day, untouched", async ({
		page,
	}) => {
		await openCofre(page, { demo: false });

		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		await page.getByLabel("Nome").fill("Banco");
		await page.getByLabel("Saldo de abertura").fill("1.000,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Banco", exact: true })).toBeVisible();

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		await form.getByLabel("Valor", { exact: true }).fill("75,00");
		await form.getByLabel("Descrição").fill("Seguro do carro");
		await form.getByLabel("Dia").fill(dayField(3));
		await expect(form).toContainText("passa a contar no saldo sozinho nesse dia");
		await page.getByRole("button", { name: "Salvar" }).click();

		await go(page, "Calendário");
		await page.getByRole("button", { name: "Nova recorrência" }).click();
		await page.getByRole("dialog").getByLabel("Descrição").fill("Academia");
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("149,00");
		await page.getByRole("dialog").getByLabel("A partir de").fill(dayField(3));
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByText("Academia").first()).toBeVisible();

		await go(page, "Painel");
		await expect(total(page)).toHaveText("R$ 1.000,00");

		// Their day, and the page opened again the way somebody opens it in the morning.
		await page.clock.setFixedTime(onTheDay(3));
		await page.reload();
		await expect(total(page)).toHaveText("R$ 776,00", { timeout: 45_000 });
		await expect(page.getByText("Atrasado", { exact: true })).toHaveCount(0);

		// And the day after, which is the day 1.2.1 called both of them late.
		await page.clock.setFixedTime(onTheDay(4));
		await page.reload();
		await expect(total(page)).toHaveText("R$ 776,00", { timeout: 45_000 });
		await expect(page.getByText("Atrasado", { exact: true })).toHaveCount(0);
		await expect(page.getByRole("button", { name: /^Confirmar os/ })).toHaveCount(0);
	});

	test("keeps a record dated ahead out of the balance until its day, or until it is paid", async ({
		page,
	}) => {
		await openCofre(page);

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();

		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("1.450,00");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Aluguel");
		await page.getByRole("dialog").getByLabel("Pago com").selectOption({ label: "Conta corrente" });
		// No tickbox any more: the day is what says this has not happened. Three days out,
		// which is inside the fifteen the overview looks ahead over.
		const due = inDays(3);
		await page.getByRole("dialog").getByLabel("Dia").fill(due);
		await page.getByRole("button", { name: "Salvar" }).click();

		await page.getByLabel("Mês", { exact: true }).fill(monthOfDay(due));
		await expect(record(page, "Aluguel")).toContainText("Previsto");

		await go(page, "Painel");
		// It is three days out, so it is not in the balance yet however it is marked. The
		// row is found by its amount, because the sample data has rent in it too.
		const before = await total(page).innerText();
		const row = page
			.locator("section")
			.filter({ hasText: "Vence nos próximos dias" })
			.locator("li")
			.filter({ hasText: "R$ 1.450,00" });
		await expect(row).toBeVisible();

		// Saying it happened writes the day it happened, which is today, so it lands in the
		// balance now instead of sitting three days out marked as a fact.
		await row.getByRole("button", { name: "Aconteceu" }).click();
		await expect(total(page)).not.toHaveText(before);
	});

	test("asks nobody whether a record has happened, because the day says so", async ({ page }) => {
		await openCofre(page);

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();

		// The question used to be asked twice, once by the date field and once by a tickbox
		// beside it, and the tickbox won. It is gone.
		await expect(page.getByRole("dialog").getByText("Ainda não aconteceu")).toHaveCount(0);

		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("75,00");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Seguro do carro");
		await page.getByRole("dialog").getByLabel("Pago com").selectOption({ label: "Conta corrente" });
		const due = inDays(9);
		await page.getByRole("dialog").getByLabel("Dia").fill(due);

		// And the form says what the day it was given means, before anything is saved.
		await expect(page.getByRole("dialog")).toContainText("Esse dia ainda não chegou");
		await page.getByRole("button", { name: "Salvar" }).click();

		await page.getByLabel("Mês", { exact: true }).fill(monthOfDay(due));
		await expect(record(page, "Seguro do carro")).toContainText("Previsto");
	});

	test("asks what it was paid with, once, and says which invoice it lands on", async ({ page }) => {
		await openCofre(page);

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const dialog = page.getByRole("dialog");

		// The card and the account were two controls for one decision. There is one now.
		await expect(dialog.getByLabel("Cartão")).toHaveCount(0);
		await expect(dialog.getByLabel("Conta", { exact: true })).toHaveCount(0);

		await dialog.getByLabel("Pago com").selectOption({ label: "Cartão do banco (Crédito)" });
		// The closing day is the one thing about a card that surprises people, and the
		// surprise used to arrive three weeks later on the invoice screen.
		await expect(dialog).toContainText("Entra na fatura de");

		// The two fields almost nobody fills are out of the way rather than gone: they are
		// on the form, behind a summary, and a keyboard still reaches them by opening it.
		await expect(dialog.getByText("Mais detalhes")).toBeVisible();
		await expect(dialog.getByLabel("Observação")).not.toBeVisible();
		await dialog.getByText("Mais detalhes").click();
		await expect(dialog.getByLabel("Observação")).toBeVisible();
	});

	test("asks before deleting, and says what goes", async ({ page }) => {
		await openCofre(page);
		await go(page, "Lançamentos");

		const row = record(page, "Café da esquina");
		await row.getByRole("button", { name: "Ações do lançamento" }).click();
		await page.getByRole("menuitem", { name: "Apagar", exact: true }).click();

		// It used to fire straight from the menu, with no undo and no toast.
		const dialog = page.getByRole("dialog");
		await expect(dialog).toContainText("Café da esquina");
		await dialog.getByRole("button", { name: "Cancelar" }).click();
		await expect(record(page, "Café da esquina")).toBeVisible();
	});

	test("finds a record by a word in its description", async ({ page }) => {
		await openCofre(page);

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("30,00");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Padaria da esquina");
		await page.getByRole("button", { name: "Salvar" }).click();

		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("80,00");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Farmácia");
		await page.getByRole("button", { name: "Salvar" }).click();

		// Typing into the screen behind a dialog that is still closing is a race, so
		// this waits for the dialog to be gone before touching the filters.
		await expect(page.getByRole("dialog")).toHaveCount(0);
		await page.getByLabel("Buscar").fill("padaria");
		await expect(record(page, "Padaria da esquina")).toBeVisible();
		await expect(record(page, "Farmácia")).toHaveCount(0);
	});

	test("writes a whole record from one line of text", async ({ page }) => {
		await openCofre(page);
		await go(page, "Lançamentos");

		await page.getByLabel("Lançamento rápido").fill("pastel 63,40 ontem carteira");
		// What it understood is shown before anything is written.
		await expect(page.getByText("-R$ 63,40")).toBeVisible();

		await page.getByRole("button", { name: "Lançar", exact: true }).click();

		const row = record(page, "pastel");
		await expect(row).toBeVisible();
		await expect(row).toContainText("Carteira");

		// And it can be taken back without hunting for the record in the list.
		await page.getByRole("button", { name: "Desfazer" }).click();
		await expect(record(page, "pastel")).toHaveCount(0);
	});

	test("changes a selection of records in one go", async ({ page }) => {
		await openCofre(page);
		await go(page, "Lançamentos");

		for (const [description, amount] of [
			["Conta de luz", "180,00"],
			["Conta de água", "90,00"],
		]) {
			await page.getByRole("button", { name: "Novo lançamento" }).first().click();
			await page
				.getByRole("dialog")
				.getByLabel("Valor", { exact: true })
				.fill(amount ?? "");
			await page
				.getByRole("dialog")
				.getByLabel("Descrição")
				.fill(description ?? "");
			await page.getByRole("dialog").getByLabel("Dia").fill(inDays(5));
			await page.getByRole("button", { name: "Salvar" }).click();
		}

		await page.getByLabel("Mês", { exact: true }).fill(monthOfDay(inDays(5)));
		await page.getByRole("checkbox", { name: "Selecionar Conta de luz" }).check();
		await page.getByRole("checkbox", { name: "Selecionar Conta de água" }).check();
		await expect(page.getByText("2 selecionados")).toBeVisible();

		await page.getByRole("button", { name: "Marcar como pago" }).first().click();

		// Paid now, so the two leave the day they were due on for today, the way one record
		// paid from its own menu does. Writing only the status left both on their day, where
		// a fact dated ahead still waits, and nothing on the screen changed.
		await expect(page.getByText("2 selecionados")).toHaveCount(0);
		await expect(record(page, "Conta de luz")).toHaveCount(0);
		await page.getByLabel("Mês", { exact: true }).fill(monthOfDay(inDays(0)));
		await expect(record(page, "Conta de luz")).not.toContainText("Previsto");
		await expect(record(page, "Conta de água")).not.toContainText("Previsto");
		await expect(record(page, "Conta de luz")).toContainText(inDays(0).slice(8));
	});

	test("keeps a filter and brings it back by name", async ({ page }) => {
		await openCofre(page);
		await go(page, "Lançamentos");

		await page.getByLabel("Buscar").fill("cinema");
		await page.getByRole("button", { name: "Salvar este filtro" }).click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Lazer");
		await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();

		await expect(page.getByRole("dialog")).toHaveCount(0);
		await page.getByLabel("Buscar").fill("");
		await expect(record(page, "Salário")).toBeVisible();

		await page.getByRole("button", { name: "Lazer", exact: true }).click();
		await expect(page.getByLabel("Buscar")).toHaveValue("cinema");
		await expect(record(page, "Salário")).toHaveCount(0);

		// A saved filter is a starting point, and the address is what the list shows. Applying
		// one has to write the address, or a reload would quietly undo it.
		await expect(page).toHaveURL(/busca=cinema/);
	});

	test("opens on the filters the address carries", async ({ page }) => {
		await openCofre(page);
		await go(page, "Lançamentos");

		// Two records today, so whatever month the list opens on holds both of them.
		for (const [amount, description] of [
			["30,00", "Padaria da esquina"],
			["80,00", "Farmácia"],
		]) {
			await page.getByRole("button", { name: "Novo lançamento" }).first().click();
			await page
				.getByRole("dialog")
				.getByLabel("Valor", { exact: true })
				.fill(amount ?? "");
			await page
				.getByRole("dialog")
				.getByLabel("Descrição")
				.fill(description ?? "");
			await page.getByRole("button", { name: "Salvar" }).click();
			await expect(page.getByRole("dialog")).toHaveCount(0);
		}
		await expect(record(page, "Padaria da esquina")).toBeVisible();
		await expect(record(page, "Farmácia")).toBeVisible();

		const month = await page.getByLabel("Mês", { exact: true }).inputValue();

		// A link, loaded cold, and the list is already narrowed. Nothing read the address
		// before this, so the same link opened on an unfiltered list of the current month.
		await page.goto(`/lancamentos?mes=${month}&busca=padaria&tipo=expense`);
		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 20_000,
		});

		await expect(page.getByLabel("Buscar")).toHaveValue("padaria");
		await expect(page.getByLabel("Mês", { exact: true })).toHaveValue(month);
		await expect(page.getByRole("button", { name: "1 filtro ativo" })).toBeVisible();
		await expect(record(page, "Padaria da esquina")).toBeVisible();
		await expect(record(page, "Farmácia")).toHaveCount(0);

		// And a filter changed by hand goes into the address, so the list stays a link.
		await page.getByLabel("Buscar").fill("farmácia");
		await expect(page).toHaveURL(/busca=farm/);
		await expect(record(page, "Farmácia")).toBeVisible();
	});

	test("leads to the statement import from the records screen", async ({ page }) => {
		await openCofre(page);
		await go(page, "Lançamentos");

		// It was four clicks away under the settings, on a screen whose whole subject is
		// records arriving.
		await page.getByRole("link", { name: "Importar extrato" }).first().click();
		await expect(page).toHaveURL(/importar/);
	});
});

test.describe("the card invoice", () => {
	test("says when it closes and what it will charge", async ({ page }) => {
		await openCofre(page);
		await go(page, "Faturas");

		// The demonstration data buys on the card, so the invoice is not empty.
		await expect(page.getByRole("heading", { level: 1 })).toContainText("fatura");
		await expect(record(page, "Fone de ouvido 1/3")).toBeVisible();
	});

	test("puts a subscription charged to the card on the invoice", async ({ page }) => {
		await openCofre(page);
		await go(page, "Faturas");

		// Writing a series never worked out which invoice it belonged to, so a subscription
		// on a card was on no invoice at all and the card showed less than it would charge.
		await expect(record(page, "Streaming")).toBeVisible();
	});

	test("says how much of the limit is left, and agrees with the overview", async ({ page }) => {
		await openCofre(page);

		// What the overview says about this card. The invoice screen used to print the raw
		// limit instead, so the two screens disagreed by the whole of what the card had
		// already spent, and the wrong one was on the screen whose only subject is the card.
		const sentence = "Ainda dá para gastar no cartão:";
		const onOverview = await page.locator("p").filter({ hasText: sentence }).first().innerText();

		await go(page, "Faturas");

		const onInvoice = page.locator("p").filter({ hasText: sentence });
		await expect(onInvoice).toHaveCount(1);
		expect(await onInvoice.innerText()).toBe(onOverview);
		await expect(page.getByText("Limite do cartão:")).toHaveCount(0);
	});

	test("pays the invoice, and says so", async ({ page }) => {
		await openCofre(page);
		await go(page, "Faturas");

		await expect(page.getByText("Em aberto")).toBeVisible();
		await page.getByRole("button", { name: "Pagar fatura" }).click();

		// It comes filled in with what is left, so nobody pays an invoice twice by pressing
		// the button the field handed them.
		const amount = page.getByRole("dialog").getByLabel("Valor", { exact: true });
		await expect(amount).not.toHaveValue("");
		// Paid today. The day it comes with is the due day, which is a payment scheduled
		// for then, and the case after this one is about that.
		await page.getByRole("dialog").getByLabel("Dia").fill(dayField(0));
		await page.getByRole("dialog").getByRole("button", { name: "Pagar fatura" }).click();

		await expect(page.getByRole("heading", { level: 1 })).toContainText("está paga");
		await expect(page.getByText("Já pago:")).toBeVisible();
		// And the payment is not a purchase, so it is not in the table of what was charged.
		await expect(record(page, "Pagamento da fatura")).toHaveCount(0);
	});

	test("pays part of an invoice and leaves the rest owing", async ({ page }) => {
		await openCofre(page);
		await go(page, "Faturas");

		await page.getByRole("button", { name: "Pagar fatura" }).click();
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("100,00");
		await page.getByRole("dialog").getByLabel("Dia").fill(dayField(0));
		await page.getByRole("dialog").getByRole("button", { name: "Pagar fatura" }).click();

		await expect(page.getByText("Paga em parte")).toBeVisible();
		await expect(page.getByText("Falta:")).toBeVisible();
	});

	// The case from the request for 2.0.0, part 1, A.2: five thousand in the bank and an
	// invoice of two thousand due in seven days. Paid on the day the dialog suggests, which
	// is the due day, release 1.2.1 took the invoice off what falls due at once while the
	// bank still held the money, and what was left to spend read five thousand for a week.
	test("leaves what is left to spend alone when an invoice is paid ahead of its day", async ({
		page,
	}) => {
		await openCofre(page, { demo: false });
		// A day whose invoice falls due inside the same month, so the bill is in the figure.
		await page.clock.setFixedTime(new Date("2026-10-13T12:00:00-03:00"));
		await page.reload();
		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 45_000,
		});

		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		await page.getByLabel("Nome").fill("Banco");
		await page.getByLabel("Saldo de abertura").fill("5.000,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Banco", exact: true })).toBeVisible();

		await page.getByRole("button", { name: "Nova conta" }).first().click();
		const card = page.getByRole("dialog");
		await card.getByLabel("Nome").fill("Nubank");
		await card.getByLabel("Tipo").selectOption("credit");
		await card.getByLabel("Dia do fechamento").selectOption("15");
		await card.getByLabel("Dia do vencimento").selectOption("20");
		await card.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Nubank", exact: true })).toBeVisible();

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		await form.getByLabel("Pago com").selectOption({ label: "Nubank" });
		await form.getByLabel("Valor", { exact: true }).fill("2.000,00");
		await form.getByLabel("Descrição").fill("Notebook");
		await form.getByLabel("Dia").fill("2026-10-08");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(record(page, "Notebook")).toBeVisible();

		await go(page, "Painel");
		await expect(figure(page, "Ainda dá para gastar")).toHaveText("R$ 3.000,00");

		await go(page, "Faturas");
		await page.getByRole("button", { name: "Pagar fatura" }).click();
		await expect(page.getByRole("dialog").getByLabel("Dia")).toHaveValue("2026-10-20");
		await page.getByRole("dialog").getByRole("button", { name: "Pagar fatura" }).click();

		// Not paid yet, and the screen says when it will be.
		await expect(page.getByRole("heading", { level: 1 })).not.toContainText("está paga");
		await expect(page.getByText(/Pagamento agendado para 20\/10/)).toBeVisible();
		await expect(page.getByRole("button", { name: "Pagar fatura" })).toHaveCount(0);

		await go(page, "Painel");
		await expect(figure(page, "Ainda dá para gastar")).toHaveText("R$ 3.000,00");
		await expect(total(page)).toHaveText("R$ 5.000,00");
		await expect(page.getByText("pagamento agendado para 20/10")).toBeVisible();

		// The day after the due day: the money left the bank and the invoice is paid.
		await page.clock.setFixedTime(new Date("2026-10-21T12:00:00-03:00"));
		await page.reload();
		await expect(figure(page, "Ainda dá para gastar")).toHaveText("R$ 3.000,00", {
			timeout: 45_000,
		});
		await expect(total(page)).toHaveText("R$ 3.000,00");
	});

	// Part 1, A.3 of the request for 2.0.0. The button counted the invoices before the one on
	// screen and paid that one as well, and it showed only beside a payment of the invoice on
	// screen, so an open invoice with nothing on it hid every invoice still owed.
	test("marks the invoices before the one on screen as paid, and only those", async ({ page }) => {
		await openCofre(page, { demo: false });

		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		await page.getByLabel("Nome").fill("Banco");
		await page.getByLabel("Saldo de abertura").fill("5.000,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Banco", exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		const card = page.getByRole("dialog");
		await card.getByLabel("Nome").fill("Nubank");
		await card.getByLabel("Tipo").selectOption("credit");
		await card.getByLabel("Dia do fechamento").selectOption("3");
		await card.getByLabel("Dia do vencimento").selectOption("10");
		await card.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Nubank", exact: true })).toBeVisible();

		const buy = async (description: string, amount: string, day: string) => {
			await go(page, "Lançamentos");
			await page.getByRole("button", { name: "Novo lançamento" }).first().click();
			const form = page.getByRole("dialog");
			await form.getByLabel("Pago com").selectOption({ label: "Nubank" });
			await form.getByLabel("Valor", { exact: true }).fill(amount);
			await form.getByLabel("Descrição").fill(description);
			await form.getByLabel("Dia").fill(day);
			await page.getByRole("button", { name: "Salvar" }).click();
			await expect(page.getByRole("dialog")).toHaveCount(0);
		};

		// The invoices of September and of October, both closed and owed on the twenty eighth.
		await buy("Pneu", "300,00", "2026-08-19");
		await buy("Farmácia", "120,00", "2026-09-15");

		// The open invoice, November's, has nothing on it yet, and the button is there anyway.
		await go(page, "Faturas");
		await expect(
			page.getByRole("button", { name: "Marcar as 2 faturas anteriores como pagas" }),
		).toBeVisible();

		// And with a purchase on it, which is what makes it the case that was paid by mistake.
		await buy("Mercado", "80,00", "2026-10-20");
		await go(page, "Faturas");
		await page.getByRole("button", { name: "Marcar as 2 faturas anteriores como pagas" }).click();
		await page.getByRole("dialog").getByRole("button", { name: "Marcar como pagas" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(0);

		await expect(page.getByRole("heading", { level: 1 })).toContainText("novembro");
		await expect(page.getByRole("heading", { level: 1 })).not.toContainText("está paga");
		await expect(page.getByText("Em aberto")).toBeVisible();
		await expect(page.getByRole("button", { name: "Pagar fatura" })).toBeVisible();
		await expect(
			page.getByRole("button", { name: /faturas? anteriores? como pagas?/ }),
		).toHaveCount(0);

		// The two it announced, and no more.
		await page.getByRole("button", { name: "Fatura anterior" }).click();
		await expect(page.getByRole("heading", { level: 1 })).toContainText("outubro está paga");
		await page.getByRole("button", { name: "Fatura anterior" }).click();
		await expect(page.getByRole("heading", { level: 1 })).toContainText("setembro está paga");
	});

	test("moves a purchase the bank closed onto another invoice, and keeps it there", async ({
		page,
	}) => {
		await openCofre(page);
		await go(page, "Faturas");

		const row = page.getByRole("row").filter({ hasText: "Livraria" });
		await row.getByRole("button", { name: "Ações do lançamento" }).click();
		await page.getByRole("menuitem", { name: "Mover para a próxima fatura" }).click();

		await expect(record(page, "Livraria")).toHaveCount(0);
		await page.getByRole("button", { name: "Próxima" }).click();
		await expect(record(page, "Livraria")).toBeVisible();
	});
});
