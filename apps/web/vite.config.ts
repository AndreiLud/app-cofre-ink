import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
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
