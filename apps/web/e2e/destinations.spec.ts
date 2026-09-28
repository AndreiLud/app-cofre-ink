// The half of a copy that a machine makes.
//
// A file somebody carries used to be one of the destinations here, which put a thing a
// person does by hand beside things a machine does on its own. It moved to its own half
// of the screen. A server of theirs was here too and left for a different reason, in
// registry 0040: it holds the same spaces rather than a copy of them. What is left is a
// place that keeps a file: an online database, a WebDAV folder. Neither can be reached
// from a test runner, so what is checked here is what the screen promises before anything
// is reached: only the fields of the place that was picked, a connection that says why it
// failed, and a state anybody can read at a glance.

import { expect, test } from "@playwright/test";
import { go, openCofre } from "./support.ts";

async function openData(page: import("@playwright/test").Page) {
	await go(page, "Dados");
	await expect(page.getByRole("heading", { level: 1, name: "Dados" })).toBeVisible();
}

async function pick(page: import("@playwright/test").Page, label: string) {
	await page.getByLabel("Onde guardar a cópia").selectOption({ label });
}

test.describe("the automatic backup", () => {
	test("asks for nothing until a place is picked, and then only for that place", async ({
		page,
	}) => {
		await openCofre(page);
		await openData(page);

		// Nothing chosen is the honest starting state: there is no sensible default place
		// to keep somebody's money in.
		await expect(page.getByLabel("Onde guardar a cópia")).toHaveValue("");

		// Two places, and a server of theirs is not one of them. It used to be, and it
		// never ran on its own, which is registry 0040.
		await expect(page.getByLabel("Onde guardar a cópia").locator("option")).toHaveText([
			"Escolha um lugar",
			"Um banco de dados online",
			"Uma pasta WebDAV",
		]);
		await expect(page.getByLabel("Endereço da pasta")).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Testar conexão" })).toHaveCount(0);

		// One a browser cannot reach without the other side allowing it says so.
		await pick(page, "Uma pasta WebDAV");
		await expect(page.getByLabel("Endereço da pasta")).toBeVisible();
		await expect(page.getByLabel("Usuário")).toBeVisible();
		await expect(page.getByLabel("Senha de aplicativo")).toBeVisible();
		await expect(
			page.getByText(/só fala com este lugar se o servidor de lá permitir/),
		).toBeVisible();

		// And the next one asks for two things, with nothing of the last one left over.
		await pick(page, "Um banco de dados online");
		await expect(page.getByLabel("Endereço do banco")).toBeVisible();
		await expect(page.getByLabel("Token", { exact: true })).toBeVisible();
		await expect(page.getByLabel("Endereço da pasta")).toHaveCount(0);
		await expect(page.getByLabel("Usuário")).toHaveCount(0);
	});

	test("says what went wrong when the place does not answer", async ({ page }) => {
		await openCofre(page);
		await openData(page);

		await pick(page, "Uma pasta WebDAV");
		// Testing costs nothing and writes nothing, so it is there before anything is on,
		// and off until there is something to test with.
		await expect(page.getByRole("button", { name: "Testar conexão" })).toBeDisabled();

		await page.getByLabel("Endereço da pasta").fill("https://localhost:9/dav");
		await page.getByLabel("Usuário").fill("ana");
		await page.getByLabel("Senha de aplicativo").fill("uma senha de aplicativo");

		await page.getByRole("button", { name: "Testar conexão" }).click();
		await expect(page.getByText(/Não consegui falar com/)).toBeVisible({ timeout: 20_000 });
	});

	test("says whether it is on, where it goes and when it last managed", async ({ page }) => {
		await openCofre(page);
		await openData(page);

		// Before anything: off, nowhere, never.
		await expect(page.getByText("Inativo").first()).toBeVisible();
		await expect(page.getByText("Nenhuma configurada")).toBeVisible();

		await pick(page, "Um banco de dados online");
		await page.getByLabel("Endereço do banco").fill("https://cofre-teste.turso.io");
		await page.getByLabel("Token", { exact: true }).fill("um token qualquer");

		// Turning it on is the explicit action, and only then is there anything to say
		// about when it runs.
		await expect(page.getByText("A cada alteração, sempre.")).toHaveCount(0);
		await page.getByRole("button", { name: "Ligar" }).click();

		await expect(page.getByText("Ativo").first()).toBeVisible();
		await expect(page.getByText("A cada alteração, sempre.")).toBeVisible();
		await expect(page.getByLabel("Ao abrir a página")).toBeChecked();
		await expect(page.getByLabel("De tempos em tempos")).toHaveValue("60");

		// And it survives a reload, because it is a setting and not a mood.
		await page.reload();
		await openData(page);
		await expect(page.getByLabel("Onde guardar a cópia")).toHaveValue("database");
		await expect(page.getByRole("button", { name: "Desligar" })).toBeVisible();
	});
});
