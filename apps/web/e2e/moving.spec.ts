// Moving money between two accounts of the same person, which is not spending and not
// money coming in, and which used to be the third kind on the form for a record.

import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { figure, go, openCofre, record } from "./support.ts";

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

/** A statement with one line, in the format a bank hands out with a mark on every entry. */
function statement(mark: string, amount: string, memo: string): string {
	return `OFXHEADER:100
DATA:OFXSGML

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKTRANLIST>
<STMTTRN><TRNTYPE>OTHER<DTPOSTED>20261020<TRNAMT>${amount}<FITID>${mark}<MEMO>${memo}</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
}

/** Reads one statement into one account, and says what the screen offered to write. */
async function readInto(page: Page, account: string, name: string, body: string): Promise<void> {
	await go(page, "Dados");
	await page.getByRole("button", { name: "Abrir a importação" }).click();
	await page.getByLabel("Arquivo do banco").setInputFiles({
		name,
		mimeType: "text/plain",
		buffer: Buffer.from(body, "utf8"),
	});
	await page.getByLabel("Em qual conta").selectOption({ label: account });
}

test.describe("moving money between accounts", () => {
	// Part 2, A.8.5 of the request for 2.0.0: "PIX POUPANCA" of 500 on two statements, money
	// out of the current account and money into savings. Joined, it is one move and 500 more
	// in savings, not 1,000, and reading both statements again writes nothing.
	test("joins a Pix read from two statements into one move, and reads neither again", async ({
		page,
	}) => {
		await openCofre(page);
		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Reserva");
		await page.getByRole("dialog").getByLabel("Tipo").selectOption("savings");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("cell", { name: "Reserva", exact: true })).toBeVisible();

		const out = statement("corr1", "-500.00", "PIX POUPANCA");
		const into = statement("poup1", "500.00", "PIX POUPANCA");
		await readInto(page, "Conta corrente", "corrente.ofx", out);
		await page.getByRole("button", { name: "Gravar 1 lançamento" }).click();
		await expect(page.getByText("1 lançamento gravado")).toBeVisible();
		await readInto(page, "Reserva", "reserva.ofx", into);
		await page.getByRole("button", { name: "Gravar 1 lançamento" }).click();
		await expect(page.getByText("1 lançamento gravado")).toBeVisible();

		await go(page, "Lançamentos");
		await record(page, "PIX POUPANCA")
			.filter({ hasText: "-R$ 500,00" })
			.getByRole("button", { name: "Ações" })
			.click();
		await page.getByRole("menuitem", { name: "Era entre contas suas" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Foi para").selectOption({ label: "Reserva" });
		const join = dialog.getByRole("checkbox", { name: /Juntar com "PIX POUPANCA"/ });
		await expect(join).toBeChecked();
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(dialog).toHaveCount(0);

		await expect(record(page, "PIX POUPANCA")).toHaveCount(1);
		await expect(record(page, "PIX POUPANCA")).toContainText("Conta corrente → Reserva");

		await go(page, "Contas");
		await expect.poll(() => balanceOf(page, "Reserva")).toBe(50_000);

		// Both statements again: the current account knows its line by the bank's mark, and
		// savings knows its line as the move that reached it.
		for (const [account, name, body] of [
			["Conta corrente", "corrente.ofx", out],
			["Reserva", "reserva.ofx", into],
		] as const) {
			await readInto(page, account, name, body);
			await expect(page.getByRole("button", { name: "Nada para gravar" })).toBeDisabled();
		}
	});

	// Part 2, A.8.6 of the request for 2.0.0: the importer of 1.2.1 wrote the payment of an
	// invoice twice, "PAGAMENTO FATURA" as money out of the bank and "PAGAMENTO RECEBIDO" as
	// money in on the card. Written here as that importer wrote them, by a backup edited the
	// way 1.2.1 left it, because nothing in this release writes money in on a card.
	test("joins an invoice payment written from both ends, paid once and no longer income", async ({
		browser,
	}) => {
		const first = await browser.newContext({ acceptDownloads: true });
		const second = await browser.newContext({ acceptDownloads: true });
		try {
			const one = await first.newPage();
			await openCofre(one);
			await go(one, "Lançamentos");
			const write = async (
				kind: "Saída" | "Entrada",
				description: string,
				day: string,
				way?: string,
			) => {
				await one.getByRole("button", { name: "Novo lançamento" }).first().click();
				const form = one.getByRole("dialog");
				await form.getByText(kind, { exact: true }).click();
				if (way) await form.getByLabel("Pago com").selectOption({ label: way });
				await form.getByLabel("Valor", { exact: true }).fill("1.234,56");
				await form.getByLabel("Descrição").fill(description);
				await form.getByLabel("Dia").fill(day);
				await one.getByRole("button", { name: "Salvar" }).click();
				await expect(form).toHaveCount(0);
			};
			// The purchase on the invoice that closed on the third of October and fell due on the tenth.
			await write("Saída", "Geladeira", "2026-09-20", "Cartão do banco (Crédito)");
			await write("Saída", "PAGAMENTO FATURA", "2026-10-10", "Conta corrente");
			await write("Entrada", "PAGAMENTO RECEBIDO", "2026-10-10");

			await go(one, "Dados");
			const download = one.waitForEvent("download");
			await one.getByRole("button", { name: "Baixar", exact: true }).first().click();
			const backup = JSON.parse(await readFile(await (await download).path(), "utf8")) as {
				spaces: { tables: Record<string, Record<string, unknown>[]> }[];
			};
			let cardId = "";
			for (const space of backup.spaces) {
				const card = (space.tables.accounts ?? []).find((row) => row.kind === "credit");
				if (!card) continue;
				cardId = String(card.id);
				for (const row of space.tables.transactions ?? []) {
					if (row.description !== "PAGAMENTO RECEBIDO") continue;
					// Money in on the card, on the invoice a purchase of that day would land on.
					row.account_id = cardId;
					row.invoice_month = "2026-11";
					row.category_id = null;
				}
			}
			expect(cardId).not.toBe("");

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

			// October of the sample came in 6,120 and 900 of benefit and went out 726.40, with the
			// 297.90 the second card of the demonstration holds since 2.0.0, and the payment written
			// twice is in both.
			await go(page, "Painel");
			await expect(figure(page, "Entrou")).toHaveText("R$ 8.254,56");
			await expect(figure(page, "Saiu")).toHaveText("-R$ 2.258,86");

			await go(page, "Lançamentos");
			await record(page, "PAGAMENTO FATURA").getByRole("button", { name: "Ações" }).click();
			await page.getByRole("menuitem", { name: "Era entre contas suas" }).click();
			const dialog = page.getByRole("dialog");
			await dialog.getByLabel("Foi para").selectOption({ label: "Cartão de crédito" });
			await expect(dialog.getByLabel("Fatura paga").locator("option:checked")).toContainText(
				"outubro de 2026",
			);
			await expect(
				dialog.getByRole("checkbox", { name: /Juntar com "PAGAMENTO RECEBIDO"/ }),
			).toBeChecked();
			await page.getByRole("button", { name: "Salvar" }).click();
			await expect(dialog).toHaveCount(0);
			await expect(record(page, "PAGAMENTO RECEBIDO")).toHaveCount(0);

			// Paid once, and the next invoice holds no credit the payment left behind.
			await page.goto(`/faturas?cartao=${cardId}&mes=2026-10`);
			await expect(page.getByText("Paga", { exact: true }).first()).toBeVisible();
			await page.goto(`/faturas?cartao=${cardId}&mes=2026-11`);
			await expect(page.getByText(/crédito a (seu )?favor/)).toHaveCount(0);

			await go(page, "Painel");
			// The 726.40 of the sample and the 297.90 of its second card.
			await expect(figure(page, "Entrou")).toHaveText("R$ 7.020,00");
			await expect(figure(page, "Saiu")).toHaveText("-R$ 1.024,30");
		} finally {
			await first.close();
			await second.close();
		}
	});

	// Part 2, A.3.2 of the request for 2.0.0: the rule counts only money moved into its
	// account, so its shortcut is a move with the account and what is missing already in it,
	// and so is the one of a goal.
	test("puts aside what the rule asks for, and adds to a goal, from their own lines", async ({
		page,
	}) => {
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
		await expect(rule).toHaveCount(0);

		await go(page, "Painel");
		await page.getByRole("button", { name: "Guardar agora" }).click();
		const move = page.getByRole("dialog");
		await expect(move.getByLabel("Para", { exact: true }).locator("option:checked")).toHaveText(
			"Reserva",
		);
		await expect(move.getByLabel("Valor", { exact: true })).toHaveValue("500,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(move).toHaveCount(0);
		await expect(page.getByText(/Guardados R\$/)).toContainText("Guardados R$ 500,00");
		await expect(page.getByRole("button", { name: "Guardar agora" })).toHaveCount(0);

		await go(page, "Orçamento");
		await page.getByRole("button", { name: "Nova meta" }).click();
		const goal = page.getByRole("dialog");
		await goal.getByLabel("Nome").fill("Viagem");
		await goal.getByLabel("Quanto", { exact: true }).fill("2.000,00");
		await goal.getByLabel("Onde o dinheiro fica").selectOption({ label: "Reserva" });
		await page.getByRole("button", { name: "Salvar" }).click();
		const line = page.getByRole("listitem").filter({ hasText: "Viagem" });
		await expect(line).toContainText("R$ 500,00");

		await line.getByRole("button", { name: "Pôr na meta" }).click();
		await expect(move.getByLabel("Para", { exact: true }).locator("option:checked")).toHaveText(
			"Reserva",
		);
		await move.getByLabel("Valor", { exact: true }).fill("300,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(move).toHaveCount(0);
		await expect(line).toContainText("R$ 800,00");
	});

	// Part 2, A.8.3 of the request for 2.0.0: a top up by Pix is money moved onto the card,
	// which raises what is left on it and is neither spending nor money coming in.
	test("tops up a benefit card from its line, and the reports stay as they were", async ({
		page,
	}) => {
		await openCofre(page);
		await go(page, "Relatórios");
		const october = page.getByRole("row").filter({ hasText: /^outubro/ });
		const before = await october.innerText();

		await go(page, "Painel");
		// The sample's meal card: 900 a month, and a lunch of 56 on it.
		await expect(page.getByText("R$ 844,00").first()).toBeVisible();
		await page.getByRole("button", { name: "Recarregar" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog.getByRole("heading", { name: "Recarregar Vale refeição" })).toBeVisible();
		await expect(dialog.getByLabel("Para", { exact: true }).locator("option:checked")).toHaveText(
			"Vale refeição",
		);
		await dialog.getByLabel("Valor", { exact: true }).fill("100,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(dialog).toHaveCount(0);

		await page.reload();
		await expect(page.getByText("R$ 944,00").first()).toBeVisible({ timeout: 45_000 });

		await go(page, "Relatórios");
		const flat = (text: string) => text.replace(/\s+/g, "");
		await expect.poll(async () => flat(await october.innerText())).toBe(flat(before));
	});

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
