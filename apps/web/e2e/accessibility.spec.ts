// The things a keyboard and a screen reader need, checked rather than assumed.
//
// Not a substitute for somebody who uses this every day with a screen reader. What it
// does is stop the four defects that come back every time a screen is added: a header
// nobody can tab past, a tab that is called the same thing on every screen, a form
// control with no name, and a heading level that jumps.

import { expect, test } from "@playwright/test";
import { go, openCofre } from "./support.ts";

test.describe("the keyboard and the screen reader", () => {
	test("gets past the header with the first key it presses", async ({ page }) => {
		await openCofre(page, { name: "Andrei" });

		await page.keyboard.press("Tab");
		const skip = page.getByRole("link", { name: "Ir para o conteúdo" });
		await expect(skip).toBeFocused();

		await page.keyboard.press("Enter");
		await expect(page.locator("main")).toBeFocused();
	});

	test("calls the tab after the screen, the space and the product", async ({ page }) => {
		await openCofre(page, { name: "Andrei", space: "Meu dinheiro" });
		await expect(page).toHaveTitle("Painel | Meu dinheiro | Cofre Ink");

		await go(page, "Lançamentos");
		await expect(page).toHaveTitle("Lançamentos | Meu dinheiro | Cofre Ink");

		await go(page, "Orçamento");
		await expect(page).toHaveTitle("Orçamento | Meu dinheiro | Cofre Ink");
	});

	test("gives every screen exactly one first level heading", async ({ page }) => {
		await openCofre(page, { name: "Andrei" });

		for (const screen of ["Painel", "Lançamentos", "Orçamento", "Relatórios", "Contas"]) {
			await go(page, screen);
			await expect(page.getByRole("heading", { level: 1 }), `${screen} has one h1`).toHaveCount(1);
		}
	});

	test("names every control a person can type into", async ({ page }) => {
		await openCofre(page, { name: "Andrei" });
		await go(page, "Lançamentos");

		// Every input, select and textarea on the busiest screen in the product, each
		// one asked for its accessible name the way a screen reader asks.
		const nameless = await page.evaluate(() => {
			const named = (element: Element): boolean => {
				const control = element as HTMLInputElement;
				if (control.type === "hidden") return true;
				if (control.getAttribute("aria-label")) return true;
				if (control.getAttribute("aria-labelledby")) return true;
				if (control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`)) {
					return true;
				}
				return control.closest("label") !== null;
			};

			return [...document.querySelectorAll("input, select, textarea")]
				.filter((element) => !named(element))
				.map((element) => `${element.tagName}.${element.className}`);
		});

		expect(nameless).toEqual([]);
	});
});
