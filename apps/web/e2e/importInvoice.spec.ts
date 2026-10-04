// Reading a card invoice in. Part 2, section E of the request for 2.0.0, on the fixed day of the
// suite, the twenty eighth of October of 2026.

import { buildPdf, drawLines } from "@cofre/importers";
import { expect, type Page, test } from "@playwright/test";
import { fourCards, go, openCofre } from "./support.ts";

/** A bank account and two cards that close on the third and fall due on the tenth. */
async function twoCards(page: Page): Promise<void> {
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
		await expect(page.getByRole("table").getByText(name, { exact: true })).toBeVisible();
	};
	await account("Banco", (dialog) => dialog.getByLabel("Saldo de abertura").fill("5.000,00"));
	for (const [name, digits] of [
		["Nubank", ""],
		["Itaú", "1234"],
	] as const) {
		await account(name, async (dialog) => {
			await dialog.getByLabel("Tipo").selectOption("credit");
			await dialog.getByLabel("Dia do fechamento").selectOption("3");
			await dialog.getByLabel("Dia do vencimento").selectOption("10");
			if (digits !== "") await dialog.getByLabel("Quatro últimos dígitos").fill(digits);
		});
	}
}

/** Opens the import with a PDF made of these lines. */
async function importPdf(page: Page, lines: readonly string[]): Promise<void> {
	await go(page, "Dados");
	await page.getByRole("button", { name: "Abrir a importação" }).click();
	await page.getByLabel("Arquivo do banco").setInputFiles({
		name: "fatura.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from(buildPdf({ content: drawLines(lines), compress: true })),
	});
	await expect(page.getByText("Isto parece uma fatura de cartão")).toBeVisible();
}

const SEPTEMBER = [
	"Fatura do cartao",
	"Vencimento: 10/10/2026",
	"Total desta fatura R$ 150,00",
	"12/09/2026 Padaria 50,00",
	"13/09/2026 Mercado 100,00",
];

