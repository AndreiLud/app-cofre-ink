// Starts the server. Everything it needs is built here and handed down, so the same
// application can be built in a test with a database that lives in memory.

import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { ConfigError, readConfig } from "./config.ts";
import { openDatabase } from "./database.ts";

async function main(): Promise<void> {
	const config = readConfig();
	const database = await openDatabase(config);
	const auth = createAuth(config, database);
	const app = createApp({ config, database, auth });

	// When the interface was built next to the server, the same container serves both,
	// which is one less thing to run at home. Every path that is not a file falls back
	// to the page, because the routes live in the browser.
	if (config.COFRE_STATIC_DIR && existsSync(config.COFRE_STATIC_DIR)) {
		const root = config.COFRE_STATIC_DIR;
		app.use("/*", serveStatic({ root }));
		app.notFound(async (context) => {
			if (context.req.path.startsWith("/api")) return context.json({ error: "notFound" }, 404);
			const page = await serveStatic({ root, path: "index.html" })(context, async () => {});
			return page ?? context.text("not found", 404);
		});
	}

	const server = serve({ fetch: app.fetch, port: config.COFRE_PORT }, (address) => {
		console.log(`Cofre is listening on http://localhost:${address.port}`);
		console.log(`storing data in ${config.COFRE_DATABASE}`);
	});

	const stop = async () => {
		server.close();
		await database.close();
		process.exit(0);
	};

	process.on("SIGINT", () => void stop());
	process.on("SIGTERM", () => void stop());
}

main().catch((error: unknown) => {
	if (error instanceof ConfigError) {
		console.error(error.message);
		process.exit(1);
	}
	console.error(error);
	process.exit(1);
});
