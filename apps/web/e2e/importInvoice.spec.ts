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
