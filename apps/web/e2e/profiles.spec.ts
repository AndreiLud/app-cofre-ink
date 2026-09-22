// Two people, one machine.
//
// A browser holds one database, and until now it held one person: being somebody else
// meant forgetting the profile and making another, which left the first one in the
// database with no way back to it. This is the flow that has to work instead, and the
// part worth proving is not that the name changes at the top: it is that one person's
// money is not in the other person's screens.

import { expect, test } from "@playwright/test";
import { go, openCofre, record } from "./support.ts";

test.describe("more than one person on this device", () => {
	test("keeps each profile to its own money, and goes back to the first", async ({ page }) => {
		await openCofre(page, { name: "Andrei" });

		// The first person has the demonstration space, with something in it.
		await go(page, "Lista");
		await expect(record(page, "Café da esquina")).toBeVisible();

		// Somebody else picks up the same machine.
		await page.getByRole("button", { name: "Você está no espaço" }).click();
		await expect(page.getByText("Você é Andrei")).toBeVisible();
		await page.getByRole("menuitem", { name: "Adicionar outra pessoa neste aparelho" }).click();

		await expect(page.getByRole("heading", { name: "Vamos abrir o seu Cofre" })).toBeVisible({
			timeout: 20_000,
		});
		await page.getByLabel("Como você se chama").fill("Bia");
		await page.getByRole("checkbox").uncheck();
		await page.getByRole("button", { name: "Começar" }).click();
		await page.getByRole("navigation", { name: "Seções do aplicativo" }).waitFor({
			timeout: 20_000,
		});

		// Her space is hers: none of his records, and none of his spaces.
		await go(page, "Lista");
		await expect(record(page, "Café da esquina")).toHaveCount(0);
		await page.getByRole("button", { name: "Você está no espaço" }).click();
		await expect(page.getByText("Você é Bia")).toBeVisible();
		await expect(page.getByRole("menuitem", { name: "Casa" })).toHaveCount(0);

		// And he is still there, with everything where he left it.
		await page.getByRole("menuitem", { name: "Entrar como Andrei" }).click();
		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 20_000,
		});

		await go(page, "Lista");
		await expect(record(page, "Café da esquina")).toBeVisible();

		// A reload comes back as whoever was reading, and not as the first one ever.
		await page.reload();
		await page.getByRole("button", { name: "Você está no espaço" }).click();
		await expect(page.getByText("Você é Andrei")).toBeVisible();
	});
});
