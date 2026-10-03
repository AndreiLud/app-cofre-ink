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

	// Part 2, L.6.2 of the request for 2.0.0: the palette is for the screens a person uses, and
	// it offered the page of the design system among them. The page stays at its address.
	test("offers the screens a person uses, and not the design system", async ({ page }) => {
		await openCofre(page);

		await page.keyboard.press("Control+k");
		const palette = page.getByRole("dialog");
		await page.getByRole("textbox", { name: "Digite para buscar" }).fill("design");
		await expect(palette.getByText("Design system")).toHaveCount(0);
		await page.keyboard.press("Escape");

		await page.goto("/designSystem");
		await expect(page.getByRole("heading", { name: "Design system", level: 1 })).toBeVisible();
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

		// Once the answer is on the screen, because a figure read while the balances are
		// still arriving is a figure that changes by itself a moment later.
		await expect(total(page)).toContainText(/\d/);
		const before = await total(page).innerText();

		await page.getByRole("button", { name: "Esconder valores" }).click();
		await expect(total(page)).not.toContainText(/\d/);

		await page.getByRole("button", { name: "Mostrar valores" }).click();
		await expect(total(page)).toHaveText(before);
	});
});

test.describe("the interface language", () => {
	test("switches to English and stays after a reload", async ({ page }) => {
		await openCofre(page);

		const document = page.locator("html");
		await expect(document).toHaveAttribute("lang", /^pt/);

		await page.getByRole("button", { name: "Idioma" }).click();
		await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();

		// The page says which language it is in, and it is the only thing a screen reader
		// reads to decide how to pronounce the words on it.
		await expect(document).toHaveAttribute("lang", /^en/);

		await page.reload();
		await expect(page.getByRole("link", { name: "Overview" })).toBeVisible({ timeout: 20_000 });
		await expect(document).toHaveAttribute("lang", /^en/);
	});
});
