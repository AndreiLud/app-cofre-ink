// Pictures of the screens, for a review before they are shown to anybody.
//
// Four cells per screen: two widths by two themes. The theme is forced through the same
// key the switch writes, before the page loads, because "system" deletes the attribute
// and would leave the machine running the test deciding what the picture is. The door is
// walked once per pair, at the wide size, and the width is changed afterwards, so the
// narrow picture is of the screen and not of the door.
//
// It is skipped by default: it writes files rather than asserting anything, and it is run
// on purpose with SHOTS=1 when the screens have changed. The comment here used to say
// `--grep shots`, which on its own still skips every case.

import { fileURLToPath } from "node:url";
import { buildPdf, drawLines } from "@cofre/importers";
import { expect, type Page, test } from "@playwright/test";
import { fourCards, go, openCofre } from "./support.ts";

/**
 * Where the pictures go: apps/web/shots, worked out from this file.
 *
 * The paths were relative, so they landed beside whatever folder the camera was started
 * from, and a run from the root of the clone wrote a second shots folder there.
 */
const SHOTS = fileURLToPath(new URL("../shots/", import.meta.url));

// Outside the skip below, so it runs every time: the folder is what keeps the pictures out of
// the repository, and a path that wanders is a picture that could be committed.
test("writes the pictures into apps/web/shots", () => {
	expect(SHOTS.replace(/\\/g, "/")).toMatch(/\/apps\/web\/shots\/$/);
});

const WIDTHS = [
	{ name: "largo", width: 1280, height: 1400 },
	{ name: "telefone", width: 390, height: 1600 },
];

const THEMES = ["light", "dark"] as const;

/**
 * Each screen, by how the navigation reaches it, and what has to be on it first.
 *
 * A screen reached by an address rather than by the navigation says so instead: the file
 * of the whole month is a page nothing links to from the shell, and it is one of the
 * things this release added.
 */
const SCREENS: { name: string; section?: string; at?: string; waitFor: string }[] = [
	{ name: "painel", section: "Painel", waitFor: "Você tem" },
	{ name: "faturas", section: "Faturas", waitFor: "fatura" },
	{ name: "contas", section: "Contas", waitFor: "Conta" },
	{ name: "lancamentos", section: "Lançamentos", waitFor: "Novo lançamento" },
	{ name: "mes", at: "/mes", waitFor: "Comparado com um mês comum" },
	{ name: "relatorio", at: "/relatorio?mes=2026-10", waitFor: "O mês" },
	{ name: "investimentos", at: "/investimentos", waitFor: "Comparado com o CDI" },
];

