#!/usr/bin/env node

// Static server for the browser storage spike.
// It mirrors GitHub Pages on purpose: it serves plain files, sets the correct media
// type for wasm, and never sends the two headers that would make the page cross
// origin isolated. If SQLite persists here, it persists on GitHub Pages.

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const root = join(process.cwd(), "spike", "opfsSqlite");
const port = Number(process.env.PORT ?? 5183);

const MEDIA_TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".wasm": "application/wasm",
	".map": "application/json",
};

const server = createServer(async (request, response) => {
	const url = new URL(request.url ?? "/", `http://localhost:${port}`);
	const requested = url.pathname === "/" ? "/index.html" : url.pathname;
	const safe = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
	const file = join(root, safe);

	if (!file.startsWith(root + sep)) {
		response.writeHead(403).end("forbidden");
		return;
	}

	try {
		const body = await readFile(file);
		response.writeHead(200, {
			"Content-Type": MEDIA_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
			"Cache-Control": "no-store",
		});
		response.end(body);
	} catch {
		response.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
	}
});

server.listen(port, () => {
	console.log(`spike server on http://localhost:${port}`);
	console.log("cross origin isolation headers are deliberately absent");
});
