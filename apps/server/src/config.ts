// Everything the server needs to know, read from the environment once and checked
// before anything starts. A missing secret should stop the process, not surface as a
// strange error three requests later.

import { z } from "zod";

/**
 * Something that may be absent, where absent and empty are the same thing.
 *
 * `compose.yaml` passes every optional setting through whether it was filled in or not,
 * so what arrives for one nobody set is an empty string rather than nothing at all. An
 * empty string is not a header name and not a key, and reading it as one is how a
 * setting that looks unset behaves as if it were set.
 */
const optionalText = z.preprocess(
	(value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
	z.string().optional(),
);

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
	COFRE_STATIC_DIR: optionalText,
	/**
	 * The header a reverse proxy uses to say who is really calling. Without it every
	 * request behind a proxy looks like the same client, and the limit that protects
	 * the sign in counts everybody together. The name comes from configuration and is
	 * never assumed, because a header anyone can set is a header anyone can lie about.
	 * See .env.example for the usual value.
	 */
	COFRE_CLIENT_IP_HEADER: optionalText,
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
	COFRE_TURNSTILE_SITE_KEY: optionalText,
	COFRE_TURNSTILE_SECRET: optionalText,
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

/**
 * Where the data is, said in a way that is safe to print.
 *
 * A file path is itself. A connection string carries the password of the database in
 * the middle of it, and the line at boot that says which database this is would
 * otherwise put that password in the logs of the container, where anybody who can read
 * logs reads it and whatever collects them keeps it. The address stays, the secret goes.
 */
export function withoutTheSecret(database: string): string {
	if (!database.startsWith("postgres")) return database;
	try {
		const address = new URL(database);
		if (address.password !== "") address.password = "***";
		return address.toString();
	} catch {
		// Not an address this can read. Saying nothing beats guessing which part of it
		// is the password.
		return "the configured database";
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

	/**
	 * One of the two keys and not the other is the worst of both.
	 *
	 * The secret is what makes the server demand an answer from Cloudflare. The site key
	 * is what makes the browser draw the widget that produces one. With only the secret,
	 * every sign in is refused for a captcha that was never shown, and nobody gets in.
	 * With only the site key, people solve a puzzle that nothing checks. Neither shows up
	 * until somebody tries to sign in, so it is settled here, at boot, where it is read.
	 */
	const site = value.COFRE_TURNSTILE_SITE_KEY !== undefined;
	const secret = value.COFRE_TURNSTILE_SECRET !== undefined;
	if (site !== secret) {
		throw new ConfigError(
			site
				? "COFRE_TURNSTILE_SITE_KEY is set without COFRE_TURNSTILE_SECRET. The widget would be drawn and nothing would check the answer. Set both, or neither."
				: "COFRE_TURNSTILE_SECRET is set without COFRE_TURNSTILE_SITE_KEY. Every sign in would be refused for a captcha nobody was shown. Set both, or neither.",
		);
	}

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
