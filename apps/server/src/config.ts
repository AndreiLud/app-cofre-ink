// Everything the server needs to know, read from the environment once and checked
// before anything starts. A missing secret should stop the process, not surface as a
// strange error three requests later.

import { z } from "zod";

const schema = z.object({
	COFRE_PORT: z.coerce.number().int().positive().default(4321),
	/**
	 * A file path for SQLite, or a connection string starting with postgres for
	 * PostgreSQL. The default keeps the data next to the process, which is what a
	 * person expects the first time they run it.
	 */
	COFRE_DATABASE: z.string().min(1).default("./data/cofre.db"),
	/** Signs the session cookies. Without it, everyone would stay signed in forever. */
	COFRE_SECRET: z.string().min(32),
	/** Where the interface is served from, so the browser is allowed to call the API. */
	COFRE_WEB_ORIGIN: z.string().url().default("http://localhost:5174"),
	/** The address the invitation links point at. */
	COFRE_PUBLIC_URL: z.string().url().default("http://localhost:4321"),
	/** Where the built interface sits, when the same process serves it. */
	COFRE_STATIC_DIR: z.string().optional(),
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Config = z.infer<typeof schema> & {
	databaseKind: "sqlite" | "postgres";
};

export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

export function readConfig(source: NodeJS.ProcessEnv = process.env): Config {
	const parsed = schema.safeParse(source);
	if (!parsed.success) {
		const problems = parsed.error.issues
			.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
			.join("\n");
		throw new ConfigError(
			`the configuration is not complete. Copy .env.example to .env and fill it in.\n${problems}`,
		);
	}

	const value = parsed.data;
	return {
		...value,
		databaseKind: value.COFRE_DATABASE.startsWith("postgres") ? "postgres" : "sqlite",
	};
}
