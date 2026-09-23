// Getting back in, from state left by a version before this one.
//
// Everything else in this suite starts from an empty browser. Nobody uses the product
// that way: they use it for months, things change under them, and what a browser is
// still holding is the settings of whatever came before. Two of those have already put
// somebody in front of a screen with no button on it, and both are here so that they
// cannot again.

import { expect, test } from "@playwright/test";
import { go, openCofre } from "./support.ts";

test.describe("state from before", () => {
	test("a server that does not answer asks to sign in, and not for nothing", async ({ page }) => {
		// A machine at home that is switched off, an address that moved, a laptop on
		// another network. This browser is set up for a server and the server is not
		// there, which used to be the failure screen: a paragraph about private windows
		// and blocked storage, with nothing to press.
		await page.addInitScript(() => {
			localStorage.setItem("cofreMode", "server");
			localStorage.setItem("cofreServer", "http://127.0.0.1:59999");
		});

		await page.goto("/");

		await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible({ timeout: 20_000 });
		await expect(page.getByText("Não consegui abrir o banco de dados")).toHaveCount(0);
		// It says which server it is waiting for, which is half of knowing what to do.
		await expect(page.getByText("127.0.0.1:59999")).toBeVisible();

		// And the way out is on the same screen.
		await page.getByRole("button", { name: "Prefiro guardar só neste dispositivo" }).click();
		await expect(page.getByRole("heading", { name: "Vamos abrir o seu Cofre Ink" })).toBeVisible({
			timeout: 20_000,
		});
	});

	test("a destination that was taken out does not take the data screen with it", async ({
		page,
	}) => {
		// Dropbox and Drive are gone. Somebody who had chosen one is still carrying the
		// word, and a screen asking what that destination promises cannot be drawn at all.
		await page.addInitScript(() => {
			localStorage.setItem(
				"cofreDestination",
				JSON.stringify({ kind: "googleDrive", address: "", user: "", secret: "" }),
			);
		});

		await openCofre(page);
		await go(page, "Dados");

		await expect(page.getByRole("heading", { level: 1, name: "Dados" })).toBeVisible();

		// It fell back to the one that always works, and they choose again from there.
		await page.getByText("Manter uma cópia em outro lugar").click();
		await expect(page.getByLabel("Onde guardar a cópia")).toHaveValue("file");
	});
});
