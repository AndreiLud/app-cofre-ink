import { defineConfig } from "vitest/config";

// The SQLite module that ships with Node is stable from version 24. On Node 22 it is
// there, behind a flag, so the tests ask for it when they are running on 22.
const major = Number(process.versions.node.split(".")[0]);

export default defineConfig({
	test: {
		execArgv: major < 24 ? ["--experimental-sqlite"] : [],
		testTimeout: 60_000,
		hookTimeout: 60_000,
	},
});
