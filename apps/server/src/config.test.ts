// What the configuration promises: it refuses to start without the one secret it
// cannot invent, and it never says a password out loud.

import { describe, expect, it } from "vitest";
import { ConfigError, readConfig, withoutTheSecret } from "./config.ts";

const enough = "a secret long enough to sign a cookie with";

describe("reading the configuration", () => {
	it("refuses to start without a secret", () => {
		expect(() => readConfig({})).toThrow(ConfigError);
	});

	it("refuses a secret short enough to be guessed", () => {
		expect(() => readConfig({ COFRE_SECRET: "short" })).toThrow(ConfigError);
	});

	it("keeps the data beside the process when nobody said where", () => {
		const config = readConfig({ COFRE_SECRET: enough });
		expect(config.COFRE_DATABASE).toBe("./data/cofre.db");
		expect(config.databaseKind).toBe("sqlite");
	});

	it("reads an empty setting as one nobody set", () => {
		// This is what compose hands over for every optional line somebody left blank.
		const config = readConfig({
			COFRE_SECRET: enough,
			COFRE_CLIENT_IP_HEADER: "",
			COFRE_TURNSTILE_SITE_KEY: "",
			COFRE_TURNSTILE_SECRET: "",
			COFRE_STATIC_DIR: "  ",
		});
		expect(config.COFRE_CLIENT_IP_HEADER).toBeUndefined();
		expect(config.COFRE_TURNSTILE_SITE_KEY).toBeUndefined();
		expect(config.COFRE_STATIC_DIR).toBeUndefined();
	});

	it("refuses half of a captcha, in either direction", () => {
		expect(() =>
			readConfig({ COFRE_SECRET: enough, COFRE_TURNSTILE_SECRET: "only the secret" }),
		).toThrow(ConfigError);
		expect(() =>
			readConfig({ COFRE_SECRET: enough, COFRE_TURNSTILE_SITE_KEY: "only the key" }),
		).toThrow(ConfigError);
	});

	it("takes both halves of a captcha", () => {
		const config = readConfig({
			COFRE_SECRET: enough,
			COFRE_TURNSTILE_SITE_KEY: "public",
			COFRE_TURNSTILE_SECRET: "private",
		});
		expect(config.COFRE_TURNSTILE_SITE_KEY).toBe("public");
	});

	it("knows a connection string from a file path", () => {
		const config = readConfig({
			COFRE_SECRET: enough,
			COFRE_DATABASE: "postgres://cofre:secret@db:5432/cofre",
		});
		expect(config.databaseKind).toBe("postgres");
	});
});

describe("saying where the data is", () => {
	it("leaves a file path alone", () => {
		expect(withoutTheSecret("./data/cofre.db")).toBe("./data/cofre.db");
	});

	it("takes the password out of a connection string", () => {
		const said = withoutTheSecret("postgres://cofre:hunter2@db:5432/cofre");
		expect(said).not.toContain("hunter2");
		// What is left still answers the question somebody reads this line to answer.
		expect(said).toContain("db:5432");
		expect(said).toContain("cofre");
	});

	it("says nothing at all about a string it cannot read", () => {
		expect(withoutTheSecret("postgres not an address")).toBe("the configured database");
	});
});
