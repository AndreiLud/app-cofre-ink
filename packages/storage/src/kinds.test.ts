// The kinds of account, written down in two places, kept the same by this.
//
// `packages/core` is the bottom of the stack and imports nothing, so it writes the list of
// account kinds out for itself, and its comment says the conformance suite is what keeps
// the two honest. It was not: nothing anywhere mentioned both lists, so a seventh kind
// added to the database would have been money that counts as nothing, silently, on every
// screen that asks what somebody has.
//
// This package is the first one that can see both, so it is where the check belongs.

import {
	type AccountKind,
	BENEFIT_KINDS,
	countsAsMoney,
	DEBT_KINDS,
	isBenefit,
	isDebt,
	isSpendable,
	MONEY_KINDS,
	SPENDABLE_KINDS,
} from "@cofre/core";
import { ACCOUNT_KINDS } from "@cofre/db";
import { describe, expect, it } from "vitest";

describe("the kinds of account", () => {
	it("are the same list in the database and in the rules", () => {
		expect([...ACCOUNT_KINDS].sort()).toEqual(
			[...MONEY_KINDS, ...DEBT_KINDS, ...BENEFIT_KINDS].sort(),
		);
	});

	/**
	 * Every kind answers exactly one of the three questions.
	 *
	 * A kind in none of them is money that counts nowhere; a kind in two is money counted
	 * twice. Both are the same defect from opposite sides, and neither shows up as a failure
	 * anywhere: it shows up as a total that is wrong by the balance of one account.
	 */
	it("each answer exactly one of what somebody has, owes or is allowed", () => {
		for (const kind of ACCOUNT_KINDS as readonly AccountKind[]) {
			const answers = [countsAsMoney(kind), isDebt(kind), isBenefit(kind)].filter(Boolean);
			expect(answers, `${kind} answers ${answers.length} of the three`).toHaveLength(1);
		}
	});

	/** What can be spent this afternoon is some of what somebody has, and never more. */
	it("can only spend what counts as money", () => {
		for (const kind of SPENDABLE_KINDS) {
			expect(isSpendable(kind) && countsAsMoney(kind)).toBe(true);
		}
	});
});
