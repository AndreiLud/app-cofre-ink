import { readFile } from "node:fs/promises";
import { type Browser, type BrowserContext, expect, type Page } from "@playwright/test";

/**
 * The day every flow runs on.
 *
 * This suite used to run on whatever day it was, and a product about money is full of
 * rules that depend on the day: a series never writes a record for a month before the one
 * it was written down in, the records screen opens on this month, a card invoice closes on
 * the third and falls due on the tenth, and the demonstration data is dated backwards from
 * today. So three tests of 1.1.0 passed on the thirtieth of September and failed on the
 * first of October with nobody having touched the code, which is the worst kind of red:
 * one that arrives without a cause and teaches people to ignore the suite.
 *
 * The twenty eighth, because the demonstration data reaches sixteen days back and all of
 * it has to land in the month the screens open on, and because the open invoice of the
 * sample card falls due thirteen days later, which is inside the fifteen days the overview
 * looks ahead. A test that wants another day says so for itself.
 */
export const TODAY = "2026-10-28";

/** The same day as a Date, for the few tests that count days in the test rather than the page. */
export function onTheDay(offset = 0): Date {
	const day = new Date(`${TODAY}T12:00:00-03:00`);
	day.setDate(day.getDate() + offset);
	return day;
}

/** The same day, written the way a date field wants it. */
export function dayField(offset = 0): string {
	const day = onTheDay(offset);
	return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

/**
 * Walks the front door, which every flow starts from because each test opens a browser
 * with nothing stored.
 *
 * There used to be a form behind the door asking for a name, an address, a currency and
 * what the space was called. It is gone: the door asks the one question that cannot be
 * changed later, where the data lives, and everything else it would have wanted is
 * corrected from inside in one screen. So this presses the door and waits for the
 * application, and the one thing it still chooses is whether the demonstration data
 * comes along, because that is the one question the door still asks.
 */
export async function openCofre(page: Page, options: { demo?: boolean } = {}): Promise<void> {
	// Before the first load, because the demonstration data is written on the way in and is
	// dated backwards from whatever day the page thinks it is.
	await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00-03:00`));
	await page.goto("/");

	const demo = page.getByRole("checkbox", { name: "Começar com dados de exemplo" });
	await expect(demo).toBeVisible({ timeout: 45_000 });
	if (options.demo === false) await demo.uncheck();
	else await demo.check();

	await page.getByRole("button", { name: "Usar só neste navegador" }).click();
	// The click is where the work happens: a worker, a database, the migrations, a space,
	// the categories and usually the demonstration data. Three seconds on a quiet machine
	// and fifteen on a busy one, so it is given room.
	await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
		timeout: 45_000,
	});
}

/**
 * A browser holding promises nobody answered, which only a release before 1.1.0 wrote.
 *
 * Nothing written since is a promise: a record dated ahead is a fact its day holds back.
 * So the one way to have a promise is the way a person has one, a backup from before
 * brought back. This writes a series in one browser, takes the backup, marks the
 * occurrences whose day has gone as promises, which is what 1.0 wrote for them, and
 * brings the file back in a second browser that holds nothing else.
 */
export async function promisesFromBefore(
	browser: Browser,
	series: { description: string; amount: string; weekly?: boolean; from: number },
): Promise<{ page: Page; close: () => Promise<void> }> {
	const contexts: BrowserContext[] = [];
	const first = await browser.newContext({ acceptDownloads: true });
	contexts.push(first);
	const one = await first.newPage();
	await openCofre(one);

	await go(one, "Calendário");
	await one.getByRole("button", { name: "Nova recorrência" }).click();
	const dialog = one.getByRole("dialog");
	await dialog.getByLabel("Descrição").fill(series.description);
	await dialog.getByLabel("Valor", { exact: true }).fill(series.amount);
	if (series.weekly) await dialog.getByLabel("Repete").selectOption("weekly");
	await dialog.getByLabel("A partir de").fill(dayField(series.from));
	await one.getByRole("button", { name: "Salvar" }).click();
	await expect(one.getByText(series.description).first()).toBeVisible();

	await go(one, "Dados");
	const download = one.waitForEvent("download");
	await one.getByRole("button", { name: "Baixar", exact: true }).first().click();
	const backup = JSON.parse(await readFile(await (await download).path(), "utf8")) as {
		spaces: { tables: Record<string, Record<string, unknown>[]> }[];
	};

	let marked = 0;
	for (const space of backup.spaces) {
		for (const row of space.tables.transactions ?? []) {
			if (row.description === series.description && String(row.happened_on) < TODAY) {
				row.status = "planned";
				marked += 1;
			}
		}
	}
	expect(marked).toBeGreaterThan(0);

	const second = await browser.newContext({ acceptDownloads: true });
	contexts.push(second);
	const page = await second.newPage();
	await openCofre(page, { demo: false });
	await go(page, "Dados");
	await page.getByLabel("Escolher arquivo").setInputFiles({
		name: "cofre_backup_da_versao_1.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(backup)),
	});
	await page.getByRole("dialog").getByRole("button", { name: "Trazer de volta" }).click();
	await expect(page.getByText("Restaurado", { exact: true })).toBeVisible({ timeout: 20_000 });

	return {
		page,
		close: async () => {
			for (const context of contexts) await context.close();
		},
	};
}

/**
 * One of the five sections, in the row at the top on a wide screen or in the bar at the
 * bottom on a telephone. Only one of the two is rendered at a time. Several screens also
 * link to the same places in their own words, so the tests say which one they mean.
 */
export function nav(page: Page, label: string) {
	return page
		.getByRole("navigation", { name: "Seções do aplicativo" })
		.getByRole("link", { name: label, exact: true });
}

/** One of the screens inside the section you are in, on the line above the content. */
export function inside(page: Page, label: string) {
	return page
		.getByRole("navigation", { name: "Telas desta seção" })
		.getByRole("link", { name: label, exact: true });
}

/**
 * The navigation has two levels: five sections, and the screens inside the one you are
 * in. A test that wants a screen says which screen, and this opens its section first.
 */
const SECTION_OF: Record<string, string> = {
	Lista: "Lançamentos",
	"O mês": "Lançamentos",
	Faturas: "Lançamentos",
	Calendário: "Lançamentos",
	Orçamento: "Planejamento",
	Diagnóstico: "Planejamento",
	Projeção: "Planejamento",
	Investimentos: "Planejamento",
	// Accounts is a section of its own now, so it is reached in one click and has no
	// second level to look in. Money is not a setting, which is registry 0045.
	Categorias: "Ajustes",
	Dados: "Ajustes",
};

export async function go(page: Page, label: string): Promise<void> {
	const section = SECTION_OF[label];
	if (!section) {
		await nav(page, label).click();
		return;
	}
	await nav(page, section).click();
	await inside(page, label).click();
}

/** The amount shown as the answer to "how much do I have". */
export function total(page: Page) {
	// Under the label that says what it is, and not whichever amount the layout happens to
	// put first. The band of four figures waits for the balances while the lines under it,
	// one per card, do not, so "the first amount on the screen" was sometimes a card's
	// invoice and sometimes the answer, depending on which query landed first.
	return page
		.locator("div")
		.filter({ has: page.getByText("Você tem", { exact: true }) })
		.locator("span.tabular-nums")
		.first();
}

/**
 * Any of the four figures on the line at the top of the overview, by its label.
 *
 * The innermost block holding the label, which is the last of them in the order of the
 * page: every block around it holds the label too, and the first amount inside the
 * outermost one is whichever figure the line happens to start with.
 */
export function figure(page: Page, label: string) {
	return page
		.locator("div")
		.filter({ has: page.getByText(label, { exact: true }) })
		.last()
		.locator("span.tabular-nums")
		.first();
}

/** An amount as the screen writes it in Portuguese, "-R$ 1.960,96", in cents. */
export function cents(text: string): number {
	const digits = text.replace(/[^\d,]/g, "").replace(",", ".");
	const value = Math.round(Number(digits) * 100);
	return /^\s*[-−]/.test(text) ? -value : value;
}

/**
 * Spaces and members are settings, so they live in the menu of the space instead of in
 * the navigation. Both screens are reached the same way.
 */
export async function openSetting(page: Page, label: "Gerenciar espaços") {
	await page.getByRole("button", { name: "Você está no espaço" }).click();
	await page.getByRole("menuitem", { name: label }).click();
}

/**
 * The row of the list that shows one record. Asking for a cell would match twice,
 * because the checkbox that selects the row is labelled with the same description, on
 * purpose: somebody using a screen reader has to know which record they are ticking.
 */
export function record(page: Page, description: string) {
	return page.getByRole("row").filter({ hasText: description });
}

/**
 * The four cards of part 2, B.2.3 of the request for 2.0.0, and a meal card, in an empty
 * browser, on the fixed day of the suite, the twenty eighth of October.
 *
 * Nubank (closes on the 15th, due on the 22nd) is late by 300 and holds 1,200 on the open
 * invoice; Itaú (closes on the 25th, due on the 5th) closed at 900, due on the fifth of
 * November, and holds 150; C6 (closes on the 3rd, due on the 10th) holds 500; Inter has
 * nothing. Written through the screens, the way a person writes them.
 */
export async function fourCards(page: Page): Promise<void> {
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
		// The name on its own: on a telephone the cell also says the kind under it.
		await expect(page.getByRole("table").getByText(name, { exact: true })).toBeVisible();
	};
	await account("Banco", (dialog) => dialog.getByLabel("Saldo de abertura").fill("10.000,00"));
	for (const [name, closes, due] of [
		["Nubank", "15", "22"],
		["Itaú", "25", "5"],
		["C6", "3", "10"],
		["Inter", "10", "17"],
	] as const) {
		await account(name, async (dialog) => {
			await dialog.getByLabel("Tipo").selectOption("credit");
			await dialog.getByLabel("Dia do fechamento").selectOption(closes);
			await dialog.getByLabel("Dia do vencimento").selectOption(due);
		});
	}
	await account("VR", async (dialog) => {
		await dialog.getByLabel("Tipo").selectOption("voucher");
		await dialog.getByLabel("Valor por mês").fill("900,00");
		await dialog.getByLabel("Dia do crédito").selectOption("5");
	});

	await go(page, "Lançamentos");
	for (const [card, amount, day, description] of [
		["Nubank", "300,00", "2026-09-20", "Farmácia"],
		["Nubank", "1.200,00", "2026-10-20", "Passagem"],
		["Itaú", "900,00", "2026-10-10", "Mercado grande"],
		["Itaú", "150,00", "2026-10-26", "Livro"],
		["C6", "500,00", "2026-10-15", "Presente"],
	] as const) {
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		await form.getByLabel("Pago com").selectOption({ label: card });
		await form.getByLabel("Valor", { exact: true }).fill(amount);
		await form.getByLabel("Descrição").fill(description);
		await form.getByLabel("Dia").fill(day);
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);
	}
}

/**
 * Money moved between two accounts, through Move between accounts on the accounts screen,
 * which is where a move is written since the form for a record kept only money out and
 * money in.
 */
export async function moveBetween(
	page: Page,
	move: { from: string; to: string; amount: string; description?: string },
): Promise<void> {
	await go(page, "Contas");
	await page.getByRole("button", { name: "Mover entre contas" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("De", { exact: true }).selectOption({ label: move.from });
	await dialog.getByLabel("Para", { exact: true }).selectOption({ label: move.to });
	await dialog.getByLabel("Valor", { exact: true }).fill(move.amount);
	if (move.description) await dialog.getByLabel("Descrição").fill(move.description);
	await page.getByRole("button", { name: "Salvar" }).click();
	await expect(dialog).toHaveCount(0);
}
