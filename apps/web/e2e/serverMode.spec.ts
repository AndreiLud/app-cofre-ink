// Two people, one server, one shared space.
//
// This is the flow that cannot be faked in browser mode, so it is the one worth
// driving through two separate browsers: each one has its own cookies, its own
// storage and its own session.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
	// What the server said, and not whether the screen has drawn it yet: asking the screen
	// raced the render, and on an empty server the toggle then sent it back to signing in.
	const { needsFirstAccount } = (await (await settled).json()) as { needsFirstAccount: boolean };

	const naming = page.getByLabel("Como você se chama");
	if (!needsFirstAccount) {
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

		// And the row of a space that is not his says so, instead of describing an erasure
		// with nothing beside it, which read as a warning about something about to happen.
		await expect(joao.getByText(/Apagar Casa é de quem é dono dele/)).toBeVisible();

		// An empty month is the state he is most likely to land on, and it was the one door
		// left unlocked: the button at the top asked first and this one did not.
		await go(joao, "Lançamentos");
		await joao.getByLabel("Mês", { exact: true }).fill("2020-01");
		await expect(joao.getByRole("button", { name: "Novo lançamento" })).toHaveCount(0);

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
	 * Handing a space to somebody else, which the model could always do and no screen
	 * could reach.
	 *
	 * It is the one way out of a space for whoever made it: leaving is refused to an
	 * owner, and the refusal says to hand it over first, which was a thing nobody could
	 * do. Owner is not in the list of roles that can be given, on purpose, because two
	 * owners is not a state the model has an answer for.
	 */
	test("hands a space to somebody else, and then the owner can leave", async ({ browser }) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });

		await openSetting(ana, "Gerenciar espaços");
		await ana.getByRole("button", { name: "Novo espaço" }).click();
		await ana.getByLabel("Nome do espaço").fill("Casa");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(ana.getByRole("banner")).toContainText("Casa");

		await openSetting(ana, "Gerenciar espaços");
		await ana.getByRole("button", { name: "Convidar" }).first().click();
		await ana.getByLabel("Papel").selectOption({ label: "Editor" });
		await ana.getByRole("button", { name: "Gerar link" }).click();
		const link = await ana.getByRole("dialog").locator("p.font-mono").innerText();
		await ana.keyboard.press("Escape");
		await expect(ana.getByRole("dialog")).toHaveCount(0);

		const bia = await arrive(browser, { name: "Bia", email: uniqueEmail("bia") });
		await bia.goto(link);
		await bia.getByRole("button", { name: "Entrar no espaço" }).click();
		await expect(bia.getByRole("banner")).toContainText("Casa");

		// The owner of a space is not offered the way out of it, because leaving is refused
		// to them until they have handed it on.
		await ana.reload();
		await openSetting(ana, "Gerenciar espaços");
		await expect(ana.getByRole("button", { name: "Sair deste espaço" })).toHaveCount(0);

		// Owner is not one of the roles on offer.
		const hers = ana.getByRole("row").filter({ hasText: "Bia" });
		await hers.getByRole("button", { name: "Ações do membro" }).click();
		await expect(ana.getByRole("menuitem", { name: /Tornar Dono/ })).toHaveCount(0);

		// Handing it over is typed out, because she cannot undo it by herself.
		await ana.getByRole("menuitem", { name: "Passar o espaço para esta pessoa" }).click();
		const handing = ana.getByRole("dialog");
		await expect(handing.getByRole("button", { name: "Passar o espaço" })).toBeDisabled();
		await handing.getByLabel(/Escreva Bia para confirmar/).fill("Bia");
		await handing.getByRole("button", { name: "Passar o espaço" }).click();
		await expect(handing).toHaveCount(0);

		// Bia owns it, Ana is an administrator, and now Ana has a way out.
		await expect(ana.getByRole("cell", { name: "Administrador" })).toBeVisible();
		await expect(ana.getByRole("button", { name: "Sair deste espaço" })).toBeVisible();

		await bia.reload();
		await openSetting(bia, "Gerenciar espaços");
		await expect(bia.getByRole("cell", { name: "Dono" })).toBeVisible();
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
	 * And a failure with no dialog over it is drawn on the screen it happened on.
	 *
	 * This is the test that was missing when the callout for it was written, and the
	 * callout was written wrong: the guard read `open`, which no screen declares, so it
	 * resolved to the browser's own window.open, which is always there. The guard was
	 * therefore never true and the sentence was never drawn. TypeScript accepts that,
	 * because window.open is a real global of exactly the kind a negation takes.
	 */
	test("says so on the screen when something outside a dialog fails", async ({ browser }) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });

		await go(ana, "Contas");
		await ana.getByRole("button", { name: "Nova conta" }).first().click();
		await ana.getByRole("dialog").getByLabel("Nome").fill("Conta conjunta");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(ana.getByRole("cell", { name: "Conta conjunta" })).toBeVisible();

		// From the menu on the row, with nothing over it, and nothing answering.
		await ana.route("**/api/**", (route) => route.abort());
		const row = ana.getByRole("row").filter({ hasText: "Conta conjunta" });
		await row.getByRole("button", { name: "Ações da conta" }).click();
		await ana.getByRole("menuitem", { name: "Arquivar" }).click();

		await expect(ana.getByText("Não consegui falar com o servidor")).toBeVisible();
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

		// And the file of the whole month, which she may open: it is her own month in it,
		// said at the top, and the check up is not in it at all, because every threshold
		// behind its verdict was written for a household.
		await bia.goto("/relatorio?mes=2026-09");
		await expect(bia.getByText("Só os seus lançamentos")).toBeVisible();
		await expect(bia.getByRole("heading", { name: "Diagnóstico" })).toHaveCount(0);
		// The parts that are made of records are still there, so the file is not empty.
		await expect(bia.getByRole("heading", { name: "O mês", exact: true })).toBeVisible();
	});

	// Part 1, B.8 of the request for 2.0.0. In "Todos", a meal card from a space where this
	// person is a logger said its allowance was missing, because the overview read the
	// role of the space that happened to be open.
	test("decides a meal card by the role in its own space, in every space", async ({ browser }) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });
		await openSetting(ana, "Gerenciar espaços");
		await ana.getByRole("button", { name: "Novo espaço" }).click();
		await ana.getByLabel("Nome do espaço").fill("Casa");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(ana.getByRole("banner")).toContainText("Casa");

		await go(ana, "Contas");
		await ana.getByRole("button", { name: "Nova conta" }).first().click();
		const dialog = ana.getByRole("dialog");
		await dialog.getByLabel("Nome").fill("Vale da casa");
		await dialog.getByLabel("Tipo").selectOption("voucher");
		await dialog.getByLabel("Valor por mês").fill("900,00");
		await dialog.getByLabel("Dia do crédito").selectOption("5");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(ana.getByRole("cell", { name: "Vale da casa", exact: true })).toBeVisible();

		await openSetting(ana, "Gerenciar espaços");
		await ana.getByRole("button", { name: "Convidar" }).first().click();
		await ana.getByLabel("Papel").selectOption({ label: "Registrador" });
		await ana.getByRole("button", { name: "Gerar link" }).click();
		const link = await ana.getByRole("dialog").locator("p.font-mono").innerText();
		await ana.keyboard.press("Escape");

		const bia = await arrive(browser, { name: "Bia", email: uniqueEmail("bia") });
		await bia.goto(link);
		await bia.getByRole("button", { name: "Entrar no espaço" }).click();
		await expect(bia.getByRole("banner")).toContainText("Casa");

		// From her own space, where she is the owner, across every space.
		await bia.getByRole("button", { name: "Você está no espaço" }).click();
		await bia.getByRole("menuitem", { name: "Pessoal" }).click();
		await go(bia, "Painel");
		await bia.getByText("Todos", { exact: true }).click();
		await expect(bia.getByText("Você tem", { exact: true })).toBeVisible();
		await expect(bia.getByText("Sem valor mensal cadastrado")).toHaveCount(0);
		// The card is still listed where the money is, with no figure, which is what a
		// logger is told about a card made of everybody's lunches.
		await expect(bia.getByText("Vale da casa").first()).toBeVisible();
	});

	// Found reading the code for the report of 2.0.0: in "Todos", the button that says a record
	// happened, on the list of what falls due, followed the role in the space that was open, so a
	// viewer of another space was offered it on that space's records and refused when pressing.
	test("offers to say a record happened only where the role allows it, in every space", async ({
		browser,
	}) => {
		const bia = await arrive(browser, { name: "Bia", email: uniqueEmail("bia") });
		await openSetting(bia, "Gerenciar espaços");
		await bia.getByRole("button", { name: "Novo espaço" }).click();
		await bia.getByLabel("Nome do espaço").fill("Casa");
		await bia.getByRole("button", { name: "Salvar" }).click();
		await expect(bia.getByRole("banner")).toContainText("Casa");
		await go(bia, "Contas");
		await bia.getByRole("button", { name: "Nova conta" }).first().click();
		await bia.getByRole("dialog").getByLabel("Nome").fill("Conta conjunta");
		await bia.getByRole("button", { name: "Salvar" }).click();
		await expect(bia.getByRole("cell", { name: "Conta conjunta" })).toBeVisible();

		// Three days from today, so it is among what falls due whatever day this runs on.
		const ahead = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString("en-CA", {
			timeZone: "America/Sao_Paulo",
		});
		await go(bia, "Lançamentos");
		await bia.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = bia.getByRole("dialog");
		await form.getByLabel("Valor", { exact: true }).fill("90,00");
		await form.getByLabel("Descrição").fill("Gás da casa");
		await form.getByLabel("Dia").fill(ahead);
		await bia.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);

		await openSetting(bia, "Gerenciar espaços");
		await bia.getByRole("button", { name: "Convidar" }).first().click();
		await bia.getByLabel("Papel").selectOption({ label: "Leitor" });
		await bia.getByRole("button", { name: "Gerar link" }).click();
		const link = await bia.getByRole("dialog").locator("p.font-mono").innerText();
		await bia.keyboard.press("Escape");

		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });
		await ana.goto(link);
		await ana.getByRole("button", { name: "Entrar no espaço" }).click();
		await expect(ana.getByRole("banner")).toContainText("Casa");
		await ana.getByRole("button", { name: "Você está no espaço" }).click();
		await ana.getByRole("menuitem", { name: "Pessoal" }).click();
		await go(ana, "Painel");
		await ana.getByText("Todos", { exact: true }).click();

		const line = ana
			.locator("section#vence")
			.getByRole("listitem")
			.filter({ hasText: "Gás da casa" });
		await expect(line).toBeVisible({ timeout: 20_000 });
		await expect(line.getByRole("button", { name: "Aconteceu" })).toHaveCount(0);
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
		// The sentence every other screen would give for the same refusal. This screen used
		// to keep a second set of its own, so a used link said one thing here and another
		// thing anywhere else.
		await expect(
			carla.getByText("Esse convite já foi usado. Cada link serve uma vez só."),
		).toBeVisible();
	});

	// Part 2, G.1.2 of the request for 2.0.0: a logger sees the series of the house on their screen,
	// without the sentence, the button or a menu, and none of their days among what falls due or
	// on the calendar, which are made of their own records; a viewer sees them without a menu.
	test("shows a logger and a viewer the series of the house, and nothing to do with them", async ({
		browser,
	}) => {
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

		// Every week from today, so its next day is always inside the fifteen days ahead.
		await go(ana, "Lançamentos");
		await ana.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = ana.getByRole("dialog");
		await form.getByLabel("Valor", { exact: true }).fill("120,00");
		await form.getByLabel("Descrição").fill("Diarista");
		await form.getByLabel("Repete").selectOption({ label: "Toda semana" });
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);

		const invite = async (role: string) => {
			await openSetting(ana, "Gerenciar espaços");
			await ana.getByRole("button", { name: "Convidar" }).first().click();
			await ana.getByLabel("Papel").selectOption({ label: role });
			await ana.getByRole("button", { name: "Gerar link" }).click();
			const link = await ana.getByRole("dialog").locator("p.font-mono").innerText();
			await ana.keyboard.press("Escape");
			await expect(ana.getByRole("dialog")).toHaveCount(0);
			return link;
		};
		const join = async (name: string, link: string) => {
			const page = await arrive(browser, { name, email: uniqueEmail(name.toLowerCase()) });
			await page.goto(link);
			await page.getByRole("button", { name: "Entrar no espaço" }).click();
			await expect(page.getByRole("banner")).toContainText("Casa");
			return page;
		};
		const bia = await join("Bia", await invite("Registrador"));
		const joao = await join("Joao", await invite("Leitor"));

		// Whoever runs the house: the sentence, the menu, and the next week among what falls due.
		await ana.goto("/recorrentes");
		await expect(ana.getByText(/Todo mês o que se repete tira/)).toBeVisible();
		await expect(ana.getByRole("button", { name: "O que fazer com Diarista" })).toBeVisible();
		await go(ana, "Painel");
		await expect(ana.locator("section#vence")).toContainText("Diarista");

		// The logger: the series, and nothing else about it.
		await bia.goto("/recorrentes");
		await expect(bia.getByText("Diarista").first()).toBeVisible();
		await expect(bia.getByText(/Todo mês o que se repete tira/)).toHaveCount(0);
		await expect(bia.getByRole("button", { name: "Nova recorrência" })).toHaveCount(0);
		await expect(bia.getByRole("button", { name: "O que fazer com Diarista" })).toHaveCount(0);
		await go(bia, "Painel");
		await expect(bia.getByRole("heading", { level: 1 })).toBeVisible();
		await expect(bia.locator("section#vence").getByText("Diarista")).toHaveCount(0);
		await bia.goto("/calendario");
		await expect(bia.getByRole("heading", { level: 1 })).toBeVisible();
		await expect(bia.getByText("Diarista")).toHaveCount(0);

		// The viewer: the series and the sentence, and no menu and no button.
		await joao.goto("/recorrentes");
		await expect(joao.getByText(/Todo mês o que se repete tira/)).toBeVisible();
		await expect(joao.getByRole("button", { name: "Nova recorrência" })).toHaveCount(0);
		await expect(joao.getByRole("button", { name: "O que fazer com Diarista" })).toHaveCount(0);
	});

	// Part 1, G.1.2 of the request for 2.0.0: on a server the payment of the month screen lost
	// the invoice it pays, so it paid the oldest invoice still owed. This suite runs on the real
	// day, so the card closes late in the month and its payment falls due early in the next:
	// whatever day it is, the payment of this month's invoice is still to come.
	test("pays this month's invoice from the month screen, on a server", async ({ browser }) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });
		await go(ana, "Contas");
		await ana.getByRole("button", { name: "Nova conta" }).first().click();
		await ana.getByRole("dialog").getByLabel("Nome").fill("Banco");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(ana.getByRole("dialog")).toHaveCount(0);
		await ana.getByRole("button", { name: "Nova conta" }).first().click();
		const card = ana.getByRole("dialog");
		await card.getByLabel("Nome").fill("Cartão");
		await card.getByLabel("Tipo").selectOption("credit");
		await card.getByLabel("Dia do fechamento").selectOption("28");
		await card.getByLabel("Dia do vencimento").selectOption("5");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(card).toHaveCount(0);

		await go(ana, "O mês");
		await ana.getByLabel("Fatura do cartão Cartão").fill("500,00");
		await ana.getByRole("button", { name: "Guardar o mês" }).click();
		await expect(ana.getByText("Está tudo no lugar de sempre")).toBeVisible();

		const month = new Date()
			.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
			.slice(0, 7);
		await ana.goto(`/faturas?mes=${month}`);
		await expect(ana.getByText(/Pagamento agendado para 05\//)).toBeVisible();
	});

	// Part 2, C.14.5 of the request for 2.0.0: splitting an invoice on a server, through the
	// screen. The open invoice, split in three on the day it falls due, which is ahead, so it
	// says the split is agreed for that day.
	test("splits an invoice on the server", async ({ browser }) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });

		await go(ana, "Contas");
		await ana.getByRole("button", { name: "Nova conta" }).first().click();
		const making = ana.getByRole("dialog");
		await making.getByLabel("Nome").fill("Cartao");
		await making.getByLabel("Tipo").selectOption("credit");
		await making.getByLabel("Dia do fechamento").selectOption("3");
		await making.getByLabel("Dia do vencimento").selectOption("10");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(making).toHaveCount(0);

		await go(ana, "Lançamentos");
		await ana.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = ana.getByRole("dialog");
		await form.getByLabel("Pago com").selectOption({ label: "Cartao" });
		await form.getByLabel("Valor", { exact: true }).fill("600,00");
		await form.getByLabel("Descrição").fill("Geladeira");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);

		await go(ana, "Faturas");
		await ana.getByRole("button", { name: "Pagar fatura" }).click();
		const paying = ana.getByRole("dialog");
		await paying.getByText("Parcelando", { exact: true }).click();
		await paying.getByLabel("Parcelas", { exact: true }).selectOption({ label: "3 vezes" });
		await paying.getByRole("button", { name: "Parcelar" }).click();
		await expect(paying).toHaveCount(0);
		await expect(ana.getByText(/Parcelamento combinado para/)).toBeVisible();
	});

	// Part 2, D.3.4.3 and D.4.3 of the request for 2.0.0: on a server the check of the request
	// dropped what it did not know, so "Já paguei 10" wrote the whole plan.
	test("writes a plan from the part after the ones paid, and one off a line, on a server", async ({
		browser,
	}) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });
		await go(ana, "Contas");
		await ana.getByRole("button", { name: "Nova conta" }).first().click();
		const making = ana.getByRole("dialog");
		await making.getByLabel("Nome").fill("Cartao");
		await making.getByLabel("Tipo").selectOption("credit");
		await making.getByLabel("Dia do fechamento").selectOption("3");
		await making.getByLabel("Dia do vencimento").selectOption("10");
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(making).toHaveCount(0);

		await go(ana, "Lançamentos");
		await ana.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = ana.getByRole("dialog");
		await form.getByLabel("Pago com").selectOption({ label: "Cartao" });
		await form.getByLabel("Valor", { exact: true }).fill("2.400,00");
		await form.getByLabel("Descrição").fill("Fogao");
		await form.getByLabel("Parcelas", { exact: true }).selectOption({ label: "48 vezes" });
		await form.getByLabel("Dia").fill("2025-12-28");
		await form.getByLabel("Já paguei").fill("10");
		await expect(form).toContainText(
			"A primeira que fica é a 11/48, em 28/10/2026, na fatura de novembro.",
		);
		await ana.getByRole("button", { name: "Salvar" }).click();
		await expect(form).toHaveCount(0);

		const inMonth = async (value: string) => {
			await go(ana, "Lançamentos");
			await ana.getByLabel("Mês", { exact: true }).fill(value);
		};
		await inMonth("2026-10");
		await expect(ana.getByRole("row").filter({ hasText: "Fogao 11/48" })).toContainText(
			"-R$ 50,00",
		);
		await inMonth("2029-11");
		await expect(ana.getByRole("row").filter({ hasText: "Fogao 48/48" })).toBeVisible();
		await inMonth("2026-09");
		await expect(ana.getByRole("row").filter({ hasText: "Fogao" })).toHaveCount(0);

		await go(ana, "Lançamentos");
		await ana.getByLabel("Lançamento rápido").fill("geladeira 2400 48x cartao");
		await ana.getByRole("button", { name: "Lançar", exact: true }).click();
		await expect(ana.getByText("Lancei geladeira em 48 parcelas.")).toBeVisible();
		await ana.getByRole("button", { name: "Desfazer" }).click();
		await expect(ana.getByText("Lancei geladeira em 48 parcelas.")).toHaveCount(0);
		await inMonth("2030-09");
		await expect(ana.getByRole("row").filter({ hasText: "geladeira" })).toHaveCount(0);
	});
});

