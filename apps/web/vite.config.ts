import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The version of the release, from the root package.json, which is the one place it is said.
const version = (
	JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
		version: string;
	}
).version;

export default defineConfig({
	plugins: [react(), tailwindcss()],
	// Written into the build as a constant, which `src/lib/version.ts` exports as APP_VERSION.
	define: {
		__APP_VERSION__: JSON.stringify(version),
	},
	// One copy of React, even though the design system lives in another package.
	resolve: {
		dedupe: ["react", "react-dom"],
	},
	// The SQLite build locates its own WebAssembly file, so it has to stay whole.
	optimizeDeps: {
		exclude: ["@sqlite.org/sqlite-wasm"],
	},
	worker: {
		format: "es",
	},
	server: {
		port: 5174,
	},
});
