// The list of a year, of every month, and of more than one page (part 2, F.3 to F.6 of the
// request for 2.0.0).
//
// The list showed one month or every month as one long column, stopped at two hundred
// records without a word, added up only the two hundred it had, and a saved filter kept the
// month it was saved in.

import { expect, type Page, test } from "@playwright/test";
import { go, openCofre, record } from "./support.ts";

async function write(page: Page, description: string, amount: string, day: string) {
	await page.getByRole("button", { name: "Novo lançamento" }).first().click();
	const form = page.getByRole("dialog");
	await form.getByLabel("Valor", { exact: true }).fill(amount);
	await form.getByLabel("Descrição").fill(description);
	await form.getByLabel("Dia").fill(day);
	await page.getByRole("button", { name: "Salvar" }).click();
	await expect(form).toHaveCount(0);
}

/** The header of the group of one month, which names it and says what it adds up to. */
function monthGroup(page: Page, name: string) {
	return page.getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) });
}

test.describe("the list of a year", () => {
	test("groups the months, adds up each one, and keeps the months ahead closed", async ({
		page,
	}) => {
		// The sample holds a cinema of R$ 32,00 on the nineteenth of October.
		await openCofre(page);
		await go(page, "Lançamentos");
		await write(page, "Cinema com a turma", "45,00", "2026-09-12");
		await write(page, "Cinema de dezembro", "50,00", "2026-12-05");

		await page.goto("/lancamentos?ano=2026&busca=cinema");
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lançamentos de 2026");
		await expect(
			page.getByText(
				"Em 2026, o que está na lista soma R$ 0,00 de entradas e R$ 127,00 de saídas.",
			),
		).toBeVisible();

		await expect(monthGroup(page, "Outubro de 2026")).toContainText(
			"entradas R$ 0,00, saídas R$ 32,00",
		);
		await expect(monthGroup(page, "Setembro de 2026")).toContainText(
			"entradas R$ 0,00, saídas R$ 45,00",
		);
		// The sum takes in the closed group above, which the count under the table does not: said,
		// because a reader adding up the months in the table found R$ 50,00 missing.
		await expect(
			page.getByText(
				"Somando o que está na lista, com o lançamento que ainda vai acontecer: entradas R$ 0,00, saídas R$ 127,00",
			),
		).toBeVisible();

		// December is after this month, so it waits in a closed group at the top.
		const ahead = page.locator("summary").filter({ hasText: "Ainda vão acontecer" });
		await expect(ahead).toContainText("1 lançamento: entradas R$ 0,00, saídas R$ 50,00");
		await expect(record(page, "Cinema de dezembro")).toHaveCount(0);
		await ahead.click();
		await expect(monthGroup(page, "Dezembro de 2026")).toContainText("saídas R$ 50,00");
		await expect(record(page, "Cinema de dezembro")).toBeVisible();

		// Each month leads to itself, with the rest of the question kept.
		await page.getByRole("link", { name: "Setembro de 2026", exact: true }).click();
		await expect(page).toHaveURL(/mes=2026-09/);
		await expect(page).toHaveURL(/busca=cinema/);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lançamentos de setembro");
	});

	test("writes the year and every month in the address, and a reload keeps them", async ({
		page,
	}) => {
		await openCofre(page);
		await go(page, "Lançamentos");

		await page.getByRole("button", { name: "O ano todo" }).click();
		await expect(page).toHaveURL(/ano=2026/);
		await page.reload();
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lançamentos de 2026");
		await expect(page.getByRole("button", { name: "O ano todo" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);

		await page.getByRole("button", { name: "Todos os meses" }).click();
		await expect(page).toHaveURL(/mes=tudo/);
		await page.reload();
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("Todos os lançamentos");

		// And the back button walks back to the year.
		await page.goBack();
		await expect(page).toHaveURL(/ano=2026/);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lançamentos de 2026");
	});

	test("says how many of the records are on screen, and brings the rest", async ({ page }) => {
		await openCofre(page);
		const lines = ["Data;Historico;Valor"];
		for (let index = 1; index <= 250; index += 1) {
			lines.push(`15/08/2026;Compra ${index};-10,00`);
		}
		await go(page, "Dados");
		await page.getByRole("button", { name: "Abrir a importação" }).click();
		await page.getByLabel("Arquivo do banco").setInputFiles({
			name: "agosto.csv",
			mimeType: "text/plain",
			buffer: Buffer.from(lines.join("\r\n"), "utf8"),
		});
		await page.getByRole("button", { name: "Gravar 250 lançamentos" }).click();
		await expect(page.getByText("250 lançamentos gravados")).toBeVisible({ timeout: 30_000 });

		// The sample has a few records of its own in August, so the search keeps to these.
		await page.goto("/lancamentos?mes=2026-08&busca=compra");
		await expect(page.getByText("Mostrando 200 de 250")).toBeVisible({ timeout: 20_000 });
		// All of them in the sum, and not the two hundred on screen.
		await expect(
			page.getByText("Somando o que está na lista: entradas R$ 0,00, saídas R$ 2.500,00"),
		).toBeVisible();

		await page.getByRole("button", { name: "Mostrar mais" }).click();
		await expect(page.getByText("250 lançamentos no período")).toBeVisible();
		await expect(page.getByRole("button", { name: "Mostrar mais" })).toHaveCount(0);
		// Every one once: the two hundred and fifty were written in one instant, and a page that
		// orders by the day alone repeats some of them and skips others.
		await expect(page.getByRole("row").filter({ hasText: /Compra \d+/ })).toHaveCount(250);
		await expect(page.getByRole("row").filter({ hasText: /Compra 1(?!\d)/ })).toHaveCount(1);
	});
});

test.describe("a saved filter", () => {
	test("follows the calendar when it was saved on this month or this year", async ({ page }) => {
		await openCofre(page);
		await go(page, "Lançamentos");

		const save = async (name: string) => {
			await page.getByRole("button", { name: "Salvar este filtro" }).click();
			await page.getByRole("dialog").getByLabel("Nome").fill(name);
			await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
			await expect(page.getByRole("dialog")).toHaveCount(0);
		};

		// On the twenty eighth of October, on October.
		await page.getByLabel("Buscar").fill("cinema");
		await save("Lazer");
		// Looking at September.
		await page.getByLabel("Mês", { exact: true }).fill("2026-09");
		await expect(page).toHaveURL(/mes=2026-09/);
		await save("Setembro");
		// On the whole year.
		await page.getByRole("button", { name: "O ano todo" }).click();
		await expect(page).toHaveURL(/ano=2026/);
		await save("Ano");

		// The fifth of November.
		await page.clock.setFixedTime(new Date("2026-11-05T12:00:00-03:00"));
		await page.goto("/lancamentos");
		await page.getByRole("button", { name: "Lazer", exact: true }).click();
		await expect(page.getByLabel("Mês", { exact: true })).toHaveValue("2026-11");
		await expect(page.getByRole("button", { name: "Lazer", exact: true })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await page.getByRole("button", { name: "Setembro", exact: true }).click();
		await expect(page.getByLabel("Mês", { exact: true })).toHaveValue("2026-09");

		// The tenth of January of the next year.
		await page.clock.setFixedTime(new Date("2027-01-10T12:00:00-03:00"));
		await page.goto("/lancamentos");
		await page.getByRole("button", { name: "Ano", exact: true }).click();
		await expect(page).toHaveURL(/ano=2027/);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lançamentos de 2027");
	});
});
