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

	/**
	 * The server was a destination until 1.0.2 took it out, and its notes said somebody
	 * who had chosen it would find the backup off. Only the name of the place was dropped:
	 * the switch stayed on, so the panel said Active beside None configured, offered the
	 * schedule, and hid the one button that could have turned it off.
	 */
	test("a destination that was taken out takes the backup and the secret with it", async ({
		page,
	}) => {
		await page.addInitScript(() => {
			localStorage.setItem(
				"cofreDestination",
				JSON.stringify({
					kind: "server",
					address: "https://casa.exemplo.com",
					user: "ana@exemplo.com",
					secret: "a senha da conta",
				}),
			);
			localStorage.setItem(
				"cofreBackupWhen",
				JSON.stringify({ on: true, onLoad: true, everyMinutes: 60 }),
			);
		});

		await openCofre(page);
		await go(page, "Dados");

		// Off, nowhere, and no schedule offered for a backup that cannot run.
		await expect(page.locator("#copia").getByText("Inativo")).toBeVisible();
		await expect(page.locator("#copia").getByText("Nenhuma configurada")).toBeVisible();
		await expect(page.getByText("Quando fazer o backup")).toHaveCount(0);

		// And the password of the account they used to sign in with is not sitting in
		// this browser any more.
		const kept = await page.evaluate(() => localStorage.getItem("cofreDestination"));
		expect(kept).not.toContain("a senha da conta");
		expect(kept).not.toContain("casa.exemplo.com");

		// Picking a place does not arm it: the fields are empty, so there is nothing to
		// write and the run would only fail on every pass.
		await page.getByLabel("Onde guardar a cópia").selectOption({ label: "Uma pasta WebDAV" });
		await expect(page.getByLabel("Endereço da pasta")).toHaveValue("");
		await expect(page.getByRole("button", { name: "Ligar" })).toBeDisabled();
	});

	/**
	 * The clearing above happened when the settings were read, and the only screen that
	 * read them was this one. Somebody who never opened it kept the address of their
	 * server, the email of their account and the password they typed into that panel,
	 * whatever the notes of 1.0.3 said.
	 */
	test("takes the place that is gone on the way in, not when somebody looks", async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem(
				"cofreDestination",
				JSON.stringify({
					kind: "server",
					address: "https://casa.exemplo.com",
					user: "ana@exemplo.com",
					secret: "a senha da conta",
				}),
			);
		});

		await openCofre(page);
		// Straight to the records, which is where somebody actually goes, and nowhere near
		// the screen that holds the destination.
		await go(page, "Lançamentos");

		const kept = await page.evaluate(() => localStorage.getItem("cofreDestination"));
		expect(kept).not.toContain("a senha da conta");
		expect(kept).not.toContain("ana@exemplo.com");
		expect(kept).not.toContain("casa.exemplo.com");
	});

	/**
	 * Each place keeps its own fields.
	 *
	 * 1.0.2 emptied them whenever the name in the list changed, which threw away a folder
	 * somebody had set up. 1.0.3 kept them and carried them across, so a database was
	 * handed the folder's address and the folder's application password as a token, and
	 * every run posted that password to the folder.
	 */
	test("keeps the fields of each place apart from the fields of the other", async ({ page }) => {
		await openCofre(page);
		await go(page, "Dados");

		await page.getByLabel("Onde guardar a cópia").selectOption({ label: "Uma pasta WebDAV" });
		await page.getByLabel("Endereço da pasta").fill("https://nuvem.exemplo.com/cofre");
		await page.getByLabel("Usuário").fill("ana");
		await page.getByLabel("Senha de aplicativo").fill("a senha do aplicativo");

		// Over to the other place: nothing of the folder comes with it.
		await page
			.getByLabel("Onde guardar a cópia")
			.selectOption({ label: "Um banco de dados online" });
		await expect(page.getByLabel("Endereço do banco")).toHaveValue("");
		await expect(page.getByRole("button", { name: "Ligar" })).toBeDisabled();

		// And back again: the folder is exactly as it was left.
		await page.getByLabel("Onde guardar a cópia").selectOption({ label: "Uma pasta WebDAV" });
		await expect(page.getByLabel("Endereço da pasta")).toHaveValue(
			"https://nuvem.exemplo.com/cofre",
		);
		await expect(page.getByLabel("Usuário")).toHaveValue("ana");
	});

	/**
	 * The fields of a WebDAV folder, left under the database by 1.0.3.
	 *
	 * Pressing Continuar on the front door, or changing the name in the list, kept the
	 * fields and changed only the kind. 1.0.4 split the places apart and read what it
	 * found at face value, so the database ended up holding a folder address and an
	 * application password, the folder was blank, and the notes said the opposite.
	 */
	test("gives the fields of a folder back to the folder", async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem(
				"cofreDestination",
				JSON.stringify({
					kind: "database",
					address: "https://nuvem.exemplo.com/dav/cofre",
					user: "ana",
					secret: "a senha de aplicativo",
				}),
			);
		});

		await openCofre(page);
		await go(page, "Dados");

		// A database has no user, so a user is what says these belong to a folder.
		await expect(page.getByLabel("Onde guardar a cópia")).toHaveValue("webdav");
		await expect(page.getByLabel("Endereço da pasta")).toHaveValue(
			"https://nuvem.exemplo.com/dav/cofre",
		);
		await expect(page.getByLabel("Usuário")).toHaveValue("ana");

		// And the database is left with nothing of the folder in it.
		await page
			.getByLabel("Onde guardar a cópia")
			.selectOption({ label: "Um banco de dados online" });
		await expect(page.getByLabel("Endereço do banco")).toHaveValue("");
	});

	/**
	 * A backup that is on with one field of its place missing copies nothing, and the
	 * panel said Active and greyed out the only button that could have stopped it, because
	 * switching it off shared a guard with testing the connection and running it now.
	 */
	test("can always be switched off, whatever the place is missing", async ({ page }) => {
		await openCofre(page);
		await go(page, "Dados");

		await page.getByLabel("Onde guardar a cópia").selectOption({ label: "Uma pasta WebDAV" });
		await page.getByLabel("Endereço da pasta").fill("https://nuvem.exemplo.com/cofre");
		await page.getByLabel("Usuário").fill("ana");
		await page.getByLabel("Senha de aplicativo").fill("a senha do aplicativo");
		await page.getByRole("button", { name: "Ligar" }).click();
		await expect(page.locator("#copia").getByText("Ativo", { exact: true })).toBeVisible();

		// One field out, and nothing can be written any more.
		await page.getByLabel("Endereço da pasta").fill("");
		await expect(page.locator("#copia").getByText("Inativo", { exact: true })).toBeVisible();
		await expect(page.getByText("nada está sendo copiado")).toBeVisible();

		// The way out is not greyed out.
		const off = page.getByRole("button", { name: "Desligar" });
		await expect(off).toBeEnabled();
		await off.click();
		await expect(page.getByText("nada está sendo copiado")).toHaveCount(0);
	});
});
