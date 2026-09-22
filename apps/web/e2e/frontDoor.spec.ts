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

		await expect(page.getByRole("heading", { name: "Como você quer usar o Cofre?" })).toBeVisible({
			timeout: 20_000,
		});

		await page.getByRole("button", { name: "Usar só neste navegador" }).click();

		// Straight in: no name, no currency, no form of any kind.
		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByText("Vamos abrir o seu Cofre")).toHaveCount(0);
		await expect(page.getByRole("heading", { level: 1 })).toContainText("Pessoal");

		// And the answer is remembered, so coming back is coming back to the application.
		await page.reload();
		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByRole("heading", { name: "Como você quer usar o Cofre?" })).toHaveCount(
			0,
		);
	});

	test("the name nobody was asked for can be corrected", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Usar só neste navegador" }).click();
		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 20_000,
		});

		await page.getByRole("button", { name: "Você está no espaço" }).click();
		await page.getByRole("menuitem", { name: "Mudar o meu nome" }).click();

		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Como você se chama").fill("Andrei");
		await dialog.getByRole("button", { name: "Salvar" }).click();

		await page.getByRole("button", { name: "Você está no espaço" }).click();
		await expect(page.getByText("Você é Andrei")).toBeVisible();
	});

	test("where the data lives can be answered again, from the data screen", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Usar só neste navegador" }).click();
		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 20_000,
		});

		await go(page, "Dados");
		await page.getByRole("button", { name: "Mudar onde ficam os dados" }).click();

		await expect(page.getByRole("heading", { name: "Como você quer usar o Cofre?" })).toBeVisible();
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
