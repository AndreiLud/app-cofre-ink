// Reading a card invoice in. Part 2, section E of the request for 2.0.0, on the fixed day of the
// suite, the twenty eighth of October of 2026.

import { buildPdf, drawLines } from "@cofre/importers";
import { expect, type Page, test } from "@playwright/test";
import { go, openCofre } from "./support.ts";

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
