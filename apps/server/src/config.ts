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
	/**
	 * The header a reverse proxy uses to say who is really calling. Without it every
	 * request behind a proxy looks like the same client, and the limit that protects
	 * the sign in counts everybody together. The name comes from configuration and is
	 * never assumed, because a header anyone can set is a header anyone can lie about.
	 * See .env.example for the usual value.
	 */
	COFRE_CLIENT_IP_HEADER: z.string().optional(),
	/**
	 * How much work a caller does before the server reads a password, in leading zero
	 * bits. Eighteen is a moment in a browser and a wall for anything trying passwords
	 * in bulk. Zero turns it off, which is for somebody who has their own gate in front.
	 */
	COFRE_PROOF_BITS: z.coerce.number().int().min(0).max(26).default(18),
	/**
	 * Cloudflare Turnstile, for somebody who wants a widget on top of the work above.
	 * Both are needed or neither: the site key is public and goes to the browser, the
	 * secret stays here and is what asks Cloudflare whether the answer was real.
	 *
	 * It is off by default on purpose. It is a third party being told the address of
	 * everybody who opens the sign in page of a private server, which is a thing to
	 * choose rather than a thing to inherit.
	 */
	COFRE_TURNSTILE_SITE_KEY: z.string().optional(),
	COFRE_TURNSTILE_SECRET: z.string().optional(),
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
		// In a test the gate is still in the way and merely cheap. What those tests are
		// about is that a request with no answer is refused, not how long an answer
		// takes to find, and eighteen bits on every sign up would be minutes of a suite
		// spent proving arithmetic that has its own test.
		COFRE_PROOF_BITS:
			source.COFRE_PROOF_BITS === undefined && value.NODE_ENV === "test"
				? 8
				: value.COFRE_PROOF_BITS,
		databaseKind: value.COFRE_DATABASE.startsWith("postgres") ? "postgres" : "sqlite",
	};
}
