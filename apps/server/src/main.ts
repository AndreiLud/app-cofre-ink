// Starts the server. Everything it needs is built here and handed down, so the same
// application can be built in a test with a database that lives in memory.

import { existsSync } from "node:fs";
import { tidyEverySpace } from "@cofre/storage";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { ConfigError, readConfig, withoutTheSecret } from "./config.ts";
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
		console.log(`Cofre Ink is listening on http://localhost:${address.port}`);
		console.log(`storing data in ${withoutTheSecret(config.COFRE_DATABASE)}`);
	});

	// Housekeeping, on a schedule, because a server is the one place where nobody is
	// sitting in front of the database. It folds the settled part of each change log at
	// most once a day, so this timer is a check and almost never work. Nothing it does
	// is visible: no record changes and no amount moves.
	const housekeeping = setInterval(
		() => {
			void tidyEverySpace(database.driver).then(
				(done) => {
					const folded = done.reduce((total, one) => total + one.removed, 0);
					if (folded > 0) console.log(`tidied ${done.length} spaces, ${folded} entries folded`);
				},
				() => {
					// Next hour will do.
				},
			);
		},
		60 * 60 * 1000,
	);
	housekeeping.unref();

	const stop = async () => {
		clearInterval(housekeeping);
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
