// What the browser makes of a server's answer.
//
// Part 1, G.8 of the request for 2.0.0: the client read the body as JSON before it looked at
// the status, so a failure answered with a page instead of JSON, which is what a proxy in
// front of a server that is down sends, reached the screen as a SyntaxError and not as an
// error with a name.

import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerClient, ServerError } from "./remoteSession.ts";

const PAGE = "<!doctype html><html><body><h1>502 Bad Gateway</h1></body></html>";

function answering(body: string, status: number) {
	vi.spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(body, { status, headers: { "Content-Type": "text/html" } }),
	);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("a server's answer", () => {
	it("names a failure that came back as a page", async () => {
		answering(PAGE, 502);
		const failure = await createServerClient("https://cofre.exemplo.com")
			.me()
			.catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(ServerError);
		expect(failure).toMatchObject({ status: 502, code: "unexpected" });
	});

	it("names an address that answers, but not as this server", async () => {
		// A host that serves a page for every address, which is what a static host does.
		answering(PAGE, 200);
		const failure = await createServerClient("https://cofre.exemplo.com")
			.me()
			.catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(ServerError);
		expect(failure).toMatchObject({ status: 200, code: "notACofreServer" });
	});

	it("still reads the code of a refusal", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: "notAllowed", permission: "space.read" }), {
				status: 403,
			}),
		);
		const failure = await createServerClient("https://cofre.exemplo.com")
			.me()
			.catch((error: unknown) => error);
		expect(failure).toMatchObject({ status: 403, code: "notAllowed" });
	});
});
