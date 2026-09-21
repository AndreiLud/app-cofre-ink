#!/usr/bin/env node
// Copies the SQLite WASM distribution next to the spike page, so the spike loads it
// from its own origin, exactly as the application will.
// The files are copied one by one on purpose: the recursive copy helper crashes on
// Windows when the source is a package folder linked by pnpm.

import { copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";

const linked = join(process.cwd(), "node_modules", "@sqlite.org", "sqlite-wasm", "dist");
const target = join(process.cwd(), "spike", "opfsSqlite", "vendor");

if (!existsSync(linked)) {
	console.error("sqlite wasm is not installed, run pnpm install first");
	process.exit(1);
}

const source = realpathSync(linked);
mkdirSync(target, { recursive: true });

let copied = 0;
for (const entry of readdirSync(source)) {
	const from = join(source, entry);
	if (!statSync(from).isFile()) continue;
	copyFileSync(from, join(target, entry));
	copied += 1;
}

console.log(`copied ${copied} files to ${target}`);
