// Pictures of the screens, for a review before they are shown to anybody.
//
// Four cells per screen: two widths by two themes. The theme is forced through the same
// key the switch writes, before the page loads, because "system" deletes the attribute
// and would leave the machine running the test deciding what the picture is. The door is
// walked once per pair, at the wide size, and the width is changed afterwards, so the
// narrow picture is of the screen and not of the door.
//
// It is skipped by default: it writes files rather than asserting anything, and it is run
// on purpose with `--grep shots` when the screens have changed.

import { expect, test } from "@playwright/test";
import { go, openCofre } from "./support.ts";

const WIDTHS = [
	{ name: "largo", width: 1280, height: 1400 },
	{ name: "telefone", width: 390, height: 1600 },
];

const THEMES = ["light", "dark"] as const;

/** Each screen, by how the navigation reaches it, and what has to be on it first. */
const SCREENS = [
	{ name: "painel", section: "Painel", waitFor: "Você tem" },
	{ name: "faturas", section: "Faturas", waitFor: "fatura" },
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
				await go(page, screen.section);
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
});
