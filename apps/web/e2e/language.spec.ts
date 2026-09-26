// Which language the interface opens in, before anybody has pressed anything.
//
// The order itself is a pure function with its own tests in the core package. What is
// proved here is the half that only a browser can prove: the clock it reads, the
// address it reads, the address bar it cleans afterwards, and the choice it keeps.
//
// The front door is where this is asked, because it is the first screen of a browser
// that has never been here and it needs no account, no space and no onboarding.

import { expect, type Page, test } from "@playwright/test";

const IN_PORTUGUESE = "Como você quer usar o Cofre Ink?";
const IN_ENGLISH = "How do you want to use Cofre Ink?";

function frontDoor(page: Page, heading: string) {
	return page.getByRole("heading", { name: heading });
}

function stored(page: Page) {
	return page.evaluate(() => localStorage.getItem("cofreLanguage"));
}

test.describe("a device somewhere other than Brazil", () => {
	test.use({ timezoneId: "America/New_York" });

	test("opens in English without being asked", async ({ page }) => {
		await page.goto("/");

		await expect(frontDoor(page, IN_ENGLISH)).toBeVisible({ timeout: 20_000 });
		await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
	});

	// The clock decides the first screen and nothing else. Writing it down would mean
	// somebody who travels comes back to an interface that translated itself.
	test("does not write that down as a choice", async ({ page }) => {
		await page.goto("/");
		await expect(frontDoor(page, IN_ENGLISH)).toBeVisible({ timeout: 20_000 });

		expect(await stored(page)).toBeNull();
	});

	test("takes Portuguese from the address, over the clock", async ({ page }) => {
		await page.goto("/?lang=pt");

		await expect(frontDoor(page, IN_PORTUGUESE)).toBeVisible({ timeout: 20_000 });
		await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
	});
});

test.describe("a device in Brazil", () => {
	test("opens in Portuguese", async ({ page }) => {
		await page.goto("/");

		await expect(frontDoor(page, IN_PORTUGUESE)).toBeVisible({ timeout: 20_000 });
		await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
	});

	test("takes English from the address, over the clock", async ({ page }) => {
		await page.goto("/?lang=en");

		await expect(frontDoor(page, IN_ENGLISH)).toBeVisible({ timeout: 20_000 });
		await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
	});

	test("ignores an address that says something else", async ({ page }) => {
		await page.goto("/?lang=es");

		await expect(frontDoor(page, IN_PORTUGUESE)).toBeVisible({ timeout: 20_000 });
		expect(await stored(page)).toBeNull();
	});
});

test.describe("the parameter the site sends", () => {
	test("is written down as a choice and survives a reload", async ({ page }) => {
		await page.goto("/?lang=en");
		await expect(frontDoor(page, IN_ENGLISH)).toBeVisible({ timeout: 20_000 });

		expect(await stored(page)).toBe("en");

		// Without the parameter this time, and in a Brazilian zone, so only the choice
		// that was kept can be what answers.
		await page.goto("/");
		await expect(frontDoor(page, IN_ENGLISH)).toBeVisible({ timeout: 20_000 });
	});

	test("is taken back out of the address bar, and takes nothing else with it", async ({ page }) => {
		// A link copied out of the application would otherwise carry a language with it,
		// handed to whoever it was sent to.
		await page.goto("/?lang=en&convite=abc123#topo");
		await expect(frontDoor(page, IN_ENGLISH)).toBeVisible({ timeout: 20_000 });

		const address = new URL(page.url());
		expect(address.searchParams.get("lang")).toBeNull();
		expect(address.searchParams.get("convite")).toBe("abc123");
		expect(address.hash).toBe("#topo");
	});

	test("leaves no query behind when it was the only thing in it", async ({ page }) => {
		await page.goto("/?lang=en");
		await expect(frontDoor(page, IN_ENGLISH)).toBeVisible({ timeout: 20_000 });

		expect(new URL(page.url()).search).toBe("");
	});
});
