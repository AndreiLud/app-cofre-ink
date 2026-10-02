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

import { expect, test } from "@playwright/test";
import { go, openCofre } from "./support.ts";

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
	{ name: "relatorio", at: "/relatorio?mes=2026-09", waitFor: "O mês" },
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
						path: `shots/${screen.name}_${size.name}_${theme}.png`,
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
	for (const month of [
		{ name: "atual", at: "/relatorio?mes=2026-09", waitFor: "O mês" },
		{ name: "passado", at: "/relatorio?mes=2026-08", waitFor: "O mês" },
		// The same file in the other language, because a document is the one thing here
		// somebody hands to another person, and the address is what decides which language
		// opens, which is the first of the four answers in registry 0034.
		{ name: "english", at: "/relatorio?mes=2026-09&lang=en", waitFor: "The month" },
	]) {
		test(`relatorio pdf ${month.name}`, async ({ page }) => {
			await openCofre(page);
			await page.goto(month.at);
			await expect(page.getByText(month.waitFor).first()).toBeVisible();
			// Let the charts finish drawing themselves, because a PDF is one frame.
			await page.waitForTimeout(1500);

			await page.pdf({
				path: `shots/cofre_relatorio_${month.name}.pdf`,
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
				path: `shots/relatorio_impresso_${month.name}.png`,
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
		await page.screenshot({ path: "shots/fatura_pagar_dialogo.png", fullPage: true });

		// Part of it, which is the whole reason the amount is a field and not a sentence.
		await dialog.getByLabel("Valor", { exact: true }).fill("100,00");
		await dialog.getByRole("button", { name: "Pagar" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(0);

		await expect(page.getByText("Paga em parte")).toBeVisible();
		await page.screenshot({ path: "shots/fatura_paga_em_parte.png", fullPage: true });
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
		await page.screenshot({ path: "shots/fatura_mover_menu.png", fullPage: true });

		await page.getByRole("menuitem", { name: "Mover para a próxima fatura" }).click();
		await expect(page.getByRole("menu")).toHaveCount(0);
		await page.screenshot({ path: "shots/fatura_compra_movida.png", fullPage: true });
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
		await page.screenshot({ path: "shots/lancamento_formulario.png", fullPage: true });

		await dialog.getByText("Mais detalhes").click();
		await page.screenshot({ path: "shots/lancamento_mais_detalhes.png", fullPage: true });
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
		await page.screenshot({ path: "shots/conta_editar_cartao.png", fullPage: true });

		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toHaveCount(0);

		// And a voucher, because the quota is the field this release added.
		const voucher = page.getByRole("row").filter({ hasText: "Vale refeição" }).first();
		await voucher.getByRole("button", { name: "Ações da conta" }).click();
		await page.getByRole("menuitem", { name: "Editar conta", exact: true }).click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.screenshot({ path: "shots/conta_editar_vale.png", fullPage: true });
	});
});
