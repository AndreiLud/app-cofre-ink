import { expect, test } from "@playwright/test";
import { openCofre, total } from "./support.ts";

test.describe("opening Cofre for the first time", () => {
	test("goes from an empty browser to a dashboard with money in it", async ({ page }) => {
		await openCofre(page, { name: "Andrei", space: "Pessoal" });

		await expect(page.getByRole("heading", { level: 1 })).toContainText("Pessoal");
		await expect(total(page)).toContainText("R$");
		// The demonstration data brings four accounts.
		await expect(page.getByRole("link", { name: "Ver todas" })).toBeVisible();
	});

	test("starts clean when the demonstration data is refused", async ({ page }) => {
		await openCofre(page, { name: "Andrei", demo: false });

		await expect(page.getByText("Nenhuma conta por aqui ainda")).toBeVisible();
		await expect(total(page)).toContainText("0,00");
	});

	test("keeps the profile after a reload", async ({ page }) => {
		await openCofre(page, { name: "Andrei", space: "Meu espaço" });
		await page.reload();

		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByRole("heading", { level: 1 })).toContainText("Meu espaço");
	});

	test("asks for a name before going anywhere", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Começar" }).click();

		await expect(page.getByRole("heading", { name: "Vamos abrir o seu Cofre" })).toBeVisible();
	});
});
