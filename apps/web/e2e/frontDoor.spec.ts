// The first screen somebody sees, on an address anybody can open.
//
// The question it asks is the only one that is hard to change later: where the data
// lives. Everything else it could have asked (a name, a currency, what the space is
// called) is written with a default and corrected from inside, because a form between
// a stranger and the thing they came to look at is a form most of them close.

import { expect, test } from "@playwright/test";
import { go } from "./support.ts";

test.describe("the front door", () => {
	test("asks how they want to use it, and then asks nothing else", async ({ page }) => {
		await page.goto("/");

		await expect(
			page.getByRole("heading", { name: "Como você quer usar o Cofre Ink?" }),
		).toBeVisible({ timeout: 20_000 });

		await page.getByRole("button", { name: "Usar só neste navegador" }).click();

		// Straight in: no name, no currency, no form of any kind.
		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByText("Vamos abrir o seu Cofre Ink")).toHaveCount(0);
		await expect(page.getByRole("heading", { level: 1 })).toContainText("Pessoal");

		// And the answer is remembered, so coming back is coming back to the application.
		await page.reload();
		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 20_000,
		});
		await expect(
			page.getByRole("heading", { name: "Como você quer usar o Cofre Ink?" }),
		).toHaveCount(0);
	});

	/**
	 * The door asks nothing, so what it wrote down has to be correctable from inside.
	 * The name of the person is not one of those things any more: nobody is shown it
	 * and nothing is signed with it in a browser that holds one person. What the space
	 * is called and what it counts in are, and they are corrected in one screen.
	 */
	test("what the door decided without asking can be corrected", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Usar só neste navegador" }).click();
		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 20_000,
		});

		await page.getByRole("button", { name: "Você está no espaço" }).click();
		await page.getByRole("menuitem", { name: "Gerenciar espaços" }).click();

		await page
			.getByRole("listitem")
			.filter({ hasText: "Pessoal" })
			.getByRole("button", { name: "Editar" })
			.click();

		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Nome do espaço").fill("Meu dinheiro");
		await dialog.getByLabel("Moeda").selectOption("EUR");
		await dialog.getByRole("button", { name: "Salvar" }).click();

		// The list says the new name and the new currency, and so does the header.
		await expect(page.getByRole("listitem").filter({ hasText: "Meu dinheiro" })).toContainText(
			"EUR",
		);
		await expect(page.getByRole("banner")).toContainText("Meu dinheiro");
	});

	test("where the data lives can be answered again, from the data screen", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Usar só neste navegador" }).click();
		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 20_000,
		});

		await go(page, "Dados");
		await page.getByRole("button", { name: "Mudar onde ficam os dados" }).click();

		await expect(
			page.getByRole("heading", { name: "Como você quer usar o Cofre Ink?" }),
		).toBeVisible();
	});

	test("syncing through a database of theirs lands on the screen that asks for it", async ({
		page,
	}) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Ver as duas formas" }).click();

		// The way that needs no server at all: a database of theirs, in the cloud.
		await page.getByRole("button", { name: "Um banco na nuvem" }).click();
		await page.getByRole("button", { name: "Continuar" }).click();

		await expect(page.getByRole("heading", { level: 1, name: "Dados" })).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByLabel("Onde guardar a cópia")).toHaveValue("database");
	});
});
