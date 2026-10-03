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
		await openCofre(page);

		await page.keyboard.press("Tab");
		const skip = page.getByRole("link", { name: "Ir para o conteúdo" });
		await expect(skip).toBeFocused();

		await page.keyboard.press("Enter");
		await expect(page.locator("main")).toBeFocused();
	});

	// Part 1, E.6.1 of the request for 2.0.0 (WCAG 4.1.3): no message of a result was announced.
	// The callout had no role and nothing in the application used a live region, so a save that
	// was refused said so only to whoever was looking at the bottom of the dialog.
	test("announces what a press came to", async ({ page }) => {
		await openCofre(page);
		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Valor", { exact: true }).fill("10,00");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(dialog.getByRole("alert")).toContainText(/descrição/i);
	});

	// Part 1, E.6.4 of the request for 2.0.0: a screen that is on no line of the navigation fell
	// back to the first section, so importing, the month on paper and the spaces all said the
	// page in front of somebody was the overview.
	test("marks the section a screen belongs to, and not the overview by default", async ({
		page,
	}) => {
		await openCofre(page);
		const sections = page.getByRole("navigation", { name: "Seções do aplicativo" });
		for (const [path, section] of [
			["/importar", "Lançamentos"],
			["/relatorio", "Relatórios"],
			["/espacos", "Ajustes"],
		] as const) {
			await page.goto(path);
			await expect(sections.getByRole("link", { name: section })).toHaveAttribute(
				"aria-current",
				"true",
			);
			await expect(sections.getByRole("link", { name: "Painel" })).not.toHaveAttribute(
				"aria-current",
			);
		}
		// The overview is the page it says it is when it is the page.
		await page.goto("/");
		await expect(sections.getByRole("link", { name: "Painel" })).toHaveAttribute(
			"aria-current",
			"page",
		);
	});

	test("calls the tab after the screen, the space and the product", async ({ page }) => {
		await openCofre(page);
		await expect(page).toHaveTitle("Painel | Pessoal | Cofre Ink");

		await go(page, "Lançamentos");
		await expect(page).toHaveTitle("Lançamentos | Pessoal | Cofre Ink");

		await go(page, "Orçamento");
		await expect(page).toHaveTitle("Orçamento | Pessoal | Cofre Ink");
	});

	test("gives every screen exactly one first level heading", async ({ page }) => {
		await openCofre(page);

		for (const screen of ["Painel", "Lançamentos", "O mês", "Orçamento", "Relatórios", "Contas"]) {
			await go(page, screen);
			await expect(page.getByRole("heading", { level: 1 }), `${screen} has one h1`).toHaveCount(1);
		}
	});

	test("names every control a person can type into", async ({ page }) => {
		await openCofre(page);

		// The busiest screen in the product, and the one that is nothing but a form.
		for (const screen of ["Lançamentos", "O mês"]) {
			await go(page, screen);

			// Every input, select and textarea on it, each one asked for its accessible
			// name the way a screen reader asks.
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

			expect(nameless, `${screen} names every control`).toEqual([]);
		}
	});
});
