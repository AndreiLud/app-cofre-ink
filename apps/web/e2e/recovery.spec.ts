// Getting back in, from state left by a version before this one.
//
// Everything else in this suite starts from an empty browser. Nobody uses the product
// that way: they use it for months, things change under them, and what a browser is
// still holding is the settings of whatever came before. Two of those have already put
// somebody in front of a screen with no button on it, and both are here so that they
// cannot again.

import { expect, test } from "@playwright/test";
import { go, openCofre, record } from "./support.ts";

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
		// Straight into the application, because there is nothing left to ask: the door
		// already asked the one question that matters and the rest is correctable.
		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 20_000,
		});
	});

	test("changing where the data lives comes back to the same person", async ({ page }) => {
		await openCofre(page);

		// Something written, so there is a life in this browser to lose.
		await go(page, "Lançamentos");
		await page.getByLabel("Lançamento rápido").fill("lembrete disto 120,00 hoje");
		await page.getByRole("button", { name: "Lançar", exact: true }).click();
		await expect(record(page, "lembrete disto")).toBeVisible();

		// Back to the first question, and in again by the same door.
		await go(page, "Dados");
		await page.getByRole("button", { name: "Mudar onde ficam os dados" }).click();
		await expect(page.getByRole("button", { name: "Usar só neste navegador" })).toBeVisible();
		await page.getByRole("button", { name: "Usar só neste navegador" }).click();

		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
			timeout: 45_000,
		});

		// The same person, so the same spaces and the same records. It used to make
		// another person, and everything written before sat in the file unreachable.
		await go(page, "Lançamentos");
		await expect(record(page, "lembrete disto")).toBeVisible();
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

		// It comes back as nothing chosen, and they choose again from there.
		await expect(page.getByLabel("Onde guardar a cópia")).toHaveValue("");
		await expect(page.getByLabel("Onde guardar a cópia")).toContainText("Escolha um lugar");
	});
});
