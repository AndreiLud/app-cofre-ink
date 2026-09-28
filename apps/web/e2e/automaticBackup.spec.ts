// The copy that keeps itself up to date, against a folder that answers.
//
// Every other flow in this suite runs against the real thing. This one cannot: a WebDAV
// server is somebody else's machine, and the point of the destination is that it is
// theirs and not ours. So the folder is answered here, by the test, which is enough to
// drive the real store, the real engine and the real triggers: what is checked is that
// the application reads before it writes, writes when there is something to write, and
// writes again by itself when a record is typed.

import { expect, test } from "@playwright/test";

import { go, openCofre, record } from "./support.ts";

const FOLDER = "https://nuvem.exemplo.com/dav/cofre";

/** A folder that keeps one file per space, and counts what was written to it. */
async function aFolderThatAnswers(page: import("@playwright/test").Page) {
	const held = new Map<string, Buffer>();
	const versions = new Map<string, number>();
	let writes = 0;

	const cors = {
		"access-control-allow-origin": "*",
		"access-control-allow-methods": "GET,PUT,DELETE,OPTIONS",
		"access-control-allow-headers": "authorization,content-type,if-match,if-none-match",
		"access-control-expose-headers": "etag",
	};

	await page.route("**nuvem.exemplo.com/**", async (route) => {
		const request = route.request();
		const name = new URL(request.url()).pathname;
		const method = request.method();

		if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });

		if (method === "GET") {
			const body = held.get(name);
			if (!body) return route.fulfill({ status: 404, headers: cors });
			return route.fulfill({
				status: 200,
				headers: { ...cors, etag: `"${versions.get(name) ?? 1}"` },
				body,
			});
		}

		if (method === "PUT") {
			const body = request.postDataBuffer();
			// A copy that is emptied by a bug looks like a copy right up to the day it is
			// needed, so the folder itself refuses to hold nothing.
			if (!body || body.length === 0) return route.fulfill({ status: 400, headers: cors });

			held.set(name, body);
			versions.set(name, (versions.get(name) ?? 0) + 1);
			writes += 1;
			return route.fulfill({
				status: 201,
				headers: { ...cors, etag: `"${versions.get(name)}"` },
			});
		}

		if (method === "DELETE") {
			const had = held.delete(name);
			versions.delete(name);
			return route.fulfill({ status: had ? 204 : 404, headers: cors });
		}

		return route.fulfill({ status: 405, headers: cors });
	});

	return {
		get writes() {
			return writes;
		},
		get files() {
			return [...held.keys()];
		},
	};
}

async function setUpTheFolder(page: import("@playwright/test").Page) {
	await go(page, "Dados");
	await page.getByLabel("Onde guardar a cópia").selectOption({ label: "Uma pasta WebDAV" });
	await page.getByLabel("Endereço da pasta").fill(FOLDER);
	await page.getByLabel("Usuário").fill("ana");
	await page.getByLabel("Senha de aplicativo").fill("uma senha de aplicativo");
}

