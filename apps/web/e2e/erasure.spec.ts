// The way out.
//
// A destructive action is worth an end to end test more than almost anything else,
// because the failure mode is not an error message: it is a button that says it erased
// something and did not, or one that erased more than it named. Both are only visible
// from outside, by looking at what is still on the screen afterwards.

import { expect, test } from "@playwright/test";
import { go, openCofre, record } from "./support.ts";

test.describe("the danger zone", () => {
	test("erases one space and leaves the other one alone", async ({ page }) => {
		await openCofre(page);

		await go(page, "Dados");
		const house = page.getByRole("listitem").filter({ hasText: "Casa" });
		await house.getByRole("button", { name: "Apagar os dados" }).click();

		// Nothing happens until the name is typed out, which is the whole point.
		const dialog = page.getByRole("dialog");
		await expect(dialog.getByRole("button", { name: "Apagar agora" })).toBeDisabled();
		await dialog.getByLabel("Escreva Casa para confirmar").fill("Casa");
		await dialog.getByRole("button", { name: "Apagar agora" }).click();

		await expect(page.getByText("Casa foi apagado")).toBeVisible();

		// The space is gone from the switcher, and the personal one still has its records.
		await page.getByRole("button", { name: "Você está no espaço" }).click();
		await expect(page.getByRole("menuitem", { name: "Casa" })).toHaveCount(0);
		await page.keyboard.press("Escape");

		await go(page, "Lista");
		await expect(record(page, "Café da esquina")).toBeVisible();
	});

	test("takes the whole database off the device and lands on the first question", async ({
		page,
	}) => {
		await openCofre(page);

		await go(page, "Dados");
		await page
			.getByRole("listitem")
			.filter({ hasText: "Apagar tudo" })
			.getByRole("button", { name: "Apagar tudo" })
			.click();

		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Escreva APAGAR TUDO para confirmar").fill("apagar tudo");
		await dialog.getByRole("button", { name: "Apagar agora" }).click();

		// The page reloads onto onboarding, because what is left is nothing.
		await expect(page.getByRole("button", { name: "Usar este dispositivo" })).toBeVisible({
			timeout: 30_000,
		});

		// And it stays nothing: opening again does not find the old profile.
		await page.reload();
		await expect(page.getByRole("button", { name: "Usar este dispositivo" })).toBeVisible({
			timeout: 30_000,
		});
	});
});
