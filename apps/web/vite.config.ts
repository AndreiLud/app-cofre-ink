import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	// One copy of React, even though the design system lives in another package.
	resolve: {
		dedupe: ["react", "react-dom"],
	},
	server: {
		port: 5174,
	},
});
