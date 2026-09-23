// The page that leaves the screen.
//
// A reader has a button that prints, and the palette it prints with was written for a
// screen. In the dark theme that palette is cream on near black, which is not a thing
// paper can be: a printer leaves the page white and lays down what the text is coloured.
//
// What is checked here is the palette itself and not what the browser finally puts on
// the page. Chromium normalises both while it is emulating print, so the colour that
// comes back from the body says the same thing whether or not this application has a
// print stylesheet at all: it is the engine talking, not the product. The custom
// properties are the product talking, and they are read directly.

import { expect, test } from "@playwright/test";
import { openCofre } from "./support.ts";

/** What the palette is set to right now, as the page itself sees it. */
async function palette(page: import("@playwright/test").Page) {
	return page.evaluate(() => {
		const style = getComputedStyle(document.documentElement);
		const read = (name: string) => style.getPropertyValue(name).trim();
		return {
			canvas: read("--canvas"),
			panel: read("--panel"),
			ink: read("--ink"),
			grain: read("--grain"),
		};
	});
}

test.describe("on paper", () => {
	test("turns the palette into paper terms, from either theme", async ({ page }) => {
		await openCofre(page, { demo: false });

		for (const theme of ["dark", "light"]) {
			await page.evaluate((chosen) => {
				document.documentElement.setAttribute("data-theme", chosen);
			}, theme);

			await page.emulateMedia({ media: "print" });
			const printed = await palette(page);
			await page.emulateMedia({ media: "screen" });

			// One surface, because a printer has no ink to spend saying that a panel sits
			// on a page. In the dark theme these are near black without this, which is
			// the whole of what was wrong.
			expect(
				{ canvas: printed.canvas, panel: printed.panel, grain: printed.grain },
				`from the ${theme} theme`,
			).toEqual({ canvas: "#ffffff", panel: "#ffffff", grain: "none" });

			// Dark, and not the exact shade: the engine rounds a near black to black
			// while it prints, which is the direction this was going anyway.
			const [red = 255] = (printed.ink.match(/\w\w/g) ?? []).map((pair) =>
				Number.parseInt(pair, 16),
			);
			expect(red, `ink, from the ${theme} theme`).toBeLessThan(60);
		}
	});

	test("keeps the grain on the screen and the dark theme without it", async ({ page }) => {
		await openCofre(page, { demo: false });

		// Paper on a screen is a surface and not a flat fill, which is what the grain is.
		await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
		await expect.poll(async () => (await palette(page)).grain).toContain("data:image/svg+xml");

		// A lit screen is not paper. Grain on near black is a fault in the panel.
		await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
		await expect.poll(async () => (await palette(page)).grain).toBe("none");
	});
});
