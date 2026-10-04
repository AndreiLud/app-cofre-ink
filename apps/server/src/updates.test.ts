// What a failure to ask GitHub is called, which the page turns into a sentence each (part 2, K.3.6
// and M.2.9 of the request for 2.0.0). The reader in packages/cloud turns a request that never
// came back into a CloudError of status 0; this is the last step, the name the page receives.

import { CloudError } from "@cofre/cloud";
import { describe, expect, it } from "vitest";
import { failureOf } from "./updates.ts";

describe("what a failure to ask GitHub is called", () => {
	it("names a server with no internet, a refusal and an answer nobody can read", () => {
		expect(failureOf(new CloudError("GitHub", 0, ""))).toBe("githubUnreachable");
		expect(failureOf(new CloudError("GitHub", 403, "API rate limit exceeded"))).toBe(
			"githubRefused",
		);
		expect(failureOf(new CloudError("GitHub", 429, ""))).toBe("githubRefused");
		expect(failureOf(new CloudError("GitHub", 502, "<html>Bad gateway</html>"))).toBe(
			"githubUnreadable",
		);
		expect(failureOf(new SyntaxError("Unexpected token < in JSON"))).toBe("githubUnreadable");
	});
});