test.describe("shots", () => {
	test.skip(process.env.SHOTS !== "1", "Run with SHOTS=1 when the screens have changed.");
	test.setTimeout(180_000);

	for (const screen of SCREENS) {
		for (const theme of THEMES) {
			test(`${screen.name} ${theme}`, async ({ page }) => {
				await page.addInitScript((value) => {
					window.localStorage.setItem("cofreTheme", value);
				}, theme);

				await openCofre(page);
				if (screen.at) await page.goto(screen.at);
				else if (screen.section) await go(page, screen.section);
				await expect(page.getByText(screen.waitFor).first()).toBeVisible();

				for (const size of WIDTHS) {
					await page.setViewportSize({ width: size.width, height: size.height });
					// The fonts and the panel gradient settle a frame after the layout does.
					await page.waitForTimeout(500);
					await page.screenshot({
						path: `${SHOTS}${screen.name}_${size.name}_${theme}.png`,
						fullPage: true,
					});
				}
			});
		}
	}

	/**
	 * The file itself, and not a picture of the page that makes it.
	 *
	 * The month on paper is a page the browser saves as a PDF, so what somebody ends up with
	 * is the print stylesheet applied by the browser and not the screen. Two of them, because
	 * the two cases differ: the month somebody is living in is read today, and a month already
	 * over is read as it stood on its last day.
	 */
	// The month the fixed day falls in, October, and one already over. "atual" was September,
	// which on the twenty eighth of October is a month that has gone, so the two pictures were
	// of the same case.
	for (const month of [
		{ name: "atual", at: "/relatorio?mes=2026-10", waitFor: "O mês" },
		{ name: "passado", at: "/relatorio?mes=2026-09", waitFor: "O mês" },
		// The same file in the other language, because a document is the one thing here
		// somebody hands to another person, and the address is what decides which language
		// opens, which is the first of the four answers in registry 0034.
		{ name: "english", at: "/relatorio?mes=2026-10&lang=en", waitFor: "The month" },
		{ name: "english_passado", at: "/relatorio?mes=2026-09&lang=en", waitFor: "The month" },
	]) {
		test(`relatorio pdf ${month.name}`, async ({ page }) => {
			await openCofre(page);
			await page.goto(month.at);
			await expect(page.getByText(month.waitFor).first()).toBeVisible();
			// Let the charts finish drawing themselves, because a PDF is one frame.
			await page.waitForTimeout(1500);

			await page.pdf({
				path: `${SHOTS}cofre_relatorio_${month.name}.pdf`,
				format: "A4",
				printBackground: true,
				margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
			});

			// And a picture of what the file holds, because a PDF cannot be looked at the way
			// a picture can and the print stylesheet is the whole difference between the two:
			// the navigation, the buttons and the line telling somebody how to save it are all
			// meant to be gone by now.
			await page.emulateMedia({ media: "print" });
			await page.screenshot({
				path: `${SHOTS}relatorio_impresso_${month.name}.png`,
				fullPage: true,
			});
		});
	}

	/**
	 * The four screens that only exist once somebody has done something.
	 *
	 * A picture of an invoice says little until part of it has been paid, and a picture of a
	 * form says nothing until it is open. These walk the flow and then take the picture, so
	 * what is reviewed is the screen somebody actually reaches rather than the screen as it
	 * sits before anybody touches it.
	 */
	test("a fatura com um pagamento parcial", async ({ page }) => {
		await openCofre(page);
		await go(page, "Faturas");
		await expect(page.getByRole("button", { name: "Pagar fatura" })).toBeVisible();

		await page.getByRole("button", { name: "Pagar fatura" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		await page.screenshot({ path: `${SHOTS}fatura_pagar_dialogo.png`, fullPage: true });

		// Part of it, which is the whole reason the amount is a field and not a sentence.
		await dialog.getByLabel("Valor", { exact: true }).fill("100,00");
		await dialog.getByRole("button", { name: "Pagar" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(0);

		await expect(page.getByText("Paga em parte")).toBeVisible();
		await page.screenshot({ path: `${SHOTS}fatura_paga_em_parte.png`, fullPage: true });
	});

	test("a fatura com uma compra movida", async ({ page }) => {
		await openCofre(page);
		await go(page, "Faturas");

		// The menu of one purchase, which is where a purchase the bank filed a day either
		// side of the closing day is put right.
		// A purchase that is not part of an instalment plan, so the picture shows one
		// purchase moving and not four.
		const row = page.getByRole("row").filter({ hasText: "Cinema" }).first();
		await expect(row).toBeVisible();
		await row.getByRole("button", { name: "Ações do lançamento" }).click();
		await page.screenshot({ path: `${SHOTS}fatura_mover_menu.png`, fullPage: true });

		await page.getByRole("menuitem", { name: "Mover para a próxima fatura" }).click();
		await expect(page.getByRole("menu")).toHaveCount(0);
		// Once the purchase has left this invoice. The picture used to be taken as the menu
		// closed, and showed the purchase still on it with the old total.
		await expect(page.getByRole("row").filter({ hasText: "Cinema" })).toHaveCount(0);
		await page.screenshot({ path: `${SHOTS}fatura_compra_movida.png`, fullPage: true });
	});

	test("o formulário de lançamento", async ({ page }) => {
		await openCofre(page);
		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();

		const dialog = page.getByRole("dialog");
		await expect(dialog.getByLabel("Pago com")).toBeVisible();
		// On a card, because that is when the form says which invoice the purchase lands on.
		await dialog.getByLabel("Pago com").selectOption({ index: 0 });
		await dialog.getByLabel("Valor", { exact: true }).fill("99,90");
		await dialog.getByLabel("Descrição").fill("Compra no cartão");
		await page.screenshot({ path: `${SHOTS}lancamento_formulario.png`, fullPage: true });

		await dialog.getByText("Mais detalhes").click();
		// The dialog scrolls inside itself, so a picture of the whole page is still of its top:
		// the fields it was taken for are brought into view first.
		const notes = dialog.getByLabel("Observação");
		await expect(notes).toBeVisible();
		await notes.scrollIntoViewIfNeeded();
		await page.screenshot({ path: `${SHOTS}lancamento_mais_detalhes.png`, fullPage: true });
	});

	// The two steps of a new holding, and the menu of one with what it opens, because each of
	// them is a screen only once somebody has pressed something.
	test("uma aplicação nova, e o que se faz com ela", async ({ page }) => {
		await openCofre(page);
		await page.goto("/investimentos");
		await page.getByRole("button", { name: "Novo investimento" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog.getByRole("button", { name: "Caixinha" })).toBeVisible();
		await page.screenshot({ path: `${SHOTS}investimento_o_que_e.png`, fullPage: true });

		await dialog.getByRole("button", { name: "Caixinha" }).click();
		await dialog.getByLabel("Nome", { exact: true }).fill("Reserva");
		await dialog.getByLabel("Quanto colocou").fill("10000,00");
		await dialog.getByLabel("Quando colocou").fill("2026-09-28");
		await page.screenshot({ path: `${SHOTS}investimento_caixinha.png`, fullPage: true });
		await page.getByRole("button", { name: "Salvar" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(0);

		const row = page.getByRole("row").filter({ hasText: "Reserva" }).first();
		await row.getByRole("button", { name: "O que fazer com Reserva" }).click();
		await page.screenshot({ path: `${SHOTS}investimento_menu.png`, fullPage: true });
		await page.getByRole("menuitem", { name: "Resgatar" }).click();
		await page.getByRole("dialog").getByLabel("Quanto saiu da aplicação").fill("2000,00");
		await page.screenshot({ path: `${SHOTS}investimento_resgatar.png`, fullPage: true });
		await page.keyboard.press("Escape");

		await page.setViewportSize({ width: 1280, height: 1400 });
		await page.screenshot({ path: `${SHOTS}investimentos_com_caixinha.png`, fullPage: true });
	});

	test("editar uma conta", async ({ page }) => {
		await openCofre(page);
		await go(page, "Contas");

		// "Editar conta" by its whole name. The same menu also carries "Editar cartão" for
		// each piece of plastic that reaches the account, and asking for "Editar" took
		// whichever came first, which was the card.
		const row = page.getByRole("row").filter({ hasText: "Cartão de crédito" }).first();
		await row.getByRole("button", { name: "Ações da conta" }).click();
		await page.getByRole("menuitem", { name: "Editar conta", exact: true }).click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.screenshot({ path: `${SHOTS}conta_editar_cartao.png`, fullPage: true });

		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toHaveCount(0);

		// And a voucher, because the quota is the field this release added.
		const voucher = page.getByRole("row").filter({ hasText: "Vale refeição" }).first();
		await voucher.getByRole("button", { name: "Ações da conta" }).click();
		await page.getByRole("menuitem", { name: "Editar conta", exact: true }).click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.screenshot({ path: `${SHOTS}conta_editar_vale.png`, fullPage: true });
	});
	/**
	 * What the report of 2.0.0 asks to be seen, part 2, B.10.4 and item 13 of "No fim": the
	 * overview with one card and with four and a meal card, the invoice in each state it can
	 * be in, the forms, the list by month and by year, the series, the reader, every product
	 * of the holdings, the planning section and the version under the danger zone.
	 */
	const both = async (page: Page, name: string) => {
		for (const size of WIDTHS) {
			await page.setViewportSize({ width: size.width, height: size.height });
			await page.waitForTimeout(500);
			await page.screenshot({ path: `${SHOTS}${name}_${size.name}.png`, fullPage: true });
		}
		await page.setViewportSize({ width: 1280, height: 1400 });
	};

	for (const theme of THEMES) {
		test(`painel com um cartao ${theme}`, async ({ page }) => {
			await page.addInitScript((value) => {
				window.localStorage.setItem("cofreTheme", value);
			}, theme);
			await openCofre(page, { demo: false });
			await go(page, "Contas");
			for (const [name, kind] of [
				["Banco", "checking"],
				["Cartão", "credit"],
			] as const) {
				await page.getByRole("button", { name: "Nova conta" }).first().click();
				const dialog = page.getByRole("dialog");
				await dialog.getByLabel("Nome").fill(name);
				if (kind === "credit") {
					await dialog.getByLabel("Tipo").selectOption("credit");
					await dialog.getByLabel("Dia do fechamento").selectOption("3");
					await dialog.getByLabel("Dia do vencimento").selectOption("10");
				} else {
					await dialog.getByLabel("Saldo de abertura").fill("3.000,00");
				}
				await page.getByRole("button", { name: "Salvar" }).click();
				await expect(dialog).toHaveCount(0);
			}
			await go(page, "Lançamentos");
			await page.getByRole("button", { name: "Novo lançamento" }).first().click();
			const form = page.getByRole("dialog");
			await form.getByLabel("Pago com").selectOption({ label: "Cartão" });
			await form.getByLabel("Valor", { exact: true }).fill("250,00");
			await form.getByLabel("Descrição").fill("Mercado");
			await page.getByRole("button", { name: "Salvar" }).click();
			await expect(form).toHaveCount(0);
			await go(page, "Painel");
			await expect(page.getByText("Você tem").first()).toBeVisible();
			await both(page, `painel_um_cartao_${theme}`);
		});

		test(`painel com quatro cartoes e um vale ${theme}`, async ({ page }) => {
			await page.addInitScript((value) => {
				window.localStorage.setItem("cofreTheme", value);
			}, theme);
			await fourCards(page);
			await go(page, "Painel");
			await expect(page.getByText("4 cartões").first()).toBeVisible();
			await both(page, `painel_quatro_cartoes_${theme}`);
		});
	}

	test("faturas em cada estado", async ({ page }) => {
		await fourCards(page);
		const card = async (name: string, earlier = false) => {
			await go(page, "Faturas");
			await page
				.getByRole("group", { name: "Cartão" })
				.getByText(new RegExp(`^${name}`))
				.click();
			await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
			if (earlier) {
				await page.getByRole("button", { name: "Fatura anterior", exact: true }).click();
				await expect(page.getByRole("heading", { level: 1 })).toContainText("outubro");
			}
		};

		// With the switch between cards and the column of the card that bought each purchase.
		await card("Nubank");
		await page.screenshot({ path: `${SHOTS}faturas_troca_de_cartao.png`, fullPage: true });

		// Scheduled: Itaú closed at 900 and falls due on the fifth, paid ahead for that day.
		await card("Itaú", true);
		await page.getByRole("button", { name: "Pagar fatura" }).click();
		const paying = page.getByRole("dialog");
		await paying.getByLabel("Dia", { exact: true }).fill("2026-11-05");
		await paying.getByRole("button", { name: "Pagar" }).click();
		await expect(paying).toHaveCount(0);
		await expect(page.getByText(/agendad/i).first()).toBeVisible();
		await page.screenshot({ path: `${SHOTS}fatura_agendada.png`, fullPage: true });

		// Paid with another card, in three.
		await card("Nubank", true);
		await page.getByRole("button", { name: "Pagar fatura" }).click();
		const byCard = page.getByRole("dialog");
		await byCard.getByText("Com outro cartão de crédito", { exact: true }).click();
		await byCard.getByLabel("Cartão que paga").selectOption({ label: "C6" });
		await byCard.getByLabel("Parcelas", { exact: true }).selectOption({ label: "3 vezes" });
		await byCard.getByLabel("Quanto o outro cartão cobra").fill("330,00");
		await page.screenshot({ path: `${SHOTS}fatura_com_outro_cartao_dialogo.png`, fullPage: true });
		await byCard.getByRole("button", { name: "Pagar com o cartão" }).click();
		await expect(byCard).toHaveCount(0);
		await expect(page.locator("section").filter({ hasText: "Como foi paga" })).toBeVisible();
		// Once the switch has read that the card is no longer late.
		await expect(
			page.getByRole("group", { name: "Cartão" }).getByText("Nubank", { exact: true }),
		).toBeVisible();
		await page.screenshot({ path: `${SHOTS}fatura_paga_com_outro_cartao.png`, fullPage: true });
	});

	test("fatura parcelada", async ({ page }) => {
		await fourCards(page);
		await go(page, "Faturas");
		await page.getByRole("group", { name: "Cartão" }).getByText("Itaú", { exact: true }).click();
		await page.getByRole("button", { name: "Fatura anterior", exact: true }).click();
		await page.getByRole("button", { name: "Pagar fatura" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByText("Parcelando", { exact: true }).click();
		await dialog.getByLabel("Entrada", { exact: true }).fill("300,00");
		await dialog.getByLabel("Parcelas", { exact: true }).selectOption({ label: "6 vezes" });
		await dialog.getByText("O valor é de cada parcela", { exact: true }).click();
		await dialog.getByLabel("Valor das parcelas").fill("110,00");
		await dialog.getByLabel("Dia do acordo").fill("2026-10-28");
		await page.screenshot({ path: `${SHOTS}fatura_parcelar_dialogo.png`, fullPage: true });
		await dialog.getByRole("button", { name: "Parcelar" }).click();
		await expect(dialog).toHaveCount(0);
		await expect(page.getByRole("heading", { level: 1 })).toContainText("foi parcelada");
		await page.screenshot({ path: `${SHOTS}fatura_parcelada.png`, fullPage: true });
	});

	// A day between the closing and the due day of the demonstration's first card, which closes
	// on the third and falls due on the tenth.
	test("fatura entre o fechamento e o vencimento", async ({ page }) => {
		await openCofre(page);
		await page.clock.setFixedTime(new Date("2026-11-05T12:00:00-03:00"));
		await page.goto("/faturas");
		await expect(page.getByRole("heading", { level: 1 })).toContainText("Cartão de crédito");
		// The invoice that closed on the third, one before the open one the screen opens on.
		await page.getByRole("button", { name: "Fatura anterior", exact: true }).click();
		await expect(page.getByRole("heading", { level: 1 })).toContainText("novembro");
		await page.screenshot({
			path: `${SHOTS}fatura_fechada_antes_do_vencimento.png`,
			fullPage: true,
		});
	});

	test("os formularios, mover e a lista", async ({ page }) => {
		await openCofre(page);
		await go(page, "Lançamentos");
		await page.getByRole("button", { name: "Novo lançamento" }).first().click();
		const form = page.getByRole("dialog");
		await form.getByText("Entrada", { exact: true }).click();
		await form.getByLabel("Valor", { exact: true }).fill("6.120,00");
		await form.getByLabel("Descrição").fill("Salário");
		await page.screenshot({ path: `${SHOTS}lancamento_entrada.png`, fullPage: true });
		await page.keyboard.press("Escape");
		await expect(form).toHaveCount(0);

		await go(page, "Contas");
		await page.getByRole("button", { name: "Mover entre contas" }).first().click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.screenshot({ path: `${SHOTS}mover_entre_contas.png`, fullPage: true });
		await page.keyboard.press("Escape");

		await page.goto("/lancamentos?ano=2026");
		await expect(page.getByRole("heading", { level: 1 })).toContainText("2026");
		await both(page, "lista_do_ano");

		await page.goto("/recorrentes");
		await expect(page.getByText("Streaming").first()).toBeVisible();
		await both(page, "recorrentes");

		await page.goto("/relatorios");
		await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible();
		await both(page, "planejamento_relatorios");

		// The version, under the danger zone, which in the browser is the line and nothing else.
		await go(page, "Dados");
		await page.getByText(/^Cofre Ink v/).scrollIntoViewIfNeeded();
		await page.screenshot({ path: `${SHOTS}versao_no_navegador.png`, fullPage: true });
	});

	test("o leitor com uma fatura e com um extrato", async ({ page }) => {
		await openCofre(page);
		const read = async (name: string, lines: readonly string[], says: string) => {
			await go(page, "Dados");
			await page.getByRole("button", { name: "Abrir a importação" }).click();
			await page.getByLabel("Arquivo do banco").setInputFiles({
				name,
				mimeType: "application/pdf",
				buffer: Buffer.from(buildPdf({ content: drawLines(lines), compress: true })),
			});
			await expect(page.getByText(says)).toBeVisible();
		};
		await read(
			"fatura.pdf",
			[
				"Fatura do cartao final 4417",
				"Vencimento: 10/11/2026",
				"Total desta fatura R$ 263,40",
				"05/10/2026 Padaria 50,00",
				"12/10/2026 Loja de roupas 03/06 89,90",
				"13/10/2026 Mercado 123,50",
			],
			"Isto parece uma fatura de cartão",
		);
		await page.screenshot({ path: `${SHOTS}leitor_fatura.png`, fullPage: true });
		await read(
			"extrato.pdf",
			[
				"Banco Exemplo",
				"Extrato de conta corrente",
				"Agencia 0001 Conta 12345-6",
				"01/10/2026 Saldo anterior 5.000,00",
				"03/10/2026 PIX RECEBIDO 200,00 5.200,00",
				"10/10/2026 PAG FATURA CARTAO 433,40 4.766,60",
			],
			"Isto parece um extrato",
		);
		await page.screenshot({ path: `${SHOTS}leitor_extrato.png`, fullPage: true });
	});

	test("o formulario de cada produto", async ({ page }) => {
		await openCofre(page);
		await page.goto("/investimentos");
		for (const [id, label] of [
			["caixinha", "Caixinha"],
			["saldo_na_conta", "Saldo na conta"],
			["poupanca", "Poupança"],
			["cdb", "CDB ou RDB"],
			["lci", "LCI"],
			["lca", "LCA"],
			["tesouro_selic", "Tesouro Selic"],
			["tesouro_ipca", "Tesouro IPCA+"],
			["tesouro_prefixado", "Tesouro Prefixado"],
			["acao", "Ação"],
			["fii", "FII"],
			["etf", "ETF"],
			["bdr", "BDR"],
			["fundo", "Fundo"],
			["cripto", "Cripto"],
			["previdencia", "Previdência"],
			["outro", "Outro"],
		] as const) {
			await page.getByRole("button", { name: "Novo investimento" }).click();
			const dialog = page.getByRole("dialog");
			await dialog.getByRole("button", { name: label, exact: true }).click();
			await expect(dialog.getByRole("button", { name: "Salvar" })).toBeVisible();
			await page.screenshot({ path: `${SHOTS}investimento_form_${id}.png`, fullPage: true });
			await page.keyboard.press("Escape");
			await expect(dialog).toHaveCount(0);
		}
	});
});