// Found while updating the tests for the demonstration of 2.0.0: the form of a new holding chose
// its institution once, as it opened, so a form opened before the accounts arrived chose a new
// account in a space that already had one, and nothing chose again once they came.
test("chooses the investment account that arrives after the form of a holding opened", async ({
	browser,
}) => {
	const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });
	await go(ana, "Contas");
	await ana.getByRole("button", { name: "Nova conta" }).first().click();
	const dialog = ana.getByRole("dialog");
	await dialog.getByLabel("Nome").fill("Corretora");
	await dialog.getByLabel("Tipo").selectOption("investment");
	await ana.getByRole("button", { name: "Salvar" }).click();
	await expect(dialog).toHaveCount(0);

	// The accounts take their time, as they do on a slow connection.
	await ana.route("**/api/spaces/*/accounts*", async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 3000));
		await route.continue();
	});
	await ana.goto("/investimentos");
	await ana.getByRole("button", { name: "Novo investimento" }).click();
	const form = ana.getByRole("dialog");
	await form.getByRole("button", { name: "Caixinha", exact: true }).click();
	await expect(form.getByLabel("Instituição").locator("option:checked")).toHaveText("Corretora", {
		timeout: 15_000,
	});
});

// Found reviewing the pictures of 2.0.0: the month on paper drew its parts as each reading came,
// so before the totals arrived it said R$ 0,00 in, out and left, divided every category by one
// cent ("1000000%"), and "Salvar em PDF" printed that.
test("draws the month on paper only once every reading of it has arrived", async ({ browser }) => {
	const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });
	await go(ana, "Contas");
	await ana.getByRole("button", { name: "Nova conta" }).first().click();
	const dialog = ana.getByRole("dialog");
	await dialog.getByLabel("Nome").fill("Banco");
	await dialog.getByLabel("Saldo de abertura").fill("1.000,00");
	await ana.getByRole("button", { name: "Salvar" }).click();
	await expect(dialog).toHaveCount(0);
	await go(ana, "Lançamentos");
	await ana.getByRole("button", { name: "Novo lançamento" }).first().click();
	const form = ana.getByRole("dialog");
	await form.getByLabel("Pago com").selectOption({ label: "Banco" });
	await form.getByLabel("Valor", { exact: true }).fill("100,00");
	await form.getByLabel("Descrição").fill("Feira");
	await ana.getByRole("button", { name: "Salvar" }).click();
	await expect(form).toHaveCount(0);

	// The totals of the month take their time, as they do on a slow connection.
	await ana.route(
		(url) => url.pathname === "/api/reports" && url.searchParams.get("kind") === "totals",
		async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 4000));
			await route.continue();
		},
	);
	await ana.goto("/relatorio");
	const save = ana.getByRole("button", { name: "Salvar em PDF" });
	await expect(save).toBeDisabled();
	await expect(ana.getByRole("heading", { name: "Por categoria" })).toHaveCount(0);
	await expect(ana.getByRole("cell", { name: /^\d{4,}%$/ })).toHaveCount(0);

	await expect(save).toBeEnabled({ timeout: 15_000 });
	await expect(ana.getByRole("heading", { name: "Por categoria" })).toBeVisible();
	await expect(ana.getByRole("cell", { name: "100%", exact: true })).toBeVisible();
	// A cell at a time: a row's text runs its cells together, "R$ 100,00" and "100%" into "00100%".
	await expect(ana.getByRole("cell", { name: /^\d{4,}%$/ })).toHaveCount(0);
});

