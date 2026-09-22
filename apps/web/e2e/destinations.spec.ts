// Two devices, one file, no server.
//
// This is the flow the project promises to anybody who does not want to run anything:
// write on one device, carry a file, and the other device ends up with the same money.
// Two browsers with nothing shared between them is exactly what that is, so that is
// what this test uses.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { nav, openCofre, openSetting, record } from "./support.ts";

async function pickDestination(page: import("@playwright/test").Page, label: string) {
	await nav(page, "Dados").click();
	await page.getByLabel("Onde guardar a cópia").selectOption({ label });
}

test.describe("a copy somewhere else", () => {
	test("carries a space from one browser to another through a file", async ({ browser }) => {
		const folder = mkdtempSync(join(tmpdir(), "cofre"));

		// The first device: a shared space with something in it. Shared, because
		// syncing joins the same space in two places, and the personal space of a
		// device is the one space that is never the same as another device's.
		const first = await browser.newContext({ acceptDownloads: true });
		const one = await first.newPage();
		await openCofre(one, { name: "Ana", space: "Meu dinheiro" });

		await openSetting(one, "Gerenciar espaços");
		await one.getByRole("button", { name: "Novo espaço" }).click();
		await one.getByRole("dialog").getByLabel("Nome").fill("Casa");
		await one.getByRole("button", { name: "Salvar" }).click();
		await expect(one.getByRole("button", { name: /Você está no espaço Casa/ })).toBeVisible();

		await nav(one, "Contas").click();
		await one.getByRole("button", { name: "Nova conta" }).first().click();
		await one.getByRole("dialog").getByLabel("Nome").fill("Conta corrente");
		await one.getByRole("button", { name: "Salvar" }).click();

		await nav(one, "Lançamentos").click();
		await one.getByRole("button", { name: "Novo lançamento" }).first().click();
		await one.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("42,90");
		await one.getByRole("dialog").getByLabel("Descrição").fill("Mercado do bairro");
		await one
			.getByRole("dialog")
			.getByLabel("Conta", { exact: true })
			.selectOption({ label: "Conta corrente" });
		await one.getByRole("button", { name: "Salvar" }).click();
		await expect(record(one, "Mercado do bairro")).toBeVisible();

		await pickDestination(one, "Um arquivo que você move");

		const download = one.waitForEvent("download");
		await one.getByRole("button", { name: /Sincronizar Casa agora/ }).click();
		const file = await download;

		const carried = join(folder, file.suggestedFilename());
		await file.saveAs(carried);
		expect(file.suggestedFilename()).toMatch(/^cofre_sync_.+\.json$/);

		// The second device: another browser, nothing shared with the first.
		const second = await browser.newContext({ acceptDownloads: true });
		const two = await second.newPage();
		await openCofre(two, { name: "Ana", demo: false, space: "Pessoal" });

		await pickDestination(two, "Um arquivo que você move");
		await two.getByLabel("Arquivo do outro aparelho").setInputFiles(carried);
		await expect(two.getByText(/traz \d+ mudanças/)).toBeVisible();

		const back = two.waitForEvent("download");
		await two.getByRole("button", { name: "Trazer este espaço para cá" }).click();
		await back;

		// The space arrived, and it is theirs.
		await expect(two.getByText(/Casa chegou e agora é seu/)).toBeVisible();

		await nav(two, "Lançamentos").click();
		await expect(record(two, "Mercado do bairro")).toBeVisible();
		await expect(two.getByRole("cell", { name: "-R$ 42,90" })).toBeVisible();

		await first.close();
		await second.close();
	});

	test("says what to do when the file holds another device's personal space", async ({
		browser,
	}) => {
		const folder = mkdtempSync(join(tmpdir(), "cofre"));

		const first = await browser.newContext({ acceptDownloads: true });
		const one = await first.newPage();
		await openCofre(one, { name: "Ana", space: "Meu dinheiro" });

		await pickDestination(one, "Um arquivo que você move");
		const download = one.waitForEvent("download");
		await one.getByRole("button", { name: /Sincronizar Meu dinheiro agora/ }).click();
		const carried = join(folder, (await download).suggestedFilename());
		await (await download).saveAs(carried);

		const second = await browser.newContext({ acceptDownloads: true });
		const two = await second.newPage();
		await openCofre(two, { name: "Ana", demo: false, space: "Pessoal" });

		await pickDestination(two, "Um arquivo que você move");
		await two.getByLabel("Arquivo do outro aparelho").setInputFiles(carried);
		await two.getByRole("button", { name: "Trazer este espaço para cá" }).click();

		// Not a refusal with no way out: it names the way out.
		await expect(two.getByText(/use Restaurar aqui/)).toBeVisible();

		await first.close();
		await second.close();
	});

	test("says what each destination costs before anything is set up", async ({ page }) => {
		await openCofre(page);
		await nav(page, "Dados").click();

		// A drive that cannot say whether the file moved says so out loud.
		await page
			.getByLabel("Onde guardar a cópia")
			.selectOption({ label: "Uma pasta no Google Drive" });
		await expect(page.getByText(/podem perder uma das duas gravações/)).toBeVisible();

		// And one a browser cannot reach without permission says that instead.
		await page.getByLabel("Onde guardar a cópia").selectOption({ label: "Uma pasta WebDAV" });
		await expect(
			page.getByText(/só fala com este lugar se o servidor de lá permitir/),
		).toBeVisible();

		// The file asks for nothing and is ready at once.
		await page
			.getByLabel("Onde guardar a cópia")
			.selectOption({ label: "Um arquivo que você move" });
		await expect(page.getByLabel("Arquivo do outro aparelho")).toBeVisible();
	});
});
