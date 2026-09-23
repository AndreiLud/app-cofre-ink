// The part of the product that reads the figures back to you.
//
// What matters here is not that a sentence appears, it is that the sentence carries the
// numbers it was made from. A line that says somebody is spending too much, with no
// figures, is a line nobody can check and nobody should believe.

import { expect, test } from "@playwright/test";
import { go, openCofre } from "./support.ts";

test.describe("what the figures have to say", () => {
	test("says nothing on the first day, when there is nothing to say", async ({ page }) => {
		await openCofre(page, { name: "Andrei", demo: false });

		// An account and one record is not a pattern, and the screen does not invent one.
		await expect(page.getByText("acima do de sempre")).toHaveCount(0);
		await expect(page.getByText("se repetem todo mês")).toHaveCount(0);
	});

	test("finds the same charge twice and says what to check", async ({ page }) => {
		await openCofre(page, { name: "Andrei" });

		await go(page, "Lançamentos");

		// The same amount at the same shop, today and yesterday. This is the one finding
		// a person acts on the same minute they read it.
		for (const when of ["hoje", "ontem"]) {
			await page.getByLabel("Lançamento rápido").fill(`Mercado do bairro 189,90 ${when} carteira`);
			await page.getByRole("button", { name: "Lançar", exact: true }).click();
			await expect(page.getByRole("button", { name: "Desfazer" })).toBeVisible();
		}

		await go(page, "Painel");

		// The overview keeps four lines, and this one is heavy enough to be among them.
		// The rest of them, and the state of the money they add up to, are on the check
		// up, which advisor.spec.ts is about.
		const line = page.getByText(/aparece duas vezes de/);
		await expect(line).toBeVisible();
		await expect(line).toContainText("189,90");
		await expect(line).toContainText("um dia de diferença");
	});
});
