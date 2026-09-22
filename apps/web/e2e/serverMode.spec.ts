// Two people, one server, one shared space.
//
// This is the flow that cannot be faked in browser mode, so it is the one worth
// driving through two separate browsers: each one has its own cookies, its own
// storage and its own session.

import { type Browser, expect, type Page, test } from "@playwright/test";
import { API_ADDRESS } from "../playwright.config.ts";
import { openSetting } from "./support.ts";

const PASSWORD = "uma senha bem comprida";

function uniqueEmail(who: string): string {
	return `${who}${Date.now()}${Math.floor(Math.random() * 1000)}@exemplo.invalido`;
}

/** Opens the application in its own browser, connects it to the server and signs up. */
async function arrive(browser: Browser, person: { name: string; email: string }): Promise<Page> {
	const context = await browser.newContext();
	const page = await context.newPage();

	await page.goto("/");
	await page.getByRole("button", { name: "Conectar a um servidor" }).click();
	await page.getByLabel("Endereço do servidor").fill(API_ADDRESS);

	// A server with nobody on it opens on creating the access rather than on a password
	// box nobody can fill, and which of the two it is comes from the server. Waiting for
	// that answer is what makes this deterministic: without it, the screen changes under
	// the click and the toggle sends it back to the form it was already on.
	const settled = page.waitForResponse((response) => response.url().includes("/api/setup"));
	await page.getByRole("button", { name: "Conectar", exact: true }).click();
	await settled;

	const naming = page.getByLabel("Como você se chama");
	if (!(await naming.isVisible())) {
		await page.getByRole("button", { name: "Ainda não tenho conta" }).click();
	}

	await naming.fill(person.name);
	await page.getByLabel("Email").fill(person.email);
	await page.getByLabel("Senha").fill(PASSWORD);
	await page.getByRole("button", { name: "Criar conta e entrar" }).click();

	await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible({
		timeout: 20_000,
	});
	return page;
}

test.describe("server mode", () => {
	test("signs up, and the personal space is there waiting", async ({ browser }) => {
		const page = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });

		await expect(page.getByRole("heading", { level: 1 })).toContainText("Pessoal");
		await openSetting(page, "Gerenciar espaços");
		await expect(page.getByRole("listitem").filter({ hasText: "Pessoal" })).toContainText(
			"Pessoal e privado",
		);
	});

	test("refuses a password that does not match the account", async ({ browser }) => {
		const email = uniqueEmail("ana");
		const page = await arrive(browser, { name: "Ana", email });

		await page.keyboard.press("Control+k");
		await page.getByRole("textbox", { name: "Digite para buscar" }).fill("sair");
		await page.keyboard.press("Enter");

		await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
		await page.getByLabel("Email").fill(email);
		await page.getByLabel("Senha").fill("outra senha qualquer");
		await page.getByRole("button", { name: "Entrar", exact: true }).click();

		await expect(page.getByText("Email ou senha não conferem.")).toBeVisible();
	});

	test("takes a second person from a link into the shared space", async ({ browser }) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });

		await openSetting(ana, "Gerenciar espaços");
		await ana.getByRole("button", { name: "Novo espaço" }).click();
		await ana.getByLabel("Nome do espaço").fill("Casa");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(ana.getByRole("banner")).toContainText("Casa");

		await openSetting(ana, "Membros");
		await ana.getByRole("button", { name: "Convidar" }).first().click();
		await ana.getByRole("button", { name: "Gerar link" }).click();

		const link = await ana.getByRole("dialog").locator("p.font-mono").innerText();
		expect(link).toContain("/convite/");

		const joao = await arrive(browser, { name: "João", email: uniqueEmail("joao") });
		await joao.goto(link);

		await expect(joao.getByRole("heading", { level: 1, name: "Convite" })).toBeVisible();
		await expect(joao.getByText("Ana convidou você para o espaço Casa")).toBeVisible();
		await joao.getByRole("button", { name: "Entrar no espaço" }).click();

		await expect(joao.getByRole("banner")).toContainText("Casa");

		// The shared space is shared. The personal space of the other person is not.
		await openSetting(joao, "Gerenciar espaços");
		await expect(joao.getByRole("listitem").filter({ hasText: "Casa" })).toBeVisible();
		await expect(joao.getByRole("listitem")).toHaveCount(2);

		// And the role that came with the link is the role that took effect.
		await ana.reload();
		await openSetting(ana, "Membros");
		await expect(ana.getByRole("cell", { name: "João" })).toBeVisible();
		await expect(ana.getByRole("cell", { name: "Editor" })).toBeVisible();
	});

	test("burns the link after the first person uses it", async ({ browser }) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });

		await openSetting(ana, "Gerenciar espaços");
		await ana.getByRole("button", { name: "Novo espaço" }).click();
		await ana.getByLabel("Nome do espaço").fill("Viagem");
		await ana.getByRole("button", { name: "Salvar" }).click();

		await openSetting(ana, "Membros");
		await ana.getByRole("button", { name: "Convidar" }).first().click();
		await ana.getByRole("button", { name: "Gerar link" }).click();
		const link = await ana.getByRole("dialog").locator("p.font-mono").innerText();

		const joao = await arrive(browser, { name: "João", email: uniqueEmail("joao") });
		await joao.goto(link);
		await joao.getByRole("button", { name: "Entrar no espaço" }).click();
		await expect(joao.getByRole("banner")).toContainText("Viagem");

		const carla = await arrive(browser, { name: "Carla", email: uniqueEmail("carla") });
		await carla.goto(link);
		await expect(
			carla.getByText("Este link já foi usado. Peça outro para quem convidou."),
		).toBeVisible();
	});
});
