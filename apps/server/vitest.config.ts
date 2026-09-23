import { defineConfig } from "vitest/config";

// SQLite ships inside Node and is stable from version 24. On 22 it needs a flag.
const major = Number(process.versions.node.split(".")[0]);

export default defineConfig({
	test: {
		execArgv: major < 24 ? ["--experimental-sqlite"] : [],
		testTimeout: 60_000,
	},
});