// Part 2, K.8.5 of the request for 2.0.0: the version on the screen, the button that asks GitHub
// through the server, and a page that does not write to a server of another major version.
test.describe("the version, and who asks GitHub", () => {
	const ROOT = JSON.parse(
		readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
	) as { version: string };
	const [major = 0] = ROOT.version.split(".").map(Number);
	const mine = `v${ROOT.version}`;
	/** Where the pictures go when the suite runs with SHOTS=1. */
	const SHOTS = fileURLToPath(new URL("../shots/", import.meta.url));

	const answer = (state: "current" | "behind" | "ahead") => ({
		version: mine,
		state,
		// 17:05 in UTC, which is 14:05 where the suite runs.
		checkedAt: Date.UTC(2026, 9, 28, 17, 5),
		latest: {
			version: state === "behind" ? `v${major}.9.0` : mine,
			publishedOn: "2026-11-12",
			notes:
				"## Corrigido\n\n* A fatura de um [cartão](https://evil.example/x) é paga no dia.\n* Outra coisa",
			page: "https://evil.example/page",
		},
		newer:
			state === "behind"
				? [
						{
							version: `v${major}.9.0`,
							publishedOn: "2026-11-12",
							notes:
								"## Corrigido\n\n* A fatura de um [cartão](https://evil.example/x) é paga no dia.\n* Outra coisa",
							page: "https://evil.example/page",
						},
					]
				: [],
	});

	test("asks GitHub nothing by itself, and one tap is one request", async ({ browser }) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });
		const github: string[] = [];
		const checks: string[] = [];
		ana.context().on("request", (request) => {
			if (request.url().includes("api.github.com")) github.push(request.url());
			if (request.url().includes("/api/updates/check")) checks.push(request.method());
		});

		await go(ana, "Dados");
		await expect(ana.getByText(`Cofre Ink ${mine}`, { exact: true })).toBeVisible();
		// What the button does is said before it is pressed.
		await expect(
			ana.getByText(/O servidor pergunta ao GitHub qual é a última versão publicada/),
		).toBeVisible();
		expect(checks).toEqual([]);

		// The server of the suite runs in test mode, where nothing is asked of GitHub and the
		// answer is the failure of a server with no internet.
		await ana.getByRole("button", { name: "Verificar atualização" }).click();
		await expect(
			ana.getByRole("status").filter({ hasText: "O servidor não conseguiu falar com o GitHub" }),
		).toBeVisible();
		expect(checks).toEqual(["POST"]);
		expect(github).toEqual([]);
	});

	test("says each answer where it is announced", async ({ browser }) => {
		const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });
		let reply: { status: number; body: unknown } = { status: 200, body: answer("current") };
		await ana.route("**/api/updates/check", (route) =>
			route.fulfill({
				status: reply.status,
				contentType: "application/json",
				body: JSON.stringify(reply.body),
			}),
		);
		await go(ana, "Dados");
		const check = ana.getByRole("button", { name: "Verificar atualização" });
		const said = (text: string | RegExp) => ana.getByRole("status").filter({ hasText: text });

		await check.click();
		await expect(said("Esta é a última versão publicada. Conferido às 14:05.")).toBeVisible();

		reply = { status: 200, body: answer("ahead") };
		await check.click();
		await expect(
			said("Este servidor está numa versão mais nova que a última publicada."),
		).toBeVisible();

		reply = { status: 502, body: { error: "githubUnreachable" } };
		await check.click();
		await expect(said("O servidor não conseguiu falar com o GitHub")).toBeVisible();

		reply = { status: 200, body: answer("behind") };
		await check.click();
		await expect(
			said(`Saiu a v${major}.9.0 em 12/11. Este servidor está na ${mine}.`),
		).toBeVisible();

		// The notes as text, with no address from them, and the page of the version made from
		// the version and not from what was sent.
		await expect(ana.getByRole("heading", { name: `v${major}.9.0` })).toBeVisible();
		await expect(ana.getByText("A fatura de um cartão é paga no dia.")).toBeVisible();
		await expect(ana.locator('a[href*="evil"]')).toHaveCount(0);
		await expect(ana.getByRole("link", { name: "Ver a página da versão" })).toHaveAttribute(
			"href",
			`https://github.com/AndreiLud/app-cofre-ink/releases/tag/v${major}.9.0`,
		);

		// How to update this one, which runs from the source here: the copy first, outside the
		// clone, and a way to the manual copy of this screen.
		await expect(ana.getByRole("heading", { name: "Como atualizar" })).toBeVisible();
		const first = ana.locator("pre").first();
		// biome-ignore lint/suspicious/noTemplateCurlyInString: it is the shell that reads ${HOME}
		await expect(first).toContainText("${HOME}/cofreBackups");
		await expect(ana.getByRole("link", { name: "Ir à cópia manual" })).toHaveAttribute(
			"href",
			"#copiaManual",
		);
		await ana.getByRole("button", { name: "Copiar" }).first().click();
		await expect(said(/Copiado|Os comandos estão selecionados/)).toBeVisible();
		await expect(
			ana.getByText(/Nunca suba uma versão anterior sobre um banco já migrado/),
		).toBeVisible();
		if (process.env.SHOTS === "1") {
			// From the top, or the header that stays in place is drawn in the middle of the page.
			await ana.evaluate(() => window.scrollTo(0, 0));
			await ana.screenshot({ path: `${SHOTS}versao_como_atualizar.png`, fullPage: true });
			await ana.setViewportSize({ width: 390, height: 844 });
			await ana.screenshot({ path: `${SHOTS}versao_como_atualizar_telefone.png`, fullPage: true });
		}
	});

	for (const [what, version] of [
		["an older major version", `${major - 1}.2.1`],
		["no version at all", undefined],
	] as const) {
		test(`reads a server that says ${what}, and writes nothing to it`, async ({ browser }) => {
			const ana = await arrive(browser, { name: "Ana", email: uniqueEmail("ana") });
			await go(ana, "Contas");
			await ana.getByRole("button", { name: "Nova conta" }).first().click();
			await ana.getByRole("dialog").getByLabel("Nome").fill("Banco");
			await ana.getByRole("button", { name: "Salvar" }).click();
			await expect(ana.getByRole("cell", { name: "Banco" })).toBeVisible();

			await ana.route("**/api/setup", (route) =>
				route.fulfill({
					contentType: "application/json",
					body: JSON.stringify({ needsFirstAccount: false, turnstileSiteKey: null, version }),
				}),
			);
			await ana.reload();
			await expect(
				ana.getByText(
					`O servidor está numa versão anterior à ${major}.0.0 e esta página na ${mine}. Atualize o servidor antes de lançar qualquer coisa; até lá dá para ver, não para gravar.`,
				),
			).toBeVisible();
			if (process.env.SHOTS === "1" && version !== undefined) {
				await ana.screenshot({ path: `${SHOTS}versao_servidor_anterior.png`, fullPage: true });
			}

			const writes: string[] = [];
			ana.context().on("request", (request) => {
				if (request.method() !== "GET" && request.url().includes("/api/")) {
					writes.push(`${request.method()} ${request.url()}`);
				}
			});

			// Reading still works: the account written before is there.
			await go(ana, "Lançamentos");
			await ana.getByRole("button", { name: "Novo lançamento" }).first().click();
			await ana.getByRole("dialog").getByLabel("Valor", { exact: true }).fill("80,00");
			await ana.getByRole("dialog").getByLabel("Descrição").fill("Conta de luz");
			await ana.getByRole("button", { name: "Salvar" }).click();
			await expect(
				ana.getByText(/Nada foi gravado: o servidor está numa outra versão maior/),
			).toBeVisible();
			expect(writes).toEqual([]);
		});
	}
});
