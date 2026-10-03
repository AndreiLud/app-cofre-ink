import { expect, test } from "@playwright/test";
import { go, openCofre, openSetting, record, restoredWith, total } from "./support.ts";

test.describe("accounts", () => {
	test("creates one and shows it with the amount that was typed", async ({ page }) => {
		await openCofre(page, { demo: false });

		await go(page, "Contas");
		// The empty state offers the same action as the header, on purpose.
		await page.getByRole("button", { name: "Nova conta" }).first().click();

		await page.getByLabel("Nome").fill("Conta do banco");
		await page.getByLabel("Saldo de abertura").fill("1.234,56");
		await page.getByRole("button", { name: "Salvar" }).click();

		await expect(page.getByRole("cell", { name: "Conta do banco" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "R$ 1.234,56" })).toBeVisible();

		await page.getByRole("link", { name: "Painel" }).click();
		await expect(total(page)).toContainText("1.234,56");
	});

	test("shows what is in an account now, and not what was in it at the start", async ({ page }) => {
		await openCofre(page);
		await go(page, "Contas");

		// The column was headed with the words for the opening balance and read as the
		// balance, which is the number anybody comes to this table for. The sample data
		// has spent from the current account since it was written down.
		await expect(page.getByRole("columnheader", { name: "Saldo" })).toBeVisible();
		const row = page.getByRole("row").filter({ hasText: "Conta corrente" });
		await expect(row).not.toContainText("R$ 4.812,30");
	});

	test("corrects an account, which had no screen at all", async ({ page }) => {
		await openCofre(page);
		await go(page, "Contas");

		const row = page.getByRole("row").filter({ hasText: "Carteira" });
		await row.getByRole("button", { name: "Ações da conta" }).click();
		await page.getByRole("menuitem", { name: "Editar conta" }).click();

		await page.getByRole("dialog").getByLabel("Nome").fill("Dinheiro do bolso");
		await page.getByRole("button", { name: "Salvar" }).click();

		await expect(page.getByRole("cell", { name: "Dinheiro do bolso" })).toBeVisible();
	});

	test("writes the allowance of a benefit card, and the overview reads it", async ({ page }) => {
		await openCofre(page);
		await go(page, "Contas");

		const row = page.getByRole("row").filter({ hasText: "Vale refeição" });
		await row.getByRole("button", { name: "Ações da conta" }).click();
		await page.getByRole("menuitem", { name: "Editar conta" }).click();

		await page.getByRole("dialog").getByLabel("Valor por mês").fill("900,00");
		await page.getByRole("dialog").getByLabel("Dia do crédito").selectOption("5");
		await page.getByRole("button", { name: "Salvar" }).click();

		// Nothing is written when an allowance lands, so what is left is worked out from
		// the allowance and the spending. Before this the card simply said its balance.
		await go(page, "Painel");
		await expect(page.getByText("de R$ 900,00")).toBeVisible();
	});

	// Part 1, B.9 of the request for 2.0.0: the day of an allowance is chosen from a list that
	// starts empty, and an allowance with no day is refused with the reason, where the form
	// used to write the first of the month under an example showing the fifth.
	test("asks for the day an allowance lands, and writes none it was not given", async ({
		page,
	}) => {
		await openCofre(page, { demo: false });
		await go(page, "Contas");

		await page.getByRole("button", { name: "Nova conta" }).first().click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Nome").fill("VR");
		await dialog.getByLabel("Tipo").selectOption("voucher");
		await dialog.getByLabel("Valor por mês").fill("900,00");
		const day = dialog.getByLabel("Dia do crédito");
		await expect(day).toHaveValue("");
		await expect(day.locator("option").first()).toHaveText("Escolha o dia");
		await page.getByRole("button", { name: "Salvar" }).click();

		await expect(dialog.getByText("Escolha o dia em que ele cai")).toBeVisible();
		await day.selectOption("5");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "VR", exact: true })).toBeVisible();
	});

	// Part 1, B.4 of the request for 2.0.0, decision 3: how much is on a card that carries,
	// today, on the form that writes it down and on the one that corrects it.
	test("writes down how much is on a benefit card today, and counts from it", async ({ page }) => {
		await openCofre(page, { demo: false });
		await go(page, "Contas");

		await page.getByRole("button", { name: "Nova conta" }).first().click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Nome").fill("VR");
		await dialog.getByLabel("Tipo").selectOption("voucher");
		await dialog.getByLabel("Valor por mês").fill("900,00");
		await dialog.getByLabel("Dia do crédito").selectOption("5");
		await dialog.getByLabel("Quanto tem no cartão hoje").fill("300,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "VR", exact: true })).toBeVisible();

		await go(page, "Painel");
		await expect(page.getByText("R$ 300,00").first()).toBeVisible();
		await expect(page.getByText("de R$ 900,00").first()).toBeVisible();

		await go(page, "Contas");
		await page
			.getByRole("row")
			.filter({ hasText: "VR" })
			.getByRole("button", { name: "Ações da conta" })
			.click();
		await page.getByRole("menuitem", { name: "Editar conta" }).click();
		await expect(page.getByRole("dialog").getByLabel("Quanto tem no cartão hoje")).toHaveValue(
			"300,00",
		);
	});

	// Part 1, B.2 of the request for 2.0.0: the accounts screen showed the balance of the meal
	// card, minus 56, where the overview showed what is on it.
	test("shows on the meal card's row what the overview says is on it", async ({ page }) => {
		await openCofre(page);
		await expect(page.getByText("R$ 844,00").first()).toBeVisible();

		await go(page, "Contas");
		const row = page.getByRole("row").filter({ hasText: "Vale refeição" });
		await expect(row).toContainText("R$ 844,00");
		await expect(row).not.toContainText("56,00");
	});

	test("says what goes nowhere before deleting an account", async ({ page }) => {
		await openCofre(page);
		await go(page, "Contas");

		const row = page.getByRole("row").filter({ hasText: "Conta corrente" });
		await row.getByRole("button", { name: "Ações da conta" }).click();
		await page.getByRole("menuitem", { name: "Apagar" }).click();

		// It used to fire straight from the menu with nothing said about the records that
		// stay behind pointing at an account that is no longer there.
		const dialog = page.getByRole("dialog");
		await expect(dialog).toContainText("lançamentos nesta conta");
		await expect(dialog).toContainText("arquivar");
		// Part 1, H.1.5 of the request for 2.0.0: it said their money stops counting anywhere,
		// and the reports, the budget, the check up and the goals go on counting it.
		await expect(dialog).toContainText(
			"saem dos saldos e continuam contando nos relatórios, no orçamento, no diagnóstico e nas metas",
		);
		await expect(dialog).not.toContainText("deixa de ser contado");

		await dialog.getByRole("button", { name: "Cancelar" }).click();
		await expect(page.getByRole("cell", { name: "Conta corrente" }).first()).toBeVisible();
	});

	// Part 1, H.1.7 of the request for 2.0.0: correcting the days of a card moves nothing already
	// written, which the edit never said, and a comment beside it said the opposite.
	test("says that new days of a card leave the purchases already written alone", async ({
		page,
	}) => {
		await openCofre(page);
		await go(page, "Contas");
		const row = page.getByRole("row").filter({ hasText: "Cartão de crédito" }).first();
		await row.getByRole("button", { name: "Ações da conta" }).click();
		await page.getByRole("menuitem", { name: "Editar conta" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toContainText("As que já estão numa fatura ficam onde estão");
		await expect(dialog).toContainText("Esta fatura fechou em outro dia");
	});

	// Part 1, H.2.2 of the request for 2.0.0: the notes of 1.1.0 say a card written down with a
	// balance by an earlier release can still have that number corrected, and no screen asked
	// for it. Written down owing 500, it is corrected to 450, and the invoice it opens with says
	// so.
	test("corrects the debt an old card was written down with", async ({ browser }) => {
		const old = await restoredWith(browser, (tables) => {
			for (const account of tables.accounts ?? []) {
				if (account.name === "Cartão de crédito") account.initial_balance = -50_000;
			}
		});
		try {
			const page = old.page;
			await go(page, "Contas");
			const row = page.getByRole("row").filter({ hasText: "Cartão de crédito" }).first();
			await row.getByRole("button", { name: "Ações da conta" }).click();
			await page.getByRole("menuitem", { name: "Editar conta" }).click();
			const debt = page.getByRole("dialog").getByLabel("Dívida de quando foi cadastrado");
			await expect(debt).toHaveValue("500,00");
			await debt.fill("450,00");
			await page.getByRole("button", { name: "Salvar" }).click();
			await expect(page.getByRole("dialog")).toHaveCount(0);

			await row.getByRole("button", { name: "Ações da conta" }).click();
			await page.getByRole("menuitem", { name: "Editar conta" }).click();
			await expect(
				page.getByRole("dialog").getByLabel("Dívida de quando foi cadastrado"),
			).toHaveValue("450,00");
		} finally {
			await old.close();
		}
	});

	test("makes the card of a credit account without asking twice", async ({ page }) => {
		await openCofre(page);

		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();

		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Nome").fill("Cartão da loja");

		await dialog.getByLabel("Tipo").selectOption("credit");
		// One plastic that works both ways, said once, while the account is described.
		// The radio itself is only for the screen reader, so a person clicks the label.
		await dialog.getByText("Múltiplo", { exact: true }).click();
		await dialog.getByLabel("Quatro últimos dígitos").fill("5566");
		await dialog.getByRole("button", { name: "Salvar" }).click();

		// It is a card already, with no second form to fill in.
		await expect(page.getByText("Final 5566")).toBeVisible();
		await expect(page.getByText("Múltiplo: Fatura de Cartão da loja")).toBeVisible();

		// And it is looked after from the account it belongs to, not from the list.
		await page
			.getByRole("row")
			.filter({ hasText: "Cartão da loja" })
			.getByRole("button", { name: "Ações da conta" })
			.click();
		await expect(
			page.getByRole("menuitem", { name: "Editar cartão Cartão da loja" }),
		).toBeVisible();
	});

	test("adds a debit card without adding an account nobody asked for", async ({ page }) => {
		await openCofre(page);

		await go(page, "Contas");
		// Wait for the table before counting it. Accounts is one click away now rather than
		// two, so a count taken straight after arriving was taken before it had rendered.
		await expect(page.getByRole("cell", { name: "Conta corrente" }).first()).toBeVisible();
		const before = await page.getByRole("row").count();

		await page.getByRole("button", { name: "Nova conta" }).first().click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Nome").fill("Débito do banco");
		await dialog.getByLabel("Tipo").selectOption("credit");
		await dialog.getByText("Débito", { exact: true }).click();

		// A debit card spends an account that already exists, so there is no invoice to
		// describe and no balance to open, and the form says so.
		await expect(dialog.getByText("não cria conta nova", { exact: false })).toBeVisible();
		await expect(dialog.getByLabel("Dia do fechamento")).toHaveCount(0);
		await expect(dialog.getByLabel("Saldo de abertura")).toHaveCount(0);
		await dialog.getByLabel("Saldo que ele gasta").selectOption({ label: "Conta corrente" });
		await dialog.getByRole("button", { name: "Salvar" }).click();

		await expect(page.getByText("Débito: Saldo de Conta corrente")).toBeVisible();
		expect(await page.getByRole("row").count()).toBe(before);
	});

	test("takes the card away with the account it reached", async ({ page }) => {
		await openCofre(page);

		await go(page, "Contas");
		// The card of the demonstration space reaches the current account and the
		// invoice, so removing either one leaves it reaching half of nothing.
		await expect(page.getByText("Cartão do banco")).toBeVisible();

		await page
			.getByRole("row")
			.filter({ hasText: "Conta corrente" })
			.getByRole("button", { name: "Ações da conta" })
			.click();
		await page.getByRole("menuitem", { name: "Apagar" }).click();
		// Deleting an account asks first now, and says how many records go nowhere with it.
		await page.getByRole("dialog").getByRole("button", { name: "Apagar" }).click();

		await expect(page.getByText("Cartão do banco")).toHaveCount(0);
		// The meal voucher card is not on that account, so it stays.
		await expect(page.getByText("Final 8302")).toBeVisible();
	});

	test("removes a card from the account it belongs to", async ({ page }) => {
		await openCofre(page);

		await go(page, "Contas");
		await page
			.getByRole("row")
			.filter({ hasText: "Vale refeição" })
			.getByRole("button", { name: "Ações da conta" })
			.click();
		await page.getByRole("menuitem", { name: "Editar cartão Vale refeição" }).click();
		await page.getByRole("dialog").getByRole("button", { name: "Apagar cartão" }).click();

		await expect(page.getByText("Final 8302")).toHaveCount(0);
		// The account it spent is still there, and so is what was spent on it.
		await expect(page.getByRole("cell", { name: "Vale refeição", exact: true })).toBeVisible();
		await go(page, "Lista");
		await expect(record(page, "Almoço perto do trabalho")).toBeVisible();
	});

	test("adds a card and lets one purchase choose where it lands", async ({ page }) => {
		await openCofre(page);

		await go(page, "Contas");

		// A card with an account of its own is added where an account is added.
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		const adding = page.getByRole("dialog");
		await adding.getByLabel("Nome").fill("Cartão novo");
		await adding.getByLabel("Tipo").selectOption("credit");
		await adding.getByText("Múltiplo", { exact: true }).click();
		await adding.getByLabel("Quatro últimos dígitos").fill("7788");
		await adding.getByRole("button", { name: "Salvar" }).click();

		await expect(page.getByText("Final 7788")).toBeVisible();

		// The same plastic, used as credit: the purchase has to reach the invoice.
		//
		// One field, not two. The card and the account used to be separate pickers that
		// already behaved as one, so this chose the plastic and then read back what it had
		// done to the account beside it. The choice at the till is what it was paid with, and
		// the account comes with the answer.
		await go(page, "Lista");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Valor", { exact: true }).fill("99,90");
		await dialog.getByLabel("Descrição").fill("Compra com o cartão novo");
		await dialog.getByLabel("Pago com").selectOption({ label: "Cartão novo (Crédito)" });
		// And it says which invoice the purchase will land on, before it is written.
		await expect(dialog.getByText(/Entra na fatura de/)).toBeVisible();
		await dialog.getByRole("button", { name: "Salvar" }).click();

		await go(page, "Faturas");
		// Two invoices exist now, side by side on a wide screen, so the one is chosen there.
		await page
			.getByRole("group", { name: "Cartão" })
			.getByText("Cartão novo", { exact: true })
			.click();
		await expect(page.getByText("Cartão novo (Final 7788)")).toBeVisible();
		await expect(page.getByRole("cell", { name: "Compra com o cartão novo" })).toBeVisible();
	});

	// Part 1, D.11 of the request for 2.0.0. On the twenty eighth, a card that closes on the
	// twenty fifth and falls due on the fifth has two invoices somebody can mean: the open one,
	// and October's, closed and due on 5 November, which is what the bank shows first. Typed in
	// the one field there was, it landed on November.
	test("asks for the invoice that closed and is not due yet, on a card written down", async ({
		page,
	}) => {
		await openCofre(page);
		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		const adding = page.getByRole("dialog");
		await adding.getByLabel("Nome").fill("Cartão da loja");
		await adding.getByLabel("Tipo").selectOption("credit");
		await adding.getByLabel("Dia do fechamento").selectOption("25");
		await adding.getByLabel("Dia do vencimento").selectOption("5");
		await expect(adding.getByText(/conta como gasto de hoje no orçamento/)).toBeVisible();
		await adding.getByLabel("Fatura em aberto hoje").fill("300,00");
		await adding.getByLabel("Fatura fechada, que vence em 05/11").fill("1.200,00");
		await adding.getByRole("button", { name: "Salvar" }).click();
		await expect(adding).toHaveCount(0);

		await go(page, "Faturas");
		await page
			.getByRole("group", { name: "Cartão" })
			.getByText("Cartão da loja", { exact: true })
			.click();
		await expect(page.getByRole("heading", { level: 1 })).toContainText("novembro");
		await expect(record(page, "Fatura em aberto quando o cartão foi cadastrado")).toContainText(
			"300,00",
		);
		await page.getByRole("button", { name: "Fatura anterior" }).first().click();
		await expect(page.getByRole("heading", { level: 1 })).toContainText("outubro");
		await expect(record(page, "Fatura fechada quando o cartão foi cadastrado")).toContainText(
			"1.200,00",
		);
	});

	test("hides an archived account until it is asked for", async ({ page }) => {
		await openCofre(page);

		await go(page, "Contas");
		await page.getByRole("button", { name: "Ações da conta" }).first().click();
		await page.getByRole("menuitem", { name: "Arquivar" }).click();

		// The same menu now offers the opposite, which is how this knows the write
		// landed before it goes looking for the consequence on another screen.
		await page.getByRole("button", { name: "Ações da conta" }).first().click();
		await expect(page.getByRole("menuitem", { name: "Desarquivar" })).toBeVisible();
		await page.keyboard.press("Escape");

		await page.getByRole("link", { name: "Painel" }).click();
		await expect(page.getByRole("listitem").filter({ hasText: "Carteira" })).toHaveCount(0);
	});
});

test.describe("spaces", () => {
	test("switches space and carries the accounts of that space", async ({ page }) => {
		await openCofre(page);

		await openSetting(page, "Gerenciar espaços");
		await expect(page.getByRole("listitem").filter({ hasText: "Casa" })).toContainText(
			"Compartilhado",
		);

		await page.getByRole("button", { name: "Entrar" }).click();
		await expect(page.getByRole("banner")).toContainText("Casa");

		await go(page, "Contas");
		await expect(page.getByRole("cell", { name: "Conta conjunta" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "Carteira" })).toHaveCount(0);
	});

	test("says the personal space takes no members", async ({ page }) => {
		await openCofre(page);

		await openSetting(page, "Gerenciar espaços");
		await expect(
			page.getByText("Este espaço é só seu e não aceita membros", { exact: false }),
		).toBeVisible();
		await expect(page.getByRole("button", { name: "Convidar" })).toHaveCount(0);
	});

	/**
	 * Who is in a space sits under the list of spaces now, for whichever one is open, so
	 * this switches to the shared one and reads what appeared below.
	 */
	test("shows who is in the shared space and with which role", async ({ page }) => {
		await openCofre(page);

		await openSetting(page, "Gerenciar espaços");
		await page
			.getByRole("listitem")
			.filter({ hasText: "Casa" })
			.getByRole("button", { name: "Entrar" })
			.click();

		await expect(page.getByRole("cell", { name: "Você" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "Dono" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "João (exemplo)" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "Editor" })).toBeVisible();
	});
});
