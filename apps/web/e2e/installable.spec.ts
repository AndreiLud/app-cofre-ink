// The part that makes it an application on a phone.
//
// Everything here runs against the build rather than the dev server, because the
// manifest, the icons and the worker only exist in a build. What is checked is what a
// phone checks before it offers to install: a manifest it can read, icons it can
// fetch, and a worker that takes over the page.
//
// And then the thing that matters most on a phone, which is opening it on the
// underground: the connection is cut and the application still opens.

import { expect, test } from "@playwright/test";
import { BUILT_ADDRESS } from "../playwright.config.ts";

type Manifest = {
	name: string;
	display: string;
	start_url: string;
	icons: { src: string; sizes: string; purpose?: string }[];
};

test.describe("the built application", () => {
	test("says what it is, with icons a phone can fetch", async ({ page, request }) => {
		await page.goto(`${BUILT_ADDRESS}/`);

		const link = page.locator('link[rel="manifest"]');
		await expect(link).toHaveAttribute("href", "/manifest.webmanifest");

		const manifest = (await (
			await request.get(`${BUILT_ADDRESS}/manifest.webmanifest`)
		).json()) as Manifest;
		expect(manifest.name).toBe("Cofre");
		expect(manifest.display).toBe("standalone");
		expect(manifest.start_url).toBe("/");

		// One of them has to be maskable, or a launcher crops the mark badly.
		expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);

		for (const icon of manifest.icons) {
			const answer = await request.get(`${BUILT_ADDRESS}${icon.src}`);
			expect(answer.status(), icon.src).toBe(200);
			expect(answer.headers()["content-type"]).toContain("image/png");
		}

		// And the icon is a real image, not a file with the right name.
		const drawn = await page.evaluate(
			(src) =>
				new Promise<{ width: number; height: number }>((resolve, reject) => {
					const image = new Image();
					image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
					image.onerror = () => reject(new Error("the browser could not read the icon"));
					image.src = src;
				}),
			"/icons/icon512.png",
		);
		expect(drawn).toEqual({ width: 512, height: 512 });
	});

	test("takes over the page, and opens again with no connection", async ({ page, context }) => {
		await page.goto(`${BUILT_ADDRESS}/`);

		// The worker registers itself and then claims the page it was registered from.
		await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
			timeout: 20_000,
		});

		// Everything it was told to keep, kept.
		const cached = await page.evaluate(async () => {
			const names = await caches.keys();
			const cache = await caches.open(names[0] ?? "");
			return (await cache.keys()).map((request) => new URL(request.url).pathname);
		});

		expect(cached).toContain("/index.html");
		expect(cached).toContain("/manifest.webmanifest");
		expect(cached.some((path) => path.startsWith("/assets/"))).toBe(true);

		// The underground.
		await context.setOffline(true);
		await page.reload();

		// The first screen of the application, with no network at all.
		await expect(page.getByRole("button", { name: "Usar este dispositivo" })).toBeVisible({
			timeout: 20_000,
		});

		await context.setOffline(false);
	});
});
