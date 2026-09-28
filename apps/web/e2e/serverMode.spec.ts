// Two people, one server, one shared space.
//
// This is the flow that cannot be faked in browser mode, so it is the one worth
// driving through two separate browsers: each one has its own cookies, its own
// storage and its own session.

import { type Browser, expect, type Page, test } from "@playwright/test";
import { API_ADDRESS } from "../playwright.config.ts";
import { go, openSetting, record } from "./support.ts";

const PASSWORD = "uma senha bem comprida";

function uniqueEmail(who: string): string {
	return `${who}${Date.now()}${Math.floor(Math.random() * 1000)}@exemplo.invalido`;
}

/** Opens the application in its own browser, connects it to the server and signs up. */
async function arrive(browser: Browser, person: { name: string; email: string }): Promise<Page> {
	const context = await browser.newContext();
	const page = await context.newPage();

	await page.goto("/");
	// The second door opens on the way that needs a server, which is this one.
	await page.getByRole("button", { name: "Ver as duas formas" }).click();
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

	/**
	 * The same screen, with the data on a server instead of in the browser. The list of
	 * spaces to tick is a permission, so it comes from there too, and the file is built
	 * there and sent down.
	 */
	test("writes a backup of the ticked spaces, from the server", async ({ browser }) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });

		await openSetting(ana, "Gerenciar espaços");
		await ana.getByRole("button", { name: "Novo espaço" }).click();
		await ana.getByLabel("Nome do espaço").fill("Casa");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(ana.getByRole("banner")).toContainText("Casa");

		await go(ana, "Dados");
		await expect(ana.getByText("No seu servidor")).toBeVisible();
		await expect(ana.getByRole("checkbox", { name: "Pessoal" })).toBeChecked();
		await expect(ana.getByRole("checkbox", { name: "Casa" })).toBeChecked();

		const download = ana.waitForEvent("download");
		await ana.getByRole("button", { name: "Baixar", exact: true }).first().click();
		const file = await download;
		expect(file.suggestedFilename()).toMatch(/^cofre_backup_\d{8}\.json$/);
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

		await openSetting(ana, "Gerenciar espaços");
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
		await openSetting(ana, "Gerenciar espaços");
		await expect(ana.getByRole("cell", { name: "João" })).toBeVisible();
		await expect(ana.getByRole("cell", { name: "Editor" })).toBeVisible();
	});

	/**
	 * A role that cannot do a thing is not offered the button for it.
	 *
	 * Every one of these was drawn for everybody and refused by the model afterwards, in
	 * a sentence written for whoever wrote the code: "not allowed to sharing.write in the
	 * space ...". One of them, undoing a payment, failed in complete silence.
	 */
	test("offers a Viewer nothing it would refuse", async ({ browser }) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });

		await openSetting(ana, "Gerenciar espaços");
		await ana.getByRole("button", { name: "Novo espaço" }).click();
		await ana.getByLabel("Nome do espaço").fill("Casa");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(ana.getByRole("banner")).toContainText("Casa");

		// An account, because a space with none of them has no month to write and the
		// screen says so before it says anything about a role.
		await go(ana, "Contas");
		await ana.getByRole("button", { name: "Nova conta" }).first().click();
		await ana.getByRole("dialog").getByLabel("Nome").fill("Conta conjunta");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(ana.getByRole("cell", { name: "Conta conjunta" })).toBeVisible();

		await openSetting(ana, "Gerenciar espaços");
		await ana.getByRole("button", { name: "Convidar" }).first().click();
		await ana.getByLabel("Papel").selectOption({ label: "Leitor" });
		await ana.getByRole("button", { name: "Gerar link" }).click();
		const link = await ana.getByRole("dialog").locator("p.font-mono").innerText();
		// Closed, or it sits over everything and the next click on her page never lands.
		await ana.keyboard.press("Escape");
		await expect(ana.getByRole("dialog")).toHaveCount(0);

		const joao = await arrive(browser, { name: "João", email: uniqueEmail("joao") });
		await joao.goto(link);
		await joao.getByRole("button", { name: "Entrar no espaço" }).click();
		await expect(joao.getByRole("banner")).toContainText("Casa");

		// Inviting belongs to whoever runs the space, and a Viewer does not.
		await openSetting(joao, "Gerenciar espaços");
		await expect(joao.getByRole("button", { name: "Convidar" })).toHaveCount(0);

		// The month of the household is not a screen a Viewer writes.
		await go(joao, "O mês");
		await expect(joao.getByText("Você é Leitor neste espaço")).toBeVisible();
		await expect(joao.getByRole("button", { name: "Guardar o mês" })).toBeDisabled();

		// A record, and one split into parts, because the item that erases a whole
		// instalment plan was the one nobody had put a question in front of.
		await go(ana, "Lançamentos");
		await ana.getByRole("button", { name: "Novo lançamento" }).first().click();
		await ana.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("80,00");
		await ana.getByRole("dialog").getByLabel("Descrição").fill("Conta de luz");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(record(ana, "Conta de luz")).toBeVisible();

		// He was already looking at the space when she wrote it, so his copy of the list
		// is from before.
		await joao.reload();
		await go(joao, "Lançamentos");
		const hers = joao.getByRole("row").filter({ hasText: "Conta de luz" });
		await expect(hers).toBeVisible({ timeout: 20_000 });

		// Nothing that writes: not the button, not the one line entry, not the column that
		// picks rows for an action on many of them.
		await expect(joao.getByRole("button", { name: "Novo lançamento" })).toHaveCount(0);
		await expect(joao.getByRole("button", { name: "Lançar" })).toHaveCount(0);
		await expect(
			joao.getByRole("checkbox", { name: "Selecionar tudo que está na tela" }),
		).toHaveCount(0);

		// And no menu at all, on any row of the screen. It used to be a button that opened
		// an empty popup, except on a row split into parts, where one item had survived
		// every question: pressing it did nothing and said nothing.
		await expect(hers.getByRole("button", { name: "Ações" })).toHaveCount(0);
		await expect(joao.getByRole("button", { name: "Ações" })).toHaveCount(0);

		// The rest of the screens he can reach, each one without the buttons that would
		// only be refused.
		await go(joao, "Contas");
		await expect(joao.getByRole("button", { name: "Nova conta" })).toHaveCount(0);
		await expect(joao.getByRole("button", { name: "Ações da conta" })).toHaveCount(0);

		await go(joao, "Categorias");
		await expect(joao.getByRole("button", { name: "Nova categoria" })).toHaveCount(0);
		await expect(joao.getByRole("button", { name: "Nova regra" })).toHaveCount(0);

		await go(joao, "Orçamento");
		await expect(joao.getByRole("button", { name: "Novo limite" })).toHaveCount(0);
		await expect(joao.getByRole("button", { name: "Nova meta" })).toHaveCount(0);
		await expect(joao.getByRole("button", { name: "Definir a regra" })).toHaveCount(0);

		await go(joao, "Investimentos");
		await expect(joao.getByRole("button", { name: "Novo investimento" })).toHaveCount(0);

		// Importing is nothing but writing records, so it says so instead of walking him
		// through a file it would refuse at the end.
		await go(joao, "Dados");
		await joao.getByRole("button", { name: "Abrir a importação" }).click();
		await expect(joao.getByText("Você é Leitor neste espaço")).toBeVisible();
		await expect(joao.getByLabel("Arquivo do banco")).toHaveCount(0);

		// Erasing a space belongs to whoever owns it, and the question is asked per space:
		// he is a Viewer in Casa and the owner of his own personal space, so one of the two
		// rows keeps the button and the other does not.
		await go(joao, "Dados");
		const zone = joao.getByRole("listitem");
		await expect(
			zone.filter({ hasText: "Casa" }).getByRole("button", { name: "Apagar os dados" }),
		).toHaveCount(0);
		await expect(
			zone.filter({ hasText: "Pessoal" }).getByRole("button", { name: "Apagar os dados" }),
		).toBeVisible();

		// And correcting the name or the currency of the space is not his either.
		await openSetting(joao, "Gerenciar espaços");
		await expect(
			joao
				.getByRole("listitem")
				.filter({ hasText: "Casa" })
				.getByRole("button", { name: "Editar" }),
		).toHaveCount(0);

		// He reads the income of the people he shares the money with, because the number
		// was already in his browser and the hint beside the field promises only that it
		// stays inside this list. It used to say "não informada" about people who had
		// said, which reads as them not having done their part.
		await openSetting(ana, "Gerenciar espaços");
		await ana.getByRole("button", { name: "Dizer" }).first().click();
		await ana.getByRole("dialog").getByLabel("Renda mensal").fill("4.500,00");
		await ana.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
		await expect(ana.getByRole("dialog")).toHaveCount(0);

		await joao.reload();
		await openSetting(joao, "Gerenciar espaços");
		await expect(joao.getByText("R$ 4.500,00")).toBeVisible({ timeout: 20_000 });
	});

	/**
	 * A failure that is not a refusal does not read like one.
	 *
	 * Every screen used to translate its own failures, and they disagreed. One of them
	 * answered "your role does not allow that" to everything that was not a rule, so a
	 * dropped connection told somebody their role was the problem. The rest printed the
	 * sentence the model writes for whoever wrote the code, in English, or in the case of
	 * a browser that could not reach anything, "Failed to fetch".
	 *
	 * On a server that was not an edge case: a rule arrives there with its name in a
	 * different field from the one those screens looked in, so the branch that would have
	 * caught it never ran at all.
	 */
	test("says a dropped connection is a dropped connection", async ({ browser }) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });

		await go(ana, "Contas");
		// Nothing answers from here on, which is what being on a train looks like.
		await ana.route("**/api/**", (route) => route.abort());

		await ana.getByRole("button", { name: "Nova conta" }).first().click();
		await ana.getByRole("dialog").getByLabel("Nome").fill("Conta nova");
		await ana.getByRole("button", { name: "Salvar" }).click();

		await expect(ana.getByText("Não consegui falar com o servidor")).toBeVisible();
		await expect(ana.getByText(/Failed to fetch/)).toHaveCount(0);
		await expect(ana.getByText(/não permite isso/)).toHaveCount(0);
	});

	/**
	 * The other half of the same question, because a role that is offered too little is
	 * the same defect as one offered too much.
	 *
	 * A Logger writes records and only ever sees the ones they wrote. So the list is
	 * theirs to write in and to correct, and the three things that are decisions about
	 * the whole household are not.
	 */
	test("offers a Logger what it would allow, and only that", async ({ browser }) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });

		await openSetting(ana, "Gerenciar espaços");
		await ana.getByRole("button", { name: "Novo espaço" }).click();
		await ana.getByLabel("Nome do espaço").fill("Casa");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(ana.getByRole("banner")).toContainText("Casa");

		await go(ana, "Contas");
		await ana.getByRole("button", { name: "Nova conta" }).first().click();
		await ana.getByRole("dialog").getByLabel("Nome").fill("Conta conjunta");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(ana.getByRole("cell", { name: "Conta conjunta" })).toBeVisible();

		await openSetting(ana, "Gerenciar espaços");
		await ana.getByRole("button", { name: "Convidar" }).first().click();
		await ana.getByLabel("Papel").selectOption({ label: "Registrador" });
		await ana.getByRole("button", { name: "Gerar link" }).click();
		const link = await ana.getByRole("dialog").locator("p.font-mono").innerText();
		await ana.keyboard.press("Escape");
		await expect(ana.getByRole("dialog")).toHaveCount(0);

		const bia = await arrive(browser, { name: "Bia", email: uniqueEmail("bia") });
		await bia.goto(link);
		await bia.getByRole("button", { name: "Entrar no espaço" }).click();
		await expect(bia.getByRole("banner")).toContainText("Casa");

		// She writes, which is the whole point of the role.
		await go(bia, "Lançamentos");
		await bia.getByRole("button", { name: "Novo lançamento" }).first().click();
		await bia.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("30,00");
		await bia.getByRole("dialog").getByLabel("Descrição").fill("Feira");
		await bia.getByRole("button", { name: "Salvar" }).click();
		const mine = record(bia, "Feira");
		await expect(mine).toBeVisible();

		// And corrects what she wrote. The three that go are decisions about the whole
		// household: a rule for everybody, a division between people, and ticking a
		// record off against a bank statement.
		await mine.getByRole("button", { name: "Ações" }).click();
		for (const kept of ["Editar", "Apagar"]) {
			await expect(bia.getByRole("menuitem", { name: kept })).toBeVisible();
		}
		for (const gone of [
			"Sempre categorizar assim",
			"Dividir com a casa",
			"Conferido com o banco",
		]) {
			await expect(bia.getByRole("menuitem", { name: gone })).toHaveCount(0);
		}
		await bia.keyboard.press("Escape");

		// The month of the household is not hers to write, and the reason is not that she
		// may not write: it is that she would only ever see her own half of it.
		await go(bia, "O mês");
		await expect(bia.getByText("Você é Registrador neste espaço")).toBeVisible();
		await expect(bia.getByRole("button", { name: "Guardar o mês" })).toBeDisabled();

		// The plan of the space is not hers either, and importing a statement is.
		await go(bia, "Orçamento");
		await expect(bia.getByRole("button", { name: "Novo limite" })).toHaveCount(0);

		await go(bia, "Dados");
		await bia.getByRole("button", { name: "Abrir a importação" }).click();
		await expect(bia.getByLabel("Arquivo do banco")).toBeVisible();
	});

	/**
	 * Two shared spaces with different people in them, which is the ordinary shape of a
	 * life: a house with one person and a trip with another. The division used to offer
	 * everybody from both, and the model was right to refuse a division with somebody who
	 * is not in the space, so nobody in this situation could divide anything at all.
	 */
	test("divides with the people of this space, and not with everybody", async ({ browser }) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });

		for (const [name, guest] of [
			["Casa", "Joao"],
			["Viagem", "Carla"],
		] as const) {
			await openSetting(ana, "Gerenciar espaços");
			await ana.getByRole("button", { name: "Novo espaço" }).click();
			await ana.getByLabel("Nome do espaço").fill(name);
			await ana.getByRole("button", { name: "Salvar" }).click();
			await expect(ana.getByRole("banner")).toContainText(name);

			await openSetting(ana, "Gerenciar espaços");
			await ana.getByRole("button", { name: "Convidar" }).first().click();
			await ana.getByRole("button", { name: "Gerar link" }).click();
			const link = await ana.getByRole("dialog").locator("p.font-mono").innerText();
			await ana.keyboard.press("Escape");

			const other = await arrive(browser, { name: guest, email: uniqueEmail(guest) });
			await other.goto(link);
			await other.getByRole("button", { name: "Entrar no espaço" }).click();
			await expect(other.getByRole("banner")).toContainText(name);
		}

		// Back to the house, where the expense is.
		await openSetting(ana, "Gerenciar espaços");
		await ana
			.getByRole("listitem")
			.filter({ hasText: "Casa" })
			.getByRole("button", { name: "Entrar" })
			.click();
		await expect(ana.getByRole("banner")).toContainText("Casa");

		await go(ana, "Contas");
		await ana.getByRole("button", { name: "Nova conta" }).first().click();
		await ana.getByRole("dialog").getByLabel("Nome").fill("Conta conjunta");
		await ana.getByRole("button", { name: "Salvar" }).click();

		await go(ana, "Lançamentos");
		await ana.getByRole("button", { name: "Novo lançamento" }).first().click();
		await ana.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("200,00");
		await ana.getByRole("dialog").getByLabel("Descrição").fill("Conta de luz");
		await ana.getByRole("button", { name: "Salvar" }).click();

		await ana
			.getByRole("row")
			.filter({ hasText: "Conta de luz" })
			.getByRole("button", { name: "Ações" })
			.click();
		await ana.getByRole("menuitem", { name: "Dividir com a casa" }).click();

		// The people of the house, and Carla is not one of them. Ana is holding the
		// screen, so she is "you" rather than her own name, which is what the list of
		// members has always called whoever is reading it.
		const dialog = ana.getByRole("dialog");
		await expect(dialog.getByRole("option", { name: "Você" })).toHaveCount(1);
		await expect(dialog.getByRole("option", { name: "Ana" })).toHaveCount(0);
		await expect(dialog.getByRole("option", { name: "Joao" })).toHaveCount(1);
		await expect(dialog.getByRole("option", { name: "Carla" })).toHaveCount(0);

		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(dialog).toHaveCount(0);

		await openSetting(ana, "Gerenciar espaços");
		await expect(ana.getByText("Para zerar")).toBeVisible();
		await expect(ana.getByText("R$ 100,00").first()).toBeVisible();
	});

	test("burns the link after the first person uses it", async ({ browser }) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });

		await openSetting(ana, "Gerenciar espaços");
		await ana.getByRole("button", { name: "Novo espaço" }).click();
		await ana.getByLabel("Nome do espaço").fill("Viagem");
		await ana.getByRole("button", { name: "Salvar" }).click();

		await openSetting(ana, "Gerenciar espaços");
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
