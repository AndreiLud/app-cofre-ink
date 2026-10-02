// The one translator every screen sends a failure to.
//
// It had no test, and the correction it most needed was the one nobody could see: a server
// that crashed arrived as a status with a code nothing recognises, and the branch that
// answered it returned before anything reached the console. So a person read "I could not
// finish that" and whoever was looking at the code had nothing at all.

import { NotFoundError, PermissionError, RuleError } from "@cofre/storage";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServerError } from "../storage/remoteSession.ts";
import { sayWhy } from "./sayWhy.ts";

/** The key itself, so a test reads which sentence was chosen rather than the sentence. */
const asKey = (key: string) => key;

afterEach(() => {
	vi.restoreAllMocks();
});

describe("what to say about a failure", () => {
	it("leaves a trace for a server failure nobody can explain", () => {
		const console = vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined);
		const crashed = new ServerError({ status: 500, error: "unexpected" });

		expect(sayWhy(crashed, asKey)).toBe("rules.unknown");
		expect(console).toHaveBeenCalledTimes(1);
		expect(console).toHaveBeenCalledWith(crashed);
	});

	it("says the rule a server refusal names, and leaves no trace for it", () => {
		const console = vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined);

		// A rule is an answer and not a fault, so it belongs to the person and not to the
		// console. Without this assertion the one above is satisfied by logging everything.
		expect(sayWhy(new ServerError({ status: 409, error: "benefitIsNotIncome" }), asKey)).toBe(
			"rules.benefitIsNotIncome",
		);
		expect(console).not.toHaveBeenCalled();
	});

	it("says the same thing about the same failure in both modes", () => {
		// The point of this file: a refusal is one sentence whether the model refused it in
		// this tab or a server refused it over the wire.
		expect(sayWhy(new PermissionError("nope"), asKey)).toBe("rules.notAllowedHere");
		expect(sayWhy(new ServerError({ status: 403, error: "notAllowed" }), asKey)).toBe(
			"rules.notAllowedHere",
		);

		expect(sayWhy(new NotFoundError("gone"), asKey)).toBe("rules.notThere");
		expect(sayWhy(new ServerError({ status: 404, error: "notFound" }), asKey)).toBe(
			"rules.notThere",
		);

		expect(sayWhy(new RuleError("benefitIsNotIncome", "no"), asKey)).toBe(
			"rules.benefitIsNotIncome",
		);
	});
});
