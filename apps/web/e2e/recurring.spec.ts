// The things that happen again, on a screen of their own (part 2, G of the request for 2.0.0).
//
// Only the calendar wrote what a series owed, and only when it was opened; a record could not
// be said to repeat where it was written; a series that started before today wrote the days
// already gone without saying so; and deleting a series asked nothing.

import { expect, type Page, test } from "@playwright/test";
import { go, openCofre, openSetting, record } from "./support.ts";

/** A series written on its own screen. */
async function aSeries(
	page: Page,
	series: {
		description: string;
		amount: string;
		from: string;
		leavePastOut?: boolean;
		paidWith?: string;
	},
) {
	await go(page, "Recorrentes");
	await page.getByRole("button", { name: "Nova recorrência" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Descrição").fill(series.description);
	await dialog.getByLabel("Valor", { exact: true }).fill(series.amount);
	await dialog.getByLabel("A partir de").fill(series.from);
	if (series.paidWith) {
		await dialog.getByLabel("Pago com").selectOption({ label: series.paidWith });
	}
	if (series.leavePastOut) await dialog.getByLabel("Deixar de fora").check();
	await page.getByRole("button", { name: "Salvar" }).click();
	await expect(dialog).toHaveCount(0);
}

function line(page: Page, description: string) {
	return page.getByRole("listitem").filter({ hasText: description });
}

test.describe("what repeats", () => {
	test("is written from the form of a record, on its day once, with its series", async ({
		page,
	}) => {
		await openCofre(page);
		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		await form.getByLabel("Valor", { exact: true }).fill("149,00");
		await form.getByLabel("Descrição").fill("Academia");
		await form.getByLabel("Repete").selectOption("monthly");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);

		await expect(record(page, "Academia")).toHaveCount(1);
		await expect(record(page, "Academia")).toContainText("28/10");
		await expect(record(page, "Academia")).toContainText("repete");
		// The application writes what the series owe when it opens: still one on the day.
		await page.reload();
		await expect(record(page, "Academia")).toHaveCount(1);

		await go(page, "Recorrentes");
		await expect(line(page, "Academia")).toContainText("Todo mês");
		// With the subscription the demonstration has as a series since 2.0.0, R$ 27,90.
		await expect(
			page.getByText("Todo mês o que se repete tira R$ 176,90 e põe R$ 0,00."),
		).toBeVisible();
	});

	test("says which days already gone it writes, and leaves them out when asked", async ({
		page,
	}) => {
		await openCofre(page);
		await go(page, "Recorrentes");
		await page.getByRole("button", { name: "Nova recorrência" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Descrição").fill("Academia");
		await dialog.getByLabel("Valor", { exact: true }).fill("149,00");
		await dialog.getByLabel("A partir de").fill("2026-08-05");
		await expect(dialog).toContainText(
			"Isto lança também 3 ocorrências que já passaram (05/08, 05/09 e 05/10), R$ 447,00, e elas entram no saldo.",
		);
		await dialog.getByLabel("Deixar de fora").check();
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(dialog).toHaveCount(0);
		await expect(line(page, "Academia")).toContainText("próxima em 05/11");

		await go(page, "Lançamentos");
		for (const month of ["2026-08", "2026-09", "2026-10"]) {
			await page.getByLabel("Mês", { exact: true }).fill(month);
			await expect(page.getByLabel("Mês", { exact: true })).toHaveValue(month);
			await expect(record(page, "Academia")).toHaveCount(0);
		}
		await page.getByLabel("Mês", { exact: true }).fill("2026-11");
		await expect(record(page, "Academia")).toContainText("05/11");
	});

	test("asks before deleting one, says what goes, and keeps what happened", async ({ page }) => {
		await openCofre(page);
		await aSeries(page, { description: "Aluguel", amount: "1.450,00", from: "2026-10-05" });

		await page.getByRole("button", { name: "O que fazer com Aluguel" }).click();
		await page.getByRole("menuitem", { name: "Apagar" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toContainText("Apagar Aluguel?");
		await expect(dialog).toContainText(
			"Saem 2 lançamentos que ainda iam acontecer, 05/11 e 05/12.",
		);
		await expect(dialog).toContainText("O que já aconteceu fica");
		await dialog.getByRole("button", { name: "Apagar" }).click();
		await expect(dialog).toHaveCount(0);
		await expect(line(page, "Aluguel")).toHaveCount(0);

		await go(page, "Lançamentos");
		await expect(record(page, "Aluguel")).toContainText("05/10");
		await page.getByLabel("Mês", { exact: true }).fill("2026-11");
		await expect(page).toHaveURL(/mes=2026-11/);
		await expect(record(page, "Aluguel")).toHaveCount(0);
	});

	test("lists what one series wrote, from its screen", async ({ page }) => {
		await openCofre(page);
		await aSeries(page, { description: "Aluguel", amount: "1.450,00", from: "2026-10-05" });
		await page.getByRole("button", { name: "O que fazer com Aluguel" }).click();
		await page.getByRole("menuitem", { name: "Ver lançamentos" }).click();
		await expect(page).toHaveURL(/serie=/);
		await expect(page.getByText("Só o que Aluguel escreveu.")).toBeVisible();
		// Every month, with the months ahead in their closed group: October, and two ahead.
		await expect(record(page, "Aluguel")).toHaveCount(1);
		const ahead = page.locator("summary").filter({ hasText: "Ainda vão acontecer" });
		await expect(ahead).toContainText("2 lançamentos");
		await ahead.click();
		await expect(record(page, "Aluguel")).toHaveCount(3);
		await expect(record(page, "Café da esquina")).toHaveCount(0);
	});

	test("is written without opening the calendar, seventy days on and in every space", async ({
		page,
	}) => {
		await openCofre(page);
		// On the current account, so it is a line of its own and not part of an invoice.
		await aSeries(page, {
			description: "Aluguel",
			amount: "1.450,00",
			from: "2026-11-10",
			paidWith: "Conta corrente",
		});

		// The other space of the sample, with an account and a series of its own, and then
		// back to the personal one, so the other is not the one open.
		await openSetting(page, "Gerenciar espaços");
		await page.getByRole("button", { name: "Entrar" }).click();
		await expect(page.getByRole("banner")).toContainText("Casa");
		await go(page, "Contas");
		await page.getByRole("button", { name: "Nova conta" }).first().click();
		await page.getByRole("dialog").getByLabel("Nome").fill("Conta da casa");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(0);
		await aSeries(page, { description: "Condomínio", amount: "600,00", from: "2026-11-12" });
		await openSetting(page, "Gerenciar espaços");
		await page.getByRole("button", { name: "Entrar" }).click();
		await expect(page.getByRole("banner")).toContainText("Pessoal");

		// Seventy days later, the application opened again and nothing else.
		await page.clock.setFixedTime(new Date("2027-01-06T12:00:00-03:00"));
		await page.reload();
		await go(page, "Painel");
		const due = page.locator("section").filter({ hasText: "Vence nos próximos dias" });
		await expect(due.getByRole("listitem").filter({ hasText: "Aluguel" })).toContainText("10/01");
		await page.getByText("Todos", { exact: true }).click();
		await expect(due.getByRole("listitem").filter({ hasText: "Condomínio" })).toContainText(
			"12/01",
		);
	});
});
