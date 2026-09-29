// Pictures of a screen, for a review. Temporary, alongside the proposal screen.
//
// Four cells per proposal: two widths by two themes. The theme is forced through the
// same key the switch writes, before the page loads, because "system" deletes the
// attribute and would leave the machine running the test deciding what the picture is.
// The door is walked once per picture pair, at the wide size, and the width is changed
// afterwards, so the narrow picture is of the screen and not of the door.

import { expect, test } from "@playwright/test";
import { openCofre } from "./support.ts";

const WIDTHS = [
	{ name: "largo", width: 1280, height: 1400 },
	{ name: "telefone", width: 390, height: 1600 },
];

const THEMES = ["light", "dark"] as const;

test.describe("proposals", () => {
	test.setTimeout(180_000);

	for (const proposal of ["1", "2", "3"]) {
		for (const theme of THEMES) {
			test(`proposta ${proposal} ${theme}`, async ({ page }) => {
				await page.addInitScript((value) => {
					window.localStorage.setItem("cofreTheme", value);
				}, theme);

				await openCofre(page);

				for (const size of WIDTHS) {
					await page.setViewportSize({ width: size.width, height: size.height });
					await page.goto(`/proposta?v=${proposal}`);
					await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Você tem isto/);
					// The fonts and the panel gradient settle a frame after the heading does.
					await page.waitForTimeout(500);
					await page.screenshot({
						path: `shots/proposta${proposal}_${size.name}_${theme}.png`,
						fullPage: true,
					});
				}
			});
		}
	}
});
