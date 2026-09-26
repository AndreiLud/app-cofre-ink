import { defineConfig, devices } from "@playwright/test";

const PORT = 5175;
const API_PORT = 4399;
/**
 * The built application, served the way it is served in the world.
 *
 * The flows use the dev server, which is faster and reloads. The one thing that cannot
 * be checked there is the part that only exists in a build: the manifest, the icons and
 * the worker that makes it open with no connection.
 */
const BUILT_PORT = 5176;

export default defineConfig({
	testDir: "./e2e",
	// One at a time, on purpose. Each test opens a browser with nothing stored, which
	// is what lets the flows start from the first screen, but the database in browser
	// mode is held by one tab at a time. Running them in parallel would have them
	// fighting over the same file instead of testing the product.
	fullyParallel: false,
	workers: 1,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "retain-on-failure",
		locale: "pt-BR",
		// Every flow below reads Portuguese, and the interface now opens in the language
		// of wherever the device is. Without this the suite passes on a machine in Brazil
		// and fails on a runner, which sits in UTC and would be handed English.
		timezoneId: "America/Sao_Paulo",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: [
		{
			command: `pnpm exec vite --port ${PORT} --strictPort`,
			url: `http://localhost:${PORT}`,
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
		},
		{
			// The build itself, for the one test that is about the build.
			command: `pnpm exec vite preview --port ${BUILT_PORT} --strictPort`,
			url: `http://localhost:${BUILT_PORT}/manifest.webmanifest`,
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
		},
		{
			// The server mode flows need a real server. It keeps everything in memory,
			// so a run leaves nothing behind.
			command: "node --experimental-sqlite --experimental-strip-types ../server/src/main.ts",
			url: `http://localhost:${API_PORT}/health`,
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
			env: {
				COFRE_PORT: String(API_PORT),
				COFRE_DATABASE: ":memory:",
				COFRE_SECRET: "playwright".padEnd(40, "0"),
				COFRE_WEB_ORIGIN: `http://localhost:${PORT}`,
				COFRE_PUBLIC_URL: `http://localhost:${API_PORT}`,
				NODE_ENV: "test",
			},
		},
	],
});

export const API_ADDRESS = `http://localhost:${API_PORT}`;
export const BUILT_ADDRESS = `http://localhost:${BUILT_PORT}`;
