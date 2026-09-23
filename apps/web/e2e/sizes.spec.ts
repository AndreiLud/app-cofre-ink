// Every screen, at the sizes people actually hold.
//
// The failure this catches is the one that makes an application feel broken: a table
// or a row of filters wider than the window, which makes the whole page slide sideways
// and takes the header and the navigation with it. So the check is blunt on purpose,
// and it is the same check on every screen: nothing is wider than the window.

import { expect, type Page, test } from "@playwright/test";
import { inside, nav, openCofre } from "./support.ts";

const SIZES = [
	{ name: "phone", width: 360, height: 720 },
	{ name: "tablet", width: 768, height: 1024 },
	{ name: "desktop", width: 1280, height: 800 },
];

const SCREENS = [
	"/",
	"/lancamentos",
	"/relatorios",
	"/orcamento",
	"/calendario",
	"/faturas",
	"/categorias",
	"/contas",
	"/espacos",
	"/membros",
	"/dados",
	"/importar",
	"/projecao",
	"/investimentos",
	"/diagnostico",
];

async function widerThanTheWindow(page: Page): Promise<number> {
	return page.evaluate(() => {
		const root = document.documentElement;
		return root.scrollWidth - root.clientWidth;
	});
}

for (const size of SIZES) {
	test(`fits on a ${size.name}`, async ({ page }) => {
		await page.setViewportSize({ width: size.width, height: size.height });
		await openCofre(page);

		for (const screen of SCREENS) {
			await page.goto(screen);
			await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
				timeout: 20_000,
			});
			// The main heading proves the screen rendered rather than hung on a skeleton.
			await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });

			expect(await widerThanTheWindow(page), `${screen} at ${size.name}`).toBeLessThanOrEqual(1);
		}
	});
}

test("a long form on a short window scrolls inside its dialog", async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 560 });
	await openCofre(page);

	await page.goto("/lancamentos");
	await page.getByRole("button", { name: "Novo lançamento" }).first().click();

	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();

	// The buttons at the bottom of the dialog are reachable, which is the whole point.
	await expect(dialog.getByRole("button", { name: "Salvar" })).toBeVisible();

	const box = await dialog.boundingBox();
	expect(box?.height ?? 0).toBeLessThanOrEqual(560);
	expect(await widerThanTheWindow(page)).toBeLessThanOrEqual(1);
});

test("the sections are reachable on a telephone without opening anything", async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 720 });
	await openCofre(page);

	// On a narrow screen the five sections are a bar along the bottom. All five are on
	// screen at once, so getting to one is a tap, not a tap to open and a tap to choose.
	await nav(page, "Relatórios").click();

	await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	await expect(page).toHaveURL(/relatorios/);

	// And the second level is with the content, so it takes one more tap and no menu.
	await nav(page, "Planejamento").click();
	await inside(page, "Investimentos").click();
	await expect(page).toHaveURL(/investimentos/);
});
