// Part 2, K.3 and K.8.1 of the request for 2.0.0: which versions were published, read with
// one plain request, and never the one GitHub calls the latest.

import { parseVersion } from "@cofre/core";
import { describe, expect, it } from "vitest";
import { RELEASES_URL, readReleases, releasePageOf } from "./github.ts";
import { CloudError } from "./http.ts";

const mine = parseVersion("2.0.0") ?? { major: 2, minor: 0, patch: 0 };

const RELEASES = [
	// Published last, and an older line: what /releases/latest would call the latest.
	{ tag_name: "v1.2.2", published_at: "2026-11-20T10:00:00Z", body: "Correction." },
	{ tag_name: "v2.2.0", prerelease: true, published_at: "2026-11-19T10:00:00Z", body: "" },
	{ tag_name: "v2.3.0", draft: true, published_at: null, body: "" },
	{ tag_name: "nightly", published_at: "2026-11-18T10:00:00Z", body: "" },
	{ tag_name: "v2.1.0", published_at: "2026-11-12T10:00:00Z", body: "What is new." },
	{ tag_name: "v2.0.1", published_at: "2026-10-30T10:00:00Z", body: "A correction." },
	{ tag_name: "v2.0.0", published_at: "2026-10-20T10:00:00Z", body: "The release." },
];

describe("the published versions", () => {
	it("asks once, plainly, and keeps the newer versions in order", async () => {
		const asked: { url: string; init: RequestInit | undefined }[] = [];
		const fetcher = (async (url: string, init?: RequestInit) => {
			asked.push({ url, init });
			return new Response(JSON.stringify(RELEASES), { status: 200 });
		}) as typeof fetch;

		const found = await readReleases(mine, { fetcher });

		expect(asked).toHaveLength(1);
		expect(asked[0]?.url).toBe(RELEASES_URL);
		expect(asked[0]?.init?.method).toBe("GET");
		const headers = new Headers(asked[0]?.init?.headers);
		expect(headers.has("authorization")).toBe(false);
		expect(headers.has("cookie")).toBe(false);
		expect(headers.has("user-agent")).toBe(false);

		expect(found.newer.map((one) => one.version)).toEqual([
			{ major: 2, minor: 1, patch: 0 },
			{ major: 2, minor: 0, patch: 1 },
		]);
		expect(found.latest?.version).toEqual({ major: 2, minor: 1, patch: 0 });
		expect(found.newer[0]?.publishedOn).toBe("2026-11-12");
		// The page comes from the version read, never from a link in the answer.
		expect(found.newer[0]?.page).toBe(releasePageOf({ major: 2, minor: 1, patch: 0 }));
	});

	it("gives up after the time it was given, as a place that did not answer", async () => {
		const never = ((_url: string, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
			})) as typeof fetch;

		const failure = await readReleases(mine, { fetcher: never, wait: 50 }).catch(
			(error: unknown) => error,
		);
		expect(failure).toBeInstanceOf(CloudError);
		expect((failure as CloudError).status).toBe(0);
	});

	it("names a refusal by its status", async () => {
		const refused = (async () => new Response("rate limited", { status: 403 })) as typeof fetch;
		const failure = await readReleases(mine, { fetcher: refused }).catch((error: unknown) => error);
		expect(failure).toMatchObject({ status: 403 });
	});
});
