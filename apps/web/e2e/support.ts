import { expect, type Page } from "@playwright/test";

/**
 * Walks the onboarding, which every flow starts from because each test opens a
 * browser with nothing stored.
 */
export async function openCofre(
	page: Page,
	options: { name?: string; demo?: boolean; space?: string } = {},
): Promise<void> {
	await page.goto("/");

	// The first question is where the data lives. These flows are about the mode that
	// needs no server.
	await page.getByRole("button", { name: "Usar este dispositivo" }).click();
	await expect(page.getByRole("heading", { name: "Vamos abrir o seu Cofre" })).toBeVisible({
		timeout: 20_000,
	});

	await page.getByLabel("Como você se chama").fill(options.name ?? "Andrei");
	if (options.space) {
		await page.getByLabel("Nome do seu espaço pessoal").fill(options.space);
	}

	const demo = page.getByRole("checkbox");
	if (options.demo === false) {
		await demo.uncheck();
	}

	await page.getByRole("button", { name: "Começar" }).click();
	await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
		timeout: 20_000,
	});
}

/** The amount shown as the answer to "how much do I have". */
export function total(page: Page) {
	return page.locator("main p.font-mono").first();
}
