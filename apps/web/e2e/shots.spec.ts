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
		{ name: "atual", at: "/relatorio?mes=2026-09" },
		{ name: "passado", at: "/relatorio?mes=2026-08" },
	]) {
		test(`relatorio pdf ${month.name}`, async ({ page }) => {
			await openCofre(page);
			await page.goto(month.at);
			await expect(page.getByText("O mês").first()).toBeVisible();
			// Let the charts finish drawing themselves, because a PDF is one frame.
			await page.waitForTimeout(1500);

			await page.pdf({
				path: `shots/cofre_relatorio_${month.name}.pdf`,
				format: "A4",
				printBackground: true,
				margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
			});
		});
	}
});
