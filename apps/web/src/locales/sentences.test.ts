// Sentences that once sent somebody the wrong way, held to what the screens now do.

import { describe, expect, it } from "vitest";
import en from "./en.json";
import pt from "./pt.json";

describe("what a sentence tells somebody to do", () => {
	// Part 1, H.1.1 of the request for 2.0.0: a card with no cycle was told to delete its account
	// and make it again, when the edit of the account has had both days since 1.2.0.
	it("sends a card with no cycle to the edit of its account, and never to deleting it", () => {
		expect(pt.invoice.noCycleBody).toContain("Editar conta");
		expect(en.invoice.noCycleBody).toContain("Edit account");
		expect(pt.invoice.noCycleBody).not.toMatch(/apague/i);
		expect(en.invoice.noCycleBody).not.toMatch(/delete/i);
	});

	// Part 1, H.1.2: an invoice with a purchase in another currency and no rate was told to type
	// the rate, and no field takes one.
	it("asks for no rate that no field takes", () => {
		expect(pt.invoice.noRateBody).not.toMatch(/informe a cotação/i);
		expect(en.invoice.noRateBody).not.toMatch(/say what the rate was/i);
		expect(pt.invoice.noRateBody).toContain("lance de novo");
		expect(en.invoice.noRateBody).toContain("write it again");
	});
});
