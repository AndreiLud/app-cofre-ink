import { expect, test } from "@playwright/test";
import { openCofre, total } from "./support.ts";

test.describe("the command palette", () => {
	test("opens with the keyboard and goes where it is told", async ({ page }) => {
		await openCofre(page);

		await page.keyboard.press("Control+k");
		await expect(page.getByRole("dialog")).toBeVisible();

		await page.getByRole("textbox", { name: "Digite para buscar" }).fill("contas");
		await page.keyboard.press("Enter");

		await expect(page.getByRole("dialog")).toHaveCount(0);
		await expect(page).toHaveURL(/\/contas$/);
	});

	test("switches space without touching the mouse", async ({ page }) => {
		await openCofre(page);

		await page.keyboard.press("Control+k");
		await page.getByRole("textbox", { name: "Digite para buscar" }).fill("casa");
		await page.keyboard.press("Enter");

		await expect(page.getByRole("banner")).toContainText("Casa");
	});

	test("closes with the escape key", async ({ page }) => {
		await openCofre(page);

		await page.keyboard.press("Control+k");
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toHaveCount(0);
	});
});

test.describe("privacy mode", () => {
	test("hides every digit and brings them back", async ({ page }) => {
		await openCofre(page);

		const before = await total(page).innerText();
		expect(before).toMatch(/\d/);

		await page.getByRole("button", { name: "Esconder valores" }).click();
		await expect(total(page)).not.toContainText(/\d/);

		await page.getByRole("button", { name: "Mostrar valores" }).click();
		await expect(total(page)).toHaveText(before);
	});
});

test.describe("the interface language", () => {
	test("switches to English and stays after a reload", async ({ page }) => {
		await openCofre(page);

		await page.getByRole("button", { name: "Idioma" }).click();
		await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();

		await page.reload();
		await expect(page.getByRole("link", { name: "Overview" })).toBeVisible({ timeout: 20_000 });
	});
});
