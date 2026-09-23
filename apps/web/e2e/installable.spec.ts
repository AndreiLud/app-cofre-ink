// The part that makes it an application on a phone.
//
// Everything here runs against the build rather than the dev server, because the
// manifest, the icons and the worker only exist in a build. What is checked is what a
// phone checks before it offers to install: a manifest it can read, icons it can
// fetch, and a worker that takes over the page.
//
// And then the thing that matters most on a phone, which is opening it on the
// underground: the connection is cut and the application still opens.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { BUILT_ADDRESS } from "../playwright.config.ts";

/** The folder the preview server above is serving, for the checks about the build. */
const BUILT_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

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

		const where = `${BUILT_ADDRESS}/manifest.webmanifest`;
		const manifest = (await (await request.get(where)).json()) as Manifest;
		expect(manifest.name).toBe("Cofre Ink");
		expect(manifest.display).toBe("standalone");
		// Written against the manifest itself, so the same build works at the root of a
		// domain and inside a folder of one.
		expect(manifest.start_url).toBe(".");

		// One of them has to be maskable, or a launcher crops the mark badly.
		expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);

		for (const icon of manifest.icons) {
			const answer = await request.get(new URL(icon.src, where).href);
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

	test("carries the page a static host sends when it finds nothing", async ({ request }) => {
		// A host that only knows about files is asked for /importar and finds nothing.
		// This is what it sends instead, and it is the application, so the router reads
		// the address and the person lands where they meant to.
		const fallback = await request.get(`${BUILT_ADDRESS}/404.html`);
		expect(fallback.status()).toBe(200);
		expect(await fallback.text()).toContain('id="root"');
	});

	test("does not write a redirects file, which Cloudflare refuses", () => {
		// It used to. The one rule in it said that every address is the page, which is
		// what the Workers configuration already says, and Cloudflare reads the pair as
		// a loop and rejects the whole deploy, after uploading every file. Anybody
		// publishing to Netlify adds the line themselves, and the guide has it.
		//
		// Asked of the folder rather than of the preview server, because that server
		// answers every address with the page and would say 200 either way.
		expect(existsSync(join(BUILT_DIRECTORY, "_redirects"))).toBe(false);
		expect(existsSync(join(BUILT_DIRECTORY, "404.html"))).toBe(true);
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
		await expect(page.getByRole("button", { name: "Usar só neste navegador" })).toBeVisible({
			timeout: 20_000,
		});

		await context.setOffline(false);
	});
});
