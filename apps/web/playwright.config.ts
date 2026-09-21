import { defineConfig, devices } from "@playwright/test";

const PORT = 5175;
const API_PORT = 4399;

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