test.describe("reading a card invoice in", () => {
	// E.7.4: with no guess the screen fell on the first account, so an invoice landed on a
	// current account nobody chose; and what was remembered beat the digits of the card.
	test("waits for the card when the invoice does not say it, and goes by the digits when it does", async ({
		page,
	}) => {
		await twoCards(page);
		await importPdf(page, SEPTEMBER);
		const card = page.getByLabel("Cartão", { exact: true });
		await expect(card).toHaveValue("");
		await expect(page.getByText("O arquivo não diz de qual cartão é.")).toBeVisible();
		await expect(page.getByRole("button", { name: "Gravar 2 lançamentos" })).toBeDisabled();

		// Written to the Nubank by choice, with the digits of the Itaú on it: that is remembered.
		await importPdf(page, [...SEPTEMBER.slice(0, 3), "Cartao final 1234", ...SEPTEMBER.slice(3)]);
		await expect(card.locator("option:checked")).toHaveText("Itaú");
		await card.selectOption({ label: "Nubank" });
		await page.getByRole("button", { name: "Gravar 2 lançamentos" }).click();
		await expect(page.getByText("2 lançamentos gravados")).toBeVisible();

		// And the same invoice again opens on the card its digits name.
		await importPdf(page, [...SEPTEMBER.slice(0, 3), "Cartao final 1234", ...SEPTEMBER.slice(3)]);
		await expect(card.locator("option:checked")).toHaveText("Itaú");
	});

	// E.8: a PDF had no control over its signs, and a sign remembered for the shape of a file
	// beat what the file itself showed.
	test("lets every sign and each line be turned round, and reads a file before its memory", async ({
		page,
	}) => {
		await twoCards(page);
		await importPdf(page, SEPTEMBER);
		await expect(page.getByRole("cell", { name: "-R$ 50,00" })).toBeVisible();
		// E.9: the invoice checks itself against its total.
		await expect(page.getByText("As linhas somam o que o documento diz.")).toBeVisible();
		await page.getByRole("button", { name: "Inverter todos os sinais" }).click();
		await expect(page.getByRole("cell", { name: "R$ 50,00", exact: true })).toBeVisible();
		await expect(page.getByText("Somam R$ 300,00 a menos do que o documento diz.")).toBeVisible();
		await page.getByLabel("Sentido de Padaria").selectOption({ label: "Saída" });
		await expect(page.getByRole("cell", { name: "-R$ 50,00" })).toBeVisible();
		await expect(page.getByLabel("O que é Padaria")).toHaveValue("purchase");

		// A file of purchases, all positive, written to the Itaú: its shape remembers purchases.
		const csv = (rows: string[]) => ({
			name: "fatura.csv",
			mimeType: "text/plain",
			buffer: Buffer.from(["date,title,amount", ...rows].join("\n"), "utf8"),
		});
		await go(page, "Dados");
		await page.getByRole("button", { name: "Abrir a importação" }).click();
		await page
			.getByLabel("Arquivo do banco")
			.setInputFiles(
				csv(["2026-08-03,Padaria,18.50", "2026-08-05,Mercado,249.90", "2026-08-08,Spotify,21.90"]),
			);
		await page.getByLabel("Cartão", { exact: true }).selectOption({ label: "Itaú" });
		await page.getByRole("button", { name: "Gravar 3 lançamentos" }).click();
		await expect(page.getByText("3 lançamentos gravados")).toBeVisible();

		// The same shape with a payment and a refund written negative: the file says how.
		await page
			.getByLabel("Arquivo do banco")
			.setInputFiles(
				csv([
					"2026-09-03,Padaria,18.50",
					"2026-09-05,Mercado,249.90",
					"2026-09-08,Spotify,21.90",
					"2026-09-10,Pagamento recebido,-1500.00",
					"2026-09-12,Estorno Loja,-50.00",
				]),
			);
		await expect(
			page.getByRole("radio", { name: "Gastos positivos, pagamentos negativos" }),
		).toBeChecked();
		await expect(page.getByRole("cell", { name: "R$ 1.500,00", exact: true })).toBeVisible();
		await expect(page.getByLabel("O que é Pagamento recebido")).toHaveValue("payment");
		await expect(page.getByLabel("O que é Estorno Loja")).toHaveValue("credit");
	});

	// E.7.4 and E.10: every line went on the invoice of its own day, so the invoice of the card
	// did not show what the document said it charged.
	test("puts the whole invoice on the month it is, so the card shows its total", async ({
		page,
	}) => {
		await twoCards(page);
		// A purchase on the closing day itself, which the bank put on this invoice and the day
		// alone puts on the next one.
		await importPdf(page, [
			"Fatura do cartao",
			"Vencimento: 10/10/2026",
			"Total desta fatura R$ 160,00",
			"12/09/2026 Padaria 50,00",
			"13/09/2026 Mercado 100,00",
			"03/10/2026 Cafe 10,00",
		]);
		await page.getByLabel("Cartão", { exact: true }).selectOption({ label: "Itaú" });
		await expect(page.getByLabel("Fatura de").locator("option:checked")).toHaveText(
			"outubro de 2026",
		);
		await page.getByRole("button", { name: "Gravar 3 lançamentos" }).click();
		await expect(page.getByText("3 lançamentos gravados")).toBeVisible();

		// The October invoice of the Itaú is owed and late now, so the invoices open on that card.
		await go(page, "Faturas");
		await expect(page.getByRole("heading", { level: 1 })).toContainText("Itaú");
		await page.getByRole("button", { name: "Fatura anterior", exact: true }).click();
		await expect(page.getByRole("heading", { level: 1 })).toContainText("outubro");
		await expect(page.getByText("R$ 160,00").first()).toBeVisible();
	});

	// E.11: the payment on an invoice was income on the card, and the month earned what it paid.
	test("writes the payment as the invoice before paid from the bank, and does not write it twice", async ({
		page,
	}) => {
		await twoCards(page);
		const invoice = [
			"Fatura do cartao",
			"Vencimento: 10/10/2026",
			"Total desta fatura R$ 150,00",
			"12/09/2026 Padaria 50,00",
			"13/09/2026 Mercado 100,00",
			"15/09/2026 Pagamento recebido -1.000,00",
		];
		await importPdf(page, invoice);
		await page.getByLabel("Cartão", { exact: true }).selectOption({ label: "Itaú" });
		await expect(page.getByText("Paga a fatura de setembro de 2026.")).toBeVisible();
		await expect(page.getByRole("button", { name: "Gravar 3 lançamentos" })).toBeDisabled();
		await page.getByLabel("De onde saiu Pagamento recebido").selectOption({ label: "Banco" });
		await page.getByRole("button", { name: "Gravar 3 lançamentos" }).click();
		await expect(page.getByText("3 lançamentos gravados")).toBeVisible();

		await go(page, "Lançamentos");
		await page.getByLabel("Mês", { exact: true }).fill("2026-09");
		await expect(
			page.getByRole("row").filter({ hasText: "Pagamento da fatura de setembro de 2026 (Itaú)" }),
		).toBeVisible();

		// The same file again: the invoice before already has its payment.
		await importPdf(page, invoice);
		await page.getByLabel("Cartão", { exact: true }).selectOption({ label: "Itaú" });
		await expect(
			page.getByRole("checkbox", { name: "Gravar Pagamento recebido" }),
		).not.toBeChecked();
	});

	// E.12: a refund went in as money coming in, beside the purchase it undid.
	test("leaves a purchase and its refund out, and takes back one already written", async ({
		page,
	}) => {
		await twoCards(page);
		await importPdf(page, [
			"Fatura do cartao",
			"Vencimento: 10/10/2026",
			"Total desta fatura R$ 0,00",
			"Cartao final 1234",
			"02/09/2026 Loja X 50,00",
			"14/09/2026 Estorno Loja X -50,00",
		]);
		await expect(page.getByRole("checkbox", { name: "Gravar Loja X" })).not.toBeChecked();
		await expect(page.getByRole("checkbox", { name: "Gravar Estorno Loja X" })).not.toBeChecked();
		await expect(page.getByRole("button", { name: "Nada para gravar" })).toBeDisabled();

		// The purchase written by hand, and its refund read in afterwards.
		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		await form.getByLabel("Pago com").selectOption({ label: "Itaú" });
		await form.getByLabel("Valor", { exact: true }).fill("50,00");
		await form.getByLabel("Descrição").fill("Loja X");
		await form.getByLabel("Dia").fill("2026-09-02");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);

		await importPdf(page, [
			"Fatura do cartao",
			"Vencimento: 10/10/2026",
			"Cartao final 1234",
			"14/09/2026 Estorno Loja X -50,00",
		]);
		await expect(page.getByRole("checkbox", { name: /Tirar a compra Loja X/ })).toBeChecked();
		await page.getByRole("button", { name: "Gravar 1 lançamento" }).click();

		await go(page, "Lançamentos");
		await page.getByLabel("Mês", { exact: true }).fill("2026-09");
		await expect(page.getByRole("row").filter({ hasText: "Loja X" })).toHaveCount(0);
	});

	// E.13: a part printed on an invoice was one loose record, and the next invoice another.
	test("writes a plan from the first invoice that prints it, and finds it on the next", async ({
		page,
	}) => {
		await twoCards(page);
		await importPdf(page, [
			"Fatura do cartao",
			"Vencimento: 10/10/2026",
			"Cartao final 1234",
			"12/09/2026 Loja X PARC 05/10 150,00",
		]);
		await expect(
			page.getByText(/Plano novo: grava as parcelas 5 a 10, de outubro a março/),
		).toBeVisible();
		await page.getByRole("button", { name: "Gravar 1 lançamento" }).click();
		await expect(page.getByText("6 lançamentos gravados")).toBeVisible();

		await importPdf(page, [
			"Fatura do cartao",
			"Vencimento: 10/11/2026",
			"Cartao final 1234",
			"12/10/2026 Loja X PARC 06/10 150,00",
		]);
		await expect(page.getByText("Já está no app: parcela 6 de 10 de Loja X 6/10.")).toBeVisible();
		await expect(page.getByRole("checkbox", { name: "Gravar Loja X" })).not.toBeChecked();

		await go(page, "Lançamentos");
		await page.getByLabel("Mês", { exact: true }).fill("2026-10");
		await expect(page.getByRole("row").filter({ hasText: "Loja X" })).toHaveCount(1);
		await page.getByLabel("Mês", { exact: true }).fill("2027-02");
		await expect(page.getByRole("row").filter({ hasText: "Loja X 10/10" })).toBeVisible();
	});

	// E.14: the bank prints a split invoice as charges on the invoices after it, and read in as
	// purchases they counted the split twice.
	test("writes nothing of a split already written when the bank's invoice prints it", async ({
		page,
	}) => {
		await fourCards(page);
		await go(page, "Faturas");
		await page.getByRole("group", { name: "Cartão" }).getByText("Itaú", { exact: true }).click();
		await page.getByRole("button", { name: "Fatura anterior", exact: true }).click();
		await expect(page.getByRole("heading", { level: 1 })).toContainText("outubro");
		await page.getByRole("button", { name: "Pagar fatura" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByText("Parcelando", { exact: true }).click();
		await dialog.getByLabel("Entrada", { exact: true }).fill("300,00");
		await dialog.getByLabel("Parcelas", { exact: true }).selectOption({ label: "6 vezes" });
		await dialog.getByText("O valor é de cada parcela", { exact: true }).click();
		await dialog.getByLabel("Valor das parcelas").fill("110,00");
		await dialog.getByLabel("Dia do acordo").fill("2026-10-28");
		await dialog.getByRole("button", { name: "Parcelar" }).click();
		await expect(dialog).toHaveCount(0);

		await importPdf(page, [
			"Fatura do cartao",
			"Vencimento: 05/12/2026",
			"28/10/2026 Parcelamento de fatura 1/6 100,00",
			"28/10/2026 Encargos de parcelamento 7,00",
			"28/10/2026 IOF de financiamento 3,00",
		]);
		await page.getByLabel("Cartão", { exact: true }).selectOption({ label: "Itaú" });
		await expect(
			page.getByText("Já está no app: é do parcelamento da fatura", { exact: false }),
		).toHaveCount(3);
		await expect(page.getByRole("button", { name: "Nada para gravar" })).toBeDisabled();
	});

	// E.16: the payment of a card on the statement of the bank was money spent.
	test("writes a card paid from a statement as its invoice paid, and knows it the next time", async ({
		page,
	}) => {
		await twoCards(page);
		const statement = [
			"Banco Exemplo",
			"Extrato de conta corrente",
			"Agencia 0001 Conta 12345-6",
			"01/10/2026 Saldo anterior 5.000,00",
			"10/10/2026 PAG FATURA NUBANK 1.234,56 3.765,44",
		];
		const open = async () => {
			await go(page, "Dados");
			await page.getByRole("button", { name: "Abrir a importação" }).click();
			await page.getByLabel("Arquivo do banco").setInputFiles({
				name: "extrato.pdf",
				mimeType: "application/pdf",
				buffer: Buffer.from(buildPdf({ content: drawLines(statement), compress: true })),
			});
			await expect(page.getByText("Isto parece um extrato")).toBeVisible();
		};
		await open();
		await expect(page.getByLabel("Cartão pago por PAG FATURA NUBANK")).toHaveValue(/.+/);
		await page.getByRole("button", { name: "Gravar 1 lançamento" }).click();
		await expect(page.getByText("1 lançamento gravado")).toBeVisible();

		await go(page, "Lançamentos");
		await page.getByLabel("Mês", { exact: true }).fill("2026-10");
		await expect(
			page.getByRole("row").filter({ hasText: "Pagamento da fatura de outubro de 2026 (Nubank)" }),
		).toBeVisible();

		await open();
		await expect(
			page.getByRole("checkbox", { name: "Gravar PAG FATURA NUBANK" }),
		).not.toBeChecked();
		await expect(page.getByRole("cell", { name: "Já está aqui" })).toBeVisible();
	});

	// The reader said everything was ready above a payment that still waited for its card.
	test("does not call a statement ready while a card payment waits for its card", async ({
		page,
	}) => {
		await twoCards(page);
		await go(page, "Dados");
		await page.getByRole("button", { name: "Abrir a importação" }).click();
		await page.getByLabel("Arquivo do banco").setInputFiles({
			name: "extrato.pdf",
			mimeType: "application/pdf",
			buffer: Buffer.from(
				buildPdf({
					content: drawLines([
						"Banco Exemplo",
						"Extrato de conta corrente",
						"Agencia 0001 Conta 12345-6",
						"01/10/2026 Saldo anterior 5.000,00",
						"03/10/2026 PIX RECEBIDO 200,00 5.200,00",
						"10/10/2026 PAG FATURA CARTAO 433,40 4.766,60",
					]),
					compress: true,
				}),
			),
		});
		await expect(page.getByText("Isto parece um extrato")).toBeVisible();
		await expect(
			page.getByText('"PAG FATURA CARTAO" pagou a fatura de um cartão. Diga qual para gravar.'),
		).toBeVisible();
		await expect(page.getByText("Está tudo pronto", { exact: false })).toHaveCount(0);

		await page.getByLabel("Cartão pago por PAG FATURA CARTAO").selectOption({ label: "Nubank" });
		await expect(
			page.getByText(
				"Está tudo pronto: 2 lançamentos para Banco, nada em dúvida e nada repetido. É só gravar.",
			),
		).toBeVisible();
	});

	// E.18: an import could only be taken back record by record.
	test("takes back an invoice with a new plan and a payment, leaving everything as it was", async ({
		page,
	}) => {
		await twoCards(page);
		await importPdf(page, [
			"Fatura do cartao",
			"Vencimento: 10/10/2026",
			"Total desta fatura R$ 150,00",
			"12/09/2026 Loja X PARC 05/10 150,00",
			"15/09/2026 Pagamento recebido -1.000,00",
		]);
		await page.getByLabel("Cartão", { exact: true }).selectOption({ label: "Itaú" });
		await page.getByLabel("De onde saiu Pagamento recebido").selectOption({ label: "Banco" });
		await page.getByRole("button", { name: "Gravar 2 lançamentos" }).click();
		await expect(page.getByText("7 lançamentos gravados")).toBeVisible();

		await page.getByRole("button", { name: "Desfazer esta importação" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toContainText("Vão embora os 7 lançamentos que ela gravou");
		await dialog.getByRole("button", { name: "Desfazer", exact: true }).click();
		await expect(page.getByText("A importação foi desfeita: 7 lançamentos saíram.")).toBeVisible();

		await go(page, "Lançamentos");
		for (const month of ["2026-09", "2026-10", "2027-02"]) {
			await page.getByLabel("Mês", { exact: true }).fill(month);
			await expect(page.getByRole("row").filter({ hasText: "Loja X" })).toHaveCount(0);
			await expect(page.getByRole("row").filter({ hasText: "Pagamento da fatura" })).toHaveCount(0);
		}
	});

	// E.10.2: the card written down with what its open invoice held, and that invoice read in
	// line by line, counted the same purchases twice.
	test("takes out the record a card was written down with when its invoice comes in", async ({
		page,
	}) => {
		await openCofre(page, { demo: false });
		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Nome").fill("Nubank");
		await dialog.getByLabel("Tipo").selectOption("credit");
		await dialog.getByLabel("Dia do fechamento").selectOption("3");
		await dialog.getByLabel("Dia do vencimento").selectOption("10");
		await dialog.getByLabel("Fatura em aberto hoje").fill("150,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(dialog).toHaveCount(0);

		await importPdf(page, [
			"Fatura do cartao",
			"Vencimento: 10/11/2026",
			"Total desta fatura R$ 150,00",
			"12/10/2026 Padaria 50,00",
			"13/10/2026 Mercado 100,00",
		]);
		const replace = page.getByRole("checkbox", { name: /Tirar "Fatura em aberto/ });
		await expect(replace).toBeChecked();
		await page.getByRole("button", { name: "Gravar 2 lançamentos" }).click();
		await expect(page.getByText("2 lançamentos gravados")).toBeVisible();

		await go(page, "Lançamentos");
		await page.getByLabel("Mês", { exact: true }).fill("2026-10");
		await expect(page.getByRole("row").filter({ hasText: "Padaria" })).toBeVisible();
		await expect(page.getByRole("row").filter({ hasText: "Fatura em aberto" })).toHaveCount(0);
	});

	// E.7.3: the invoices of a card open the import on that card and that month.
	test("opens the import from an invoice on its card and its month", async ({ page }) => {
		await twoCards(page);
		await go(page, "Faturas");
		await page.getByRole("group", { name: "Cartão" }).getByText("Itaú", { exact: true }).click();
		await page.getByRole("button", { name: "Importar fatura" }).click();
		await page.getByLabel("Arquivo do banco").setInputFiles({
			name: "fatura.pdf",
			mimeType: "application/pdf",
			buffer: Buffer.from(buildPdf({ content: drawLines(SEPTEMBER), compress: true })),
		});
		await expect(page.getByLabel("Cartão", { exact: true }).locator("option:checked")).toHaveText(
			"Itaú",
		);
		await expect(page.getByLabel("Fatura de").locator("option:checked")).toHaveText(
			"novembro de 2026",
		);
	});
});
