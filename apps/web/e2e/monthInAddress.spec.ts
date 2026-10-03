// The month a screen shows is in its address (part 2, F.2 of the request for 2.0.0).
//
// The reports, the month, the calendar and the paper report held the month in a state of
// their own, so a link could not say September and the back button left the screen
// instead of going back a month.

import { expect, test } from "@playwright/test";
import { go, openCofre } from "./support.ts";

test.describe("the month in the address", () => {
	test("a link that says September opens September", async ({ page }) => {
		await openCofre(page, { demo: false });
		await page.goto("/relatorios?mes=2026-09");
		await expect(page.getByLabel("Mês", { exact: true })).toHaveValue("2026-09");

		await page.goto("/calendario?mes=2026-09");
		await expect(page.getByRole("heading", { name: /de setembro/ })).toBeVisible();
	});

	test("the back button goes back a month, without what was typed in it", async ({ page }) => {
		await openCofre(page);
		await go(page, "O mês");
		await expect(page.getByText(/^Outubro em três números/)).toBeVisible();
		await page.getByLabel("Quanto entrou").fill("5.000,00");

		await page.getByRole("button", { name: "Próximo mês" }).click();
		await expect(page).toHaveURL(/mes=2026-11/);
		await expect(page.getByText(/^Novembro em três números/)).toBeVisible();

		await page.goBack();
		await expect(page).not.toHaveURL(/mes=2026-11/);
		await expect(page.getByText(/^Outubro em três números/)).toBeVisible();
		await expect(page.getByLabel("Quanto entrou")).toHaveValue("");
	});
});