test.describe("the copy that keeps itself up to date", () => {
	test("tests the place, writes every space, and says when it managed it", async ({ page }) => {
		const folder = await aFolderThatAnswers(page);
		await openCofre(page);
		await setUpTheFolder(page);

		// Testing reads and writes nothing, so the folder is still empty afterwards.
		await page.getByRole("button", { name: "Testar conexão" }).click();
		await expect(page.getByText("Conexão funcionando.")).toBeVisible({ timeout: 20_000 });
		expect(folder.writes).toBe(0);

		await page.getByRole("button", { name: "Ligar" }).click();
		await page.getByRole("button", { name: "Fazer backup agora" }).click();

		await expect(page.getByText(/Backup salvo às \d{2}:\d{2}/)).toBeVisible({ timeout: 20_000 });
		// The demonstration has two spaces, and a backup takes all of them at once.
		expect(folder.files).toHaveLength(2);
		expect(folder.writes).toBe(2);

		// And the state stops saying never, in the panel that runs it and in the one at
		// the top of the screen that answers where the data is.
		await expect(page.locator("#copia").getByText("Nunca")).toHaveCount(0);
		const whereItIs = page
			.locator("section")
			.filter({ has: page.getByRole("heading", { name: "Onde estão os seus dados" }) });
		// The name of the place, said without a preposition glued to it: the two places
		// have different genders in Portuguese and no single preposition fits both.
		await expect(whereItIs.getByText("Ativo. Destino: pasta WebDAV")).toBeVisible();
	});

	/**
	 * Bringing a file back while a copy is keeping itself up to date somewhere makes the
	 * two sides differ, and there are only two honest answers to that. Neither is chosen
	 * for them.
	 */
	test("asks whether a file coming back should become the copy as well", async ({ page }) => {
		const folder = await aFolderThatAnswers(page);
		await openCofre(page);
		await setUpTheFolder(page);

		await page.getByRole("button", { name: "Ligar" }).click();
		await page.getByRole("button", { name: "Fazer backup agora" }).click();
		await expect(page.getByText(/Backup salvo às \d{2}:\d{2}/)).toBeVisible({ timeout: 20_000 });

		const download = page.waitForEvent("download");
		await page.getByRole("button", { name: "Baixar", exact: true }).first().click();
		const path = await (await download).path();

		await page.getByLabel("Escolher arquivo").setInputFiles(path);
		const dialog = page.getByRole("dialog");

		// The question is asked, and the answer nobody gave is the one that touches
		// nothing over there.
		const alsoTheBackup = dialog.getByRole("checkbox", {
			name: "Trocar também o backup automático",
		});
		await expect(alsoTheBackup).not.toBeChecked();
		await expect(dialog.getByText(/perguntar com qual ficar/)).toBeVisible();

		await alsoTheBackup.check();
		await expect(dialog.getByText(/perguntar com qual ficar/)).toHaveCount(0);

		const before = folder.writes;
		await dialog.getByRole("button", { name: "Trazer de volta" }).click();
		await expect(page.getByText("Restaurado", { exact: true })).toBeVisible({ timeout: 20_000 });

		// Both spaces of the file were written over the copy, on purpose.
		expect(folder.writes).toBeGreaterThan(before);
	});

	/**
	 * An erased space leaves no deletion marks, so the copy is simply ahead and the next
	 * run brings the whole thing back and calls it a success. One of two things has to
	 * happen, and the person picks which.
	 */
	test("erasing a space takes its copy too, or switches the backup off", async ({ page }) => {
		const folder = await aFolderThatAnswers(page);
		await openCofre(page);
		await setUpTheFolder(page);

		await page.getByRole("button", { name: "Ligar" }).click();
		await page.getByRole("button", { name: "Fazer backup agora" }).click();
		await expect(page.getByText(/Backup salvo às \d{2}:\d{2}/)).toBeVisible({ timeout: 20_000 });
		expect(folder.files).toHaveLength(2);

		// The shared space, so the space itself goes and not only what is in it.
		await page
			.getByRole("listitem")
			.filter({ hasText: "Casa" })
			.getByRole("button", { name: "Apagar os dados" })
			.click();

		const dialog = page.getByRole("dialog");
		const alsoTheCopy = dialog.getByRole("checkbox", { name: /Apagar também a cópia/ });
		await expect(alsoTheCopy).toBeChecked();

		await dialog.getByLabel(/Escreva .* para confirmar/).fill("Casa");
		await dialog.getByRole("button", { name: "Apagar agora" }).click();

		await expect(page.getByText("A cópia no destino também foi apagada.")).toBeVisible({
			timeout: 20_000,
		});
		// One file left, which is the personal space that was not erased.
		expect(folder.files).toHaveLength(1);
	});

	test("keeps the copy and switches the backup off when asked to", async ({ page }) => {
		const folder = await aFolderThatAnswers(page);
		await openCofre(page);
		await setUpTheFolder(page);

		await page.getByRole("button", { name: "Ligar" }).click();
		await page.getByRole("button", { name: "Fazer backup agora" }).click();
		await expect(page.getByText(/Backup salvo às \d{2}:\d{2}/)).toBeVisible({ timeout: 20_000 });

		await page
			.getByRole("listitem")
			.filter({ hasText: "Casa" })
			.getByRole("button", { name: "Apagar os dados" })
			.click();

		const dialog = page.getByRole("dialog");
		await dialog.getByRole("checkbox", { name: /Apagar também a cópia/ }).uncheck();
		await expect(dialog.getByText(/o backup automático vai ser desligado/)).toBeVisible();

		await dialog.getByLabel(/Escreva .* para confirmar/).fill("Casa");
		await dialog.getByRole("button", { name: "Apagar agora" }).click();

		await expect(page.getByText(/O backup automático foi desligado/)).toBeVisible({
			timeout: 20_000,
		});
		// The copy is still there, and nothing is going to put it back into the browser.
		expect(folder.files).toHaveLength(2);
		await expect(page.getByRole("button", { name: "Ligar" })).toBeVisible();
	});

	/**
	 * The copy goes first and the space only once that worked. Erasing here and reaching
	 * for the place afterwards left the space gone from this device, the backup still on,
	 * and the place still holding it, so the next run brought the emptied space back.
	 */
	test("erases nothing when the place cannot be reached", async ({ page }) => {
		const folder = await aFolderThatAnswers(page);
		await openCofre(page);
		await setUpTheFolder(page);

		await page.getByRole("button", { name: "Ligar" }).click();
		await page.getByRole("button", { name: "Fazer backup agora" }).click();
		await expect(page.getByText(/Backup salvo às \d{2}:\d{2}/)).toBeVisible({ timeout: 20_000 });
		expect(folder.files).toHaveLength(2);

		// From here the folder refuses everything, which is a token that expired or a
		// cloud that is down.
		await page.route("**nuvem.exemplo.com/**", async (route) => {
			if (route.request().method() === "OPTIONS") {
				return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
			}
			return route.fulfill({ status: 401, headers: { "access-control-allow-origin": "*" } });
		});

		await page
			.getByRole("listitem")
			.filter({ hasText: "Casa" })
			.getByRole("button", { name: "Apagar os dados" })
			.click();

		const dialog = page.getByRole("dialog");
		await dialog.getByLabel(/Escreva .* para confirmar/).fill("Casa");
		await dialog.getByRole("button", { name: "Apagar agora" }).click();

		// It says why, in the language of the screen, and nothing was erased.
		await expect(dialog.getByText(/Acesso recusado pelo destino/)).toBeVisible({
			timeout: 20_000,
		});
		await page.getByRole("button", { name: "Cancelar" }).first().click();
		await expect(page.getByRole("listitem").filter({ hasText: "Casa" })).toBeVisible();
	});

	/**
	 * An address that cannot be turned into a request used to take the whole run down.
	 *
	 * The store was built outside the try, so the throw from a destination refusing an
	 * address that is not one rejected a promise nobody was holding: no sentence, no time
	 * recorded, and the panel still saying Active while nothing was ever copied.
	 */
	test("says so when the place cannot even be addressed", async ({ page }) => {
		await aFolderThatAnswers(page);
		await openCofre(page);
		await setUpTheFolder(page);

		await page.getByRole("button", { name: "Ligar" }).click();
		await page.getByRole("button", { name: "Fazer backup agora" }).click();
		await expect(page.getByText(/Backup salvo às \d{2}:\d{2}/)).toBeVisible({ timeout: 20_000 });

		// Something that is not an address at all, which a person reaches by pasting the
		// wrong half of something. It used to count as a complete place, so the backup
		// stayed armed and every pass died before it could say a word.
		for (const notAnAddress of ["a pasta do cofre", "ftp://nuvem.exemplo.com/cofre", "   "]) {
			await page.getByLabel("Endereço da pasta").fill(notAnAddress);
			await expect(page.getByText("nada está sendo copiado")).toBeVisible();
			await expect(page.locator("#copia").getByText("Inativo", { exact: true })).toBeVisible();
			await expect(page.getByRole("button", { name: "Fazer backup agora" })).toBeDisabled();
			// And the way out is never greyed out.
			await expect(page.getByRole("button", { name: "Desligar" })).toBeEnabled();
		}

		// Typing a real one back brings it to life without anybody pressing anything else.
		await page.getByLabel("Endereço da pasta").fill(FOLDER);
		await expect(page.getByText("nada está sendo copiado")).toHaveCount(0);
		await expect(page.locator("#copia").getByText("Ativo", { exact: true })).toBeVisible();
	});

	/**
	 * Turso shows a database address as libsql://name.turso.io, and the hint beside the
	 * field asks for the host on its own. Both were refused before any call was made, with
	 * a sentence blaming the connection.
	 */
	test("takes the database address the way the service shows it", async ({ page }) => {
		await page.route("**cofre.turso.io/**", async (route) => {
			const cors = {
				"access-control-allow-origin": "*",
				"access-control-allow-methods": "POST,OPTIONS",
				"access-control-allow-headers": "authorization,content-type",
			};
			if (route.request().method() === "OPTIONS") {
				return route.fulfill({ status: 204, headers: cors });
			}
			return route.fulfill({
				status: 200,
				headers: { ...cors, "content-type": "application/json" },
				body: JSON.stringify({ results: [{ type: "ok", response: { type: "execute" } }] }),
			});
		});

		await openCofre(page);
		await go(page, "Dados");
		await page
			.getByLabel("Onde guardar a cópia")
			.selectOption({ label: "Um banco de dados online" });
		await page.getByLabel("Endereço do banco").fill("libsql://cofre.turso.io");
		await page.getByLabel("Token", { exact: true }).fill("um token");

		await page.getByRole("button", { name: "Testar conexão" }).click();
		// Whatever the fake database answers, what must not happen is a complaint about
		// the address before anything left the browser.
		await expect(page.getByText(/Não consegui falar com o destino/)).toHaveCount(0);
	});

	test("writes again by itself once a record is typed", async ({ page }) => {
		const folder = await aFolderThatAnswers(page);
		await openCofre(page);
		await setUpTheFolder(page);

		await page.getByRole("button", { name: "Ligar" }).click();
		await page.getByRole("button", { name: "Fazer backup agora" }).click();
		await expect(page.getByText(/Backup salvo às \d{2}:\d{2}/)).toBeVisible({ timeout: 20_000 });

		const before = folder.writes;

		// One record, typed the way anybody types one.
		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		await page.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("12,30");
		await page.getByRole("dialog").getByLabel("Descrição").fill("Pão na padaria");
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(record(page, "Pão na padaria")).toBeVisible();

		// Nobody pressed anything. The clock that waits for the typing to stop is four
		// seconds, so this is the only place in the suite that waits on purpose.
		await expect(async () => {
			expect(folder.writes).toBeGreaterThan(before);
		}).toPass({ timeout: 30_000 });
	});
});
