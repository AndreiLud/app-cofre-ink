// More than one card, in every list that offers one and on every screen that adds them up.

import { expect, test } from "@playwright/test";
import { dayField, figure, fourCards, go, openCofre, openSetting, record } from "./support.ts";

test.describe("more than one card", () => {
	// Part 2, B.3.1, B.3.2 and B.3.7 of the request for 2.0.0: the invoices opened on the
	// first card the database sorted by name, and choosing another card did not reach the
	// address, so going back did not go back.
	test("opens the invoices on the late card, and going back goes back to it", async ({ page }) => {
		await fourCards(page);
		await go(page, "Faturas");
		// On the card, and on the invoice still taking purchases, which is today's.
		const heading = page.getByRole("heading", { level: 1 });
		await expect(heading).toContainText("Nubank: a fatura de novembro fecha");

		await page.getByRole("group", { name: "Cartão" }).getByText("C6", { exact: true }).click();
		await expect(heading).toContainText("C6: a fatura de novembro fecha");
		await page.goBack();
		await expect(heading).toContainText("Nubank: a fatura de novembro fecha");
	});

	// Part 2, B.3.5 and B.3.7: in "Todos" the overview links to a card of another space, and the
	// invoices, which read the space that is open, showed another card with nothing said.
	test("says a card of another space is that space's, and opens it there", async ({ page }) => {
		await openCofre(page);
		await openSetting(page, "Gerenciar espaços");
		await page.getByRole("button", { name: "Entrar" }).click();
		await expect(page.getByRole("banner")).toContainText("Casa");

		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		const card = page.getByRole("dialog");
		await card.getByLabel("Nome").fill("Cartão da casa");
		await card.getByLabel("Tipo").selectOption("credit");
		await card.getByLabel("Dia do fechamento").selectOption("3");
		await card.getByLabel("Dia do vencimento").selectOption("10");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Cartão da casa", exact: true })).toBeVisible();
		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		await form.getByLabel("Pago com").selectOption({ label: "Cartão da casa" });
		await form.getByLabel("Valor", { exact: true }).fill("100,00");
		await form.getByLabel("Descrição").fill("Mercado da casa");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);

		await openSetting(page, "Gerenciar espaços");
		await page.getByRole("button", { name: "Entrar" }).click();
		await expect(page.getByRole("banner")).toContainText("Pessoal");
		await go(page, "Painel");
		await page.getByText("Todos", { exact: true }).click();
		await page
			.locator("div.flex-wrap")
			.filter({ has: page.getByText("Cartão da casa", { exact: true }) })
			.filter({ has: page.getByRole("link", { name: "Pagar fatura" }) })
			.last()
			.getByRole("link", { name: "Pagar fatura" })
			.click();

		await expect(page.getByText("Este cartão é do espaço Casa.")).toBeVisible();
		await page.getByRole("button", { name: "Abrir no espaço Casa" }).click();
		await expect(page.getByRole("heading", { level: 1 })).toContainText("Cartão da casa:");
	});

	// Part 2, B.7.3 and B.7.5: a card archived with 640 on an invoice that falls due this month
	// vanished from every screen, and what was left to spend rose by the 640 still owed.
	test("asks before archiving a card that owes, and goes on counting what it owes", async ({
		page,
	}) => {
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
		await card.getByLabel("Dia do fechamento").selectOption("25");
		await card.getByLabel("Dia do vencimento").selectOption("30");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Nubank", exact: true })).toBeVisible();

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		await form.getByLabel("Pago com").selectOption({ label: "Nubank" });
		await form.getByLabel("Valor", { exact: true }).fill("640,00");
		await form.getByLabel("Descrição").fill("Óculos");
		await form.getByLabel("Dia").fill("2026-10-10");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);

		await go(page, "Painel");
		await expect(figure(page, "Ainda dá para gastar")).toHaveText("R$ 4.360,00");

		await go(page, "Contas");
		await page
			.getByRole("row")
			.filter({ has: page.getByRole("cell", { name: "Nubank", exact: true }) })
			.getByRole("button", { name: "Ações da conta" })
			.click();
		await page.getByRole("menuitem", { name: "Arquivar" }).click();
		const asking = page.getByRole("dialog");
		await expect(asking).toContainText("Ele ainda deve R$ 640,00");
		await page.getByRole("button", { name: "Arquivar mesmo assim" }).click();
		await expect(asking).toHaveCount(0);

		await page.reload();
		await go(page, "Painel");
		await expect(figure(page, "Ainda dá para gastar")).toHaveText("R$ 4.360,00", {
			timeout: 45_000,
		});
		await expect(page.getByText("Nubank", { exact: true }).first()).toBeVisible();
	});

	// Part 2, B.6 and B.3.6 of the request for 2.0.0: a second piece of plastic on an invoice that
	// exists had no way in, and an invoice charged by two did not say which made each purchase.
	test("adds a second card to an invoice, and says which card made each purchase", async ({
		page,
	}) => {
		await openCofre(page);
		await go(page, "Contas");
		await page
			.getByRole("row")
			.filter({ has: page.getByRole("cell", { name: "Cartão de crédito", exact: true }) })
			.getByRole("button", { name: "Ações da conta" })
			.click();
		await page.getByRole("menuitem", { name: "Adicionar cartão nesta fatura" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Nome").fill("Cartão da Ana");
		await dialog.getByLabel("Quatro últimos dígitos").fill("9120");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(dialog).toHaveCount(0);
		await expect(page.getByText("Final 9120")).toBeVisible();

		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		await form.getByLabel("Pago com").selectOption({ label: "Cartão da Ana" });
		await form.getByLabel("Valor", { exact: true }).fill("80,00");
		await form.getByLabel("Descrição").fill("Padaria da Ana");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);
		await expect(record(page, "Padaria da Ana")).toContainText("Cartão de crédito");

		// On the holder's invoice, with the card that made it beside it.
		await go(page, "Faturas");
		await expect(page.getByRole("row").filter({ hasText: "Padaria da Ana" })).toContainText(
			"Cartão da Ana",
		);
		await expect(page.getByRole("row").filter({ hasText: "Livraria" })).toContainText(
			"Cartão do banco",
		);
	});

	// Part 2, B.9, with part 1, D.2 and D.7: a cartao multiplo reaches two accounts and a line
	// could not say which, and the list said the account and never the card.
	test("lets a line say which side of a card that does both", async ({ page }) => {
		await openCofre(page);
		await go(page, "Lançamentos");
		const quick = page.getByLabel("Lançamento rápido");
		await quick.fill("hortifruti 80 cartão do banco débito");
		await page.getByRole("button", { name: "Lançar", exact: true }).click();
		await expect(page.getByRole("button", { name: "Desfazer" })).toBeVisible();
		await quick.fill("padaria 30 cartão do banco");
		await page.getByRole("button", { name: "Lançar", exact: true }).click();
		await expect(record(page, "padaria")).toBeVisible();

		await expect(record(page, "hortifruti")).toContainText("Cartão do banco, Conta corrente");
		await expect(record(page, "padaria")).toContainText("Cartão do banco, Cartão de crédito");
	});

	// Part 2, B.8, with part 1, E.7: at 375 pixels the accounts table cut the balance to
	// "R$ 1.101,0" and pushed the menu off the screen, and the kind is what tells the current
	// account "Nubank" from the card "Nubank".
	test("fits the accounts on a telephone, the kind of each one included", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await fourCards(page);
		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Nubank");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(0);

		const table = page.getByRole("table").first();
		await expect(table.getByRole("row")).toHaveCount(8);
		// The checking "Nubank" and the card "Nubank", each with its kind under the name.
		const nubank = table.getByRole("row").filter({ hasText: "Nubank" });
		await expect(nubank.filter({ hasText: "Conta corrente" })).toHaveCount(1);
		await expect(nubank.filter({ hasText: /Nubank\s*Cartão/ })).toHaveCount(1);

		const sideways = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
		);
		expect(sideways).toBeLessThanOrEqual(0);
		for (const cell of await table.locator("td").all()) {
			const cut = await cell.evaluate((element) => element.scrollWidth - element.clientWidth);
			expect(cut).toBeLessThanOrEqual(0);
		}
		for (const button of await table.getByRole("button", { name: "Ações da conta" }).all()) {
			const box = await button.boundingBox();
			expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
		}
	});

	// Part 2, B.4.2, B.4.3, B.4.4 and B.4.8: four cards and a meal card on the twenty eighth.
	test("adds four cards into one line at the top and lists them by urgency", async ({ page }) => {
		await fourCards(page);
		await go(page, "Painel");
		await expect(page.getByText("4 cartões: R$ 1.850,00 nas faturas abertas")).toBeVisible();
		await expect(page.getByText("R$ 900,00 de fatura fechada, vence em 05/11")).toBeVisible();
		await expect(page.getByText("R$ 300,00 vencidos")).toBeVisible();

		const list = page.locator("#cartoes");
		await expect(list.getByRole("listitem").locator("p.font-medium")).toHaveText([
			"Nubank",
			"Itaú",
			"C6",
			"Inter",
		]);
		await expect(list).toContainText("Ao todo: R$ 1.850,00 abertos e R$ 1.200,00 devidos.");
	});

	// Part 2, B.4.6 and B.4.8, with part 1, E.1: with two cards, every "Pagar fatura" of the
	// second opened the first, and the line of an invoice that had closed opened the open one.
	test("opens the card and the month of the invoice a button belongs to", async ({ page }) => {
		await openCofre(page);
		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		const card = page.getByRole("dialog");
		await card.getByLabel("Nome").fill("Nubank");
		await card.getByLabel("Tipo").selectOption("credit");
		await card.getByLabel("Dia do fechamento").selectOption("15");
		await card.getByLabel("Dia do vencimento").selectOption("22");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Nubank", exact: true })).toBeVisible();
		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		await form.getByLabel("Pago com").selectOption({ label: "Nubank" });
		await form.getByLabel("Valor", { exact: true }).fill("300,00");
		await form.getByLabel("Descrição").fill("Farmácia");
		await form.getByLabel("Dia").fill("2026-09-20");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);

		const heading = page.getByRole("heading", { level: 1 });
		// The sample card, second in the order behind the late one: its line at the top.
		await go(page, "Painel");
		const top = page
			.locator("div.flex-wrap")
			.filter({ has: page.getByText("Cartão de crédito", { exact: true }) })
			.filter({ has: page.getByRole("link", { name: "Pagar fatura" }) })
			.last();
		await top.getByRole("link", { name: "Pagar fatura" }).click();
		await expect(heading).toContainText("Cartão de crédito: a fatura de novembro");

		// Its row in what falls due in the next days.
		await go(page, "Painel");
		await page
			.getByRole("listitem")
			.filter({ hasText: "Fatura do cartão Cartão de crédito" })
			.getByRole("link", { name: "Pagar fatura" })
			.click();
		await expect(heading).toContainText("Cartão de crédito: a fatura de novembro");

		// And the late one, from the block of what is late.
		await go(page, "Painel");
		await page
			.getByRole("listitem")
			.filter({ hasText: "Fatura do cartão Nubank" })
			.filter({ hasText: "fatura vencida" })
			.getByRole("link", { name: "Pagar fatura" })
			.click();
		await expect(heading).toContainText("Nubank: a fatura de outubro venceu");
	});

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
