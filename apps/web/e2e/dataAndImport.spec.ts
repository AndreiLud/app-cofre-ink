// Getting a statement in, and getting everything out.
//
// The promise these flows check is the one the product makes out loud: a file from the
// bank becomes records only after somebody looked at them, and everything can leave in
// one file that comes back somewhere else.

import { buildPdf, drawLines } from "@cofre/importers";
import { expect, test } from "@playwright/test";
import { go, openCofre, record } from "./support.ts";

const STATEMENT = [
	"Data;Historico;Valor",
	"12/01/2026;Padaria da esquina;-18,40",
	"13/01/2026;Reembolso do plano;250,00",
	"sem data;Linha quebrada;-1,00",
].join("\r\n");

const WITH_IDENTIFIERS = `OFXHEADER:100
DATA:OFXSGML

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260114<TRNAMT>-33.70<FITID>cofre1<MEMO>Farmacia do bairro</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260115<TRNAMT>-12.00<FITID>cofre2<MEMO>Estacionamento</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

async function pickStatement(
	page: import("@playwright/test").Page,
	name: string,
	body: string,
): Promise<void> {
	await page.getByLabel("Arquivo do banco").setInputFiles({
		name,
		mimeType: "text/plain",
		buffer: Buffer.from(body, "utf8"),
	});
}

test.describe("reading a statement", () => {
	test("writes only the lines the person kept", async ({ page }) => {
		await openCofre(page);

		await go(page, "Dados");
		await page.getByRole("button", { name: "Abrir a importação" }).click();
		await pickStatement(page, "extrato.csv", STATEMENT);

		// What it understood, said out loud before anything is written.
		await expect(page.getByText("2 lançamentos lidos de um arquivo CSV.")).toBeVisible();
		await expect(page.getByText("1 linha ficou de fora.")).toBeVisible();
		// Exactly, because the cell holding the checkbox is named after the record too.
		await expect(page.getByRole("cell", { name: "Padaria da esquina", exact: true })).toBeVisible();
		await expect(page.getByRole("cell", { name: "-R$ 18,40" })).toBeVisible();

		await page.getByRole("checkbox", { name: "Gravar Reembolso do plano" }).uncheck();
		await page.getByRole("button", { name: "Gravar 1 lançamento" }).click();

		await expect(page.getByText("1 lançamento gravado")).toBeVisible();

		await go(page, "Lançamentos");
		await page.getByLabel("Mês").fill("2026-01");
		await expect(record(page, "Padaria da esquina")).toBeVisible();
		await expect(record(page, "Reembolso do plano")).toHaveCount(0);
	});

	test("refuses to write the same entries a second time", async ({ page }) => {
		await openCofre(page);

		await go(page, "Dados");
		await page.getByRole("button", { name: "Abrir a importação" }).click();

		await pickStatement(page, "extrato.ofx", WITH_IDENTIFIERS);
		await page.getByRole("button", { name: "Gravar 2 lançamentos" }).click();
		await expect(page.getByText("2 lançamentos gravados")).toBeVisible();

		// The same file again: the bank gave each entry a name, so both are certain.
		await pickStatement(page, "extrato.ofx", WITH_IDENTIFIERS);
		await expect(page.getByText("2 parecem já estar aqui")).toBeVisible();
		await expect(page.getByRole("cell", { name: "O mesmo lançamento" })).toHaveCount(2);
		await expect(page.getByRole("button", { name: "Nada para gravar" })).toBeDisabled();
	});

	test("recognises a card invoice in a PDF and writes what was kept", async ({ page }) => {
		await openCofre(page);

		const invoice = buildPdf({
			content: drawLines([
				"Nubank",
				"Fatura do cartao de credito",
				"Vencimento: 10/02/2026",
				"Total desta fatura R$ 1.234,56",
				"Data Descricao Valor",
				"12/01/2026 Padaria da esquina 18,40",
				"13/01/2026 Assinatura de musica 21,90",
				"14/01/2026 Pagamento recebido 500,00",
			]),
			compress: true,
		});

		await go(page, "Dados");
		await page.getByRole("button", { name: "Abrir a importação" }).click();
		await page.getByLabel("Arquivo do banco").setInputFiles({
			name: "fatura.pdf",
			mimeType: "application/pdf",
			buffer: Buffer.from(invoice),
		});

		// What it understood about the document as a whole, before any record.
		await expect(page.getByText("Isto parece uma fatura de cartão")).toBeVisible();
		await expect(page.getByText("Nubank · vence em 2026-02-10")).toBeVisible();

		// And it picked the card by itself, saying why.
		await expect(page.getByLabel("Em qual conta")).toHaveValue(/.+/);
		await expect(page.getByText(/É uma fatura, e este é o seu único cartão/)).toBeVisible();

		// A charge is money leaving, a payment received is money arriving.
		await expect(page.getByRole("cell", { name: "-R$ 18,40" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "R$ 500,00", exact: true })).toBeVisible();

		await page.getByRole("button", { name: "Gravar 3 lançamentos" }).click();
		await expect(page.getByText("3 lançamentos gravados")).toBeVisible();

		await go(page, "Lançamentos");
		await page.getByLabel("Mês").fill("2026-01");
		await expect(record(page, "Padaria da esquina")).toBeVisible();
		await expect(record(page, "Pagamento recebido")).toBeVisible();
	});

	test("says a PDF is a picture instead of pretending to read it", async ({ page }) => {
		await openCofre(page);

		const scan = buildPdf({ content: "q 100 0 0 100 50 700 cm /Im0 Do Q\n" });

		await go(page, "Dados");
		await page.getByRole("button", { name: "Abrir a importação" }).click();
		await page.getByLabel("Arquivo do banco").setInputFiles({
			name: "escaneado.pdf",
			mimeType: "application/pdf",
			buffer: Buffer.from(scan),
		});

		await expect(page.getByText("Este PDF não tem texto dentro")).toBeVisible();
	});

	test("says it could not read a file instead of falling over", async ({ page }) => {
		await openCofre(page);

		await go(page, "Dados");
		await page.getByRole("button", { name: "Abrir a importação" }).click();
		await pickStatement(page, "foto.json", "{ isto nao e json");

		await expect(page.getByText("Não achei lançamentos neste arquivo")).toBeVisible();
	});
});

test.describe("taking the data out", () => {
	test("hands over a backup of the space", async ({ page }) => {
		await openCofre(page, { space: "Meu dinheiro" });

		await go(page, "Dados");

		const download = page.waitForEvent("download");
		await page.getByRole("button", { name: "Backup de Meu dinheiro" }).click();
		const file = await download;

		expect(file.suggestedFilename()).toMatch(/^cofre_espaco_\d{8}\.json$/);
	});

	test("hands over the records as a spreadsheet", async ({ page }) => {
		await openCofre(page);

		await go(page, "Dados");

		const download = page.waitForEvent("download");
		await page.getByRole("button", { name: "Lançamentos em planilha" }).click();
		const file = await download;

		expect(file.suggestedFilename()).toMatch(/^cofre_lancamentos_\d{8}\.csv$/);
	});
});
