import { describe, expect, it } from "vitest";
import { pickRule, ruleMatches } from "./match.ts";

const record = { description: "iFood * Padaria São João", accountId: "card", kind: "expense" };

describe("matching a rule against a record", () => {
	it("ignores case, accents and where the text sits", () => {
		expect(ruleMatches({ matchText: "ifood", position: 0 }, record)).toBe(true);
		expect(ruleMatches({ matchText: "IFOOD", position: 0 }, record)).toBe(true);
		expect(ruleMatches({ matchText: "sao joao", position: 0 }, record)).toBe(true);
		expect(ruleMatches({ matchText: "padaria", position: 0 }, record)).toBe(true);
	});

	it("says no to what is not there", () => {
		expect(ruleMatches({ matchText: "mercado", position: 0 }, record)).toBe(false);
		expect(ruleMatches({ matchText: "   ", position: 0 }, record)).toBe(false);
	});

	it("narrows by account and by kind when the rule says so", () => {
		expect(ruleMatches({ matchText: "ifood", accountId: "card", position: 0 }, record)).toBe(true);
		expect(ruleMatches({ matchText: "ifood", accountId: "cash", position: 0 }, record)).toBe(false);
		expect(ruleMatches({ matchText: "ifood", kind: "expense", position: 0 }, record)).toBe(true);
		expect(ruleMatches({ matchText: "ifood", kind: "income", position: 0 }, record)).toBe(false);
	});
});

describe("choosing between rules", () => {
	it("takes the first one that matches, by position", () => {
		const rules = [
			{ matchText: "padaria", position: 2, id: "bakery" },
			{ matchText: "ifood", position: 1, id: "delivery" },
		];
		expect(pickRule(rules, record)?.id).toBe("delivery");
	});

	it("gives nothing back when none of them match", () => {
		expect(pickRule([{ matchText: "posto", position: 0 }], record)).toBe(null);
	});

	it("does not depend on the order they arrived in", () => {
		const one = { matchText: "padaria", position: 2, id: "bakery" };
		const two = { matchText: "ifood", position: 1, id: "delivery" };
		expect(pickRule([one, two], record)?.id).toBe(pickRule([two, one], record)?.id);
	});
});
