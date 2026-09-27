// Opening Cofre for the first time.
//
// There used to be a form here: a name, an address, a currency, what the space is
// called, and a box for the demonstration data. It is gone. The door asks the one
// question that cannot be changed afterwards, where the data lives, and everything else
// it would have wanted is corrected from inside in one screen.
//
// So what these check is that a browser with nothing in it reaches money on the screen,
// that refusing the demonstration data leaves it genuinely empty, and that what was made
// without anybody being asked survives a reload.

import { expect, test } from "@playwright/test";
import { openCofre, total } from "./support.ts";

test.describe("opening Cofre for the first time", () => {
	test("goes from an empty browser to a dashboard with money in it", async ({ page }) => {
		await openCofre(page);

		await expect(page.getByRole("heading", { level: 1 })).toContainText("Pessoal");
		await expect(total(page)).toContainText("R$");
		// The demonstration data brings four accounts.
		await expect(page.getByRole("link", { name: "Ver todas" })).toBeVisible();
	});

	test("starts clean when the demonstration data is refused", async ({ page }) => {
		await openCofre(page, { demo: false });

		await expect(page.getByText("Nenhuma conta por aqui ainda")).toBeVisible();
		await expect(total(page)).toContainText("0,00");
	});

	test("keeps what it made after a reload", async ({ page }) => {
		await openCofre(page);
		await page.reload();

		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByRole("heading", { level: 1 })).toContainText("Pessoal");
	});

	/**
	 * The database can outlive the profile: a browser is allowed to forget one key and
	 * keep the rest. Nobody is asked anything about that either, because there is nothing
	 * left to ask.
	 */
	test("makes a person again when the browser kept the data and lost the profile", async ({
		page,
	}) => {
		await openCofre(page);
		await page.evaluate(() => localStorage.removeItem("cofreUserId"));
		await page.reload();

		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByRole("heading", { level: 1 })).toContainText("Pessoal");
	});
});
