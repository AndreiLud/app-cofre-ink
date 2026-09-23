// The one decision in authentication that is made here rather than by the library: how
// the session cookie has to be written so that it comes back.
//
// It is tested on its own because the failure it prevents is invisible from the server.
// Nothing errors, nothing is logged: the browser simply stops attaching the cookie, and
// the person is signed in and signed out at the same time.

import { describe, expect, it } from "vitest";
import { cookiePolicy, differentSites } from "./auth.ts";
import type { Config } from "./config.ts";

function config(webOrigin: string, publicUrl: string): Config {
	return {
		COFRE_PORT: 4321,
		COFRE_DATABASE: ":memory:",
		COFRE_SECRET: "a secret long enough to sign a cookie with",
		COFRE_WEB_ORIGIN: webOrigin,
		COFRE_PUBLIC_URL: publicUrl,
		COFRE_PROOF_BITS: 0,
		NODE_ENV: "production",
		databaseKind: "sqlite",
	};
}

describe("telling one site from another", () => {
	it("counts the same host as the same site", () => {
		expect(differentSites("https://cofre.ink", "https://cofre.ink")).toBe(false);
	});

	it("counts a subdomain as the same site", () => {
		expect(differentSites("https://app.cofre.ink", "https://cofre.ink")).toBe(false);
		expect(differentSites("https://cofre.ink", "https://app.cofre.ink")).toBe(false);
	});

	it("counts a different domain as a different site", () => {
		expect(differentSites("https://app.cofre.ink", "https://casa.exemplo.com")).toBe(true);
	});

	it("is not fooled by a name that merely ends the same way", () => {
		// "notcofre.ink" ends with "cofre.ink" as text and is somebody else entirely.
		expect(differentSites("https://app.cofre.ink", "https://notcofre.ink")).toBe(true);
	});
});

describe("how the session cookie is written", () => {
	it("leaves the cookie alone when both are one site", () => {
		expect(cookiePolicy(config("https://cofre.ink", "https://cofre.ink"))).toBeUndefined();
	});

	it("lets the cookie travel when the interface is on another site", () => {
		const policy = cookiePolicy(config("https://app.cofre.ink", "https://casa.exemplo.com"));
		expect(policy).toEqual({ sameSite: "none", secure: true });
	});

	it("changes nothing over plain http, where a secure cookie is thrown away", () => {
		// A server at home, reached by its address on the network. Marking the cookie
		// secure there would lose it outright, which is worse than not being sent.
		expect(
			cookiePolicy(config("https://app.cofre.ink", "http://192.168.0.10:4321")),
		).toBeUndefined();
	});

	it("leaves the local pair of ports alone", () => {
		expect(cookiePolicy(config("http://localhost:5174", "http://localhost:4321"))).toBeUndefined();
	});
});
