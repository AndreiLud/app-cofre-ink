import { expect, type Page } from "@playwright/test";

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
