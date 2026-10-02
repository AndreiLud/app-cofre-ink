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
		await page.getByLabel("Mês", { exact: true }).fill("2026-01");
		await expect(record(page, "Padaria da esquina")).toBeVisible();
		await expect(record(page, "Reembolso do plano")).toHaveCount(0);
	});

	test("reads a card invoice as spending, although nothing in it is negative", async ({ page }) => {
		await openCofre(page);

		await go(page, "Dados");
		await page.getByRole("button", { name: "Abrir a importação" }).click();

		// The shape a card invoice is exported in: the day the ISO way, a point for the
		// decimal, and a purchase written as a positive number.
		await pickStatement(
			page,
			"fatura.csv",
			[
				"date,title,amount",
				"2026-01-03,Padaria Sao Jorge,18.50",
				"2026-01-05,Mercado Livre,249.90",
				"2026-01-08,Spotify,21.90",
				"2026-01-14,Posto Ipiranga,180.00",
			].join("\n"),
		);

		await expect(page.getByText("4 lançamentos lidos de um arquivo CSV.")).toBeVisible();
		// The screen says what it decided and offers to turn it round.
		await expect(page.getByRole("radio", { name: "São gastos" })).toBeChecked();
		await expect(page.getByText("Nenhum valor deste arquivo é negativo")).toBeVisible();
		await expect(page.getByRole("cell", { name: "-R$ 249,90" })).toBeVisible();

		// And the person can say it was a statement after all. The radio behind the
		// choice is for the keyboard and the screen reader, and the label is what a
		// mouse hits, which is what this clicks.
		await page.getByText("O sinal é do banco").click();
		await expect(page.getByRole("radio", { name: "O sinal é do banco" })).toBeChecked();
		await expect(page.getByRole("cell", { name: "R$ 249,90", exact: true })).toBeVisible();
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
		await page.getByLabel("Mês", { exact: true }).fill("2026-01");
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
	/**
	 * One file, whichever spaces go into it, and a date that tells the truth about all
	 * of them. Saving the space that happens to be open and calling that a backup is
	 * what the screen used to do, with the file that holds everything hidden under a
	 * line about taking the data to another program.
	 */
	test("hands over one file with the spaces that were ticked", async ({ page }) => {
		await openCofre(page);

		await go(page, "Dados");
		// The panel that answers where the data is. The automatic backup has a line of
		// its own that also says never, so this one is asked for by name.
		const whereItIs = page
			.locator("section")
			.filter({ has: page.getByRole("heading", { name: "Onde estão os seus dados" }) });

		// Before anything is saved the screen says so, in the one colour it uses for
		// something being wrong.
		await expect(whereItIs.getByText("Nunca", { exact: true })).toBeVisible();

		// Both spaces of the demonstration are there and both are ticked.
		await expect(page.getByRole("checkbox", { name: "Pessoal" })).toBeChecked();
		await expect(page.getByRole("checkbox", { name: "Casa" })).toBeChecked();

		await page.getByRole("checkbox", { name: "Casa" }).uncheck();

		const download = page.waitForEvent("download");
		await page.getByRole("button", { name: "Baixar", exact: true }).first().click();
		const file = await download;
		expect(file.suggestedFilename()).toMatch(/^cofre_backup_\d{8}\.json$/);

		// One of the two was left out, so the honest answer to when the last copy was
		// is still never. The line under it says which reading this is.
		await expect(page.getByText("O mais antigo entre os seus espaços")).toBeVisible();
		await expect(whereItIs.getByText("Nunca", { exact: true })).toBeVisible();

		await page.getByRole("checkbox", { name: "Casa" }).check();
		const second = page.waitForEvent("download");
		await page.getByRole("button", { name: "Baixar", exact: true }).first().click();
		await second;

		await expect(whereItIs.getByText("Nunca", { exact: true })).toHaveCount(0);
	});

	test("refuses to write a file with no space in it", async ({ page }) => {
		await openCofre(page);
		await go(page, "Dados");

		await page.getByRole("checkbox", { name: "Pessoal" }).uncheck();
		await page.getByRole("checkbox", { name: "Casa" }).uncheck();

		await expect(page.getByText("Marque pelo menos um espaço")).toBeVisible();
		await expect(page.getByRole("button", { name: "Baixar", exact: true }).first()).toBeDisabled();
	});

	test("hands over the records as a spreadsheet, from behind the line that hides it", async ({
		page,
	}) => {
		await openCofre(page);

		await go(page, "Dados");
		// A CSV is a once a year thing, so it is not on the screen until it is asked for.
		await expect(page.getByRole("button", { name: "Baixar CSV" })).toHaveCount(0);
		await page.getByText("Levar os dados para outro programa").click();

		const download = page.waitForEvent("download");
		await page.getByRole("button", { name: "Baixar CSV" }).click();
		const file = await download;

		expect(file.suggestedFilename()).toMatch(/^cofre_lancamentos_\d{8}\.csv$/);
	});

	test("says what bringing a file back will do, and what is inside it", async ({ page }) => {
		await openCofre(page);

		await go(page, "Dados");
		const download = page.waitForEvent("download");
		await page.getByRole("button", { name: "Baixar", exact: true }).first().click();
		const saved = await download;
		const path = await saved.path();

		// Choosing a file does not write it: the screen says what it is about to do,
		// and which spaces the file turned out to hold.
		await page.getByLabel("Escolher arquivo").setInputFiles(path);
		const dialog = page.getByRole("dialog");
		await expect(dialog).toContainText("O que tem neste arquivo");
		await expect(dialog.getByRole("checkbox", { name: "Pessoal" })).toBeChecked();
		await expect(dialog.getByRole("checkbox", { name: "Casa" })).toBeChecked();
		await expect(dialog).toContainText("Só acrescenta o que está faltando");

		await dialog.getByRole("button", { name: "Trazer de volta" }).click();
		await expect(page.getByText("Restaurado", { exact: true })).toBeVisible({ timeout: 20_000 });
	});

	test("says why a file that is not a backup is not one", async ({ page }) => {
		await openCofre(page);
		await go(page, "Dados");

		// A JSON file that parses and is not a backup. It used to open the dialog with no
		// space in it and a button that could not be pressed, and no sentence at all.
		await page.getByLabel("Escolher arquivo").setInputFiles({
			name: "lista.json",
			mimeType: "application/json",
			buffer: Buffer.from(JSON.stringify([{ descricao: "Mercado", valor: 42.9 }])),
		});

		await expect(page.getByText(/não é um backup do/)).toBeVisible();
		await expect(page.getByRole("dialog")).toHaveCount(0);
	});

	test("says the same about a file that is not even JSON", async ({ page }) => {
		await openCofre(page);
		await go(page, "Dados");

		// A PDF that somebody renamed. It used to reach JSON.parse and put its own
		// English complaint on the screen, in a Portuguese interface.
		await page.getByLabel("Escolher arquivo").setInputFiles({
			name: "fatura.json",
			mimeType: "application/json",
			buffer: Buffer.from("%PDF-1.4\n%pretend this is a statement\n"),
		});

		await expect(page.getByText(/não é um backup do/)).toBeVisible();
		// And not the complaint of the parser, which is written in English by the
		// language itself and reached the screen untranslated.
		await expect(page.getByText(/Unexpected token/)).toHaveCount(0);
		await expect(page.getByRole("dialog")).toHaveCount(0);
	});

	test("says a backup with no space in it has nothing to bring back", async ({ page }) => {
		await openCofre(page);
		await go(page, "Dados");

		// The right marker and no list at all, which used to fall over reading the
		// length of something that is not there.
		await page.getByLabel("Escolher arquivo").setInputFiles({
			name: "vazio.json",
			mimeType: "application/json",
			buffer: Buffer.from(JSON.stringify({ format: "cofre.backup", version: 1 })),
		});

		await expect(page.getByText(/não tem nenhum espaço dentro/)).toBeVisible();
		await expect(page.getByRole("dialog")).toHaveCount(0);
	});

	/**
	 * A file of several spaces, opened somewhere that wants only one of them. The
	 * browser that reads it is a second one, so the spaces arrive rather than being
	 * recognised as already here, which is the only way to see which ones came.
	 */
	test("brings back only the spaces that were ticked", async ({ browser }) => {
		const first = await browser.newContext({ acceptDownloads: true });
		const one = await first.newPage();
		await openCofre(one);

		await go(one, "Dados");
		const download = one.waitForEvent("download");
		await one.getByRole("button", { name: "Baixar", exact: true }).first().click();
		const path = await (await download).path();

		const second = await browser.newContext({ acceptDownloads: true });
		const two = await second.newPage();
		await openCofre(two, { demo: false });

		await go(two, "Dados");
		await two.getByLabel("Escolher arquivo").setInputFiles(path);

		const dialog = two.getByRole("dialog");
		await dialog.getByRole("checkbox", { name: "Casa" }).uncheck();
		await dialog.getByRole("button", { name: "Trazer de volta" }).click();

		// The personal space merged into the one that was already here, and the shared
		// one was left in the file.
		await expect(two.getByText("Restaurado", { exact: true })).toBeVisible({ timeout: 20_000 });
		await two.getByRole("button", { name: "Você está no espaço" }).click();
		await expect(two.getByRole("menuitem", { name: "Casa" })).toHaveCount(0);
		await two.keyboard.press("Escape");

		await go(two, "Lançamentos");
		await expect(record(two, "Café da esquina")).toBeVisible({ timeout: 20_000 });

		await first.close();
		await second.close();
	});
});
