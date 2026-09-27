import { expect, type Page } from "@playwright/test";

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
	Faturas: "Lançamentos",
	Calendário: "Lançamentos",
	Orçamento: "Planejamento",
	Diagnóstico: "Planejamento",
	Projeção: "Planejamento",
	Investimentos: "Planejamento",
	Contas: "Ajustes",
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
	// Every amount on screen is one of these, whichever face it is cut in, and the one
	// the overview opens with is the first.
	return page.locator("main span.tabular-nums").first();
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
