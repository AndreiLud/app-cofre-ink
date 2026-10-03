// Which records are the household's money, and which are a benefit card's.
//
// A benefit card is an allowance that buys lunch or a fare and will not pay the rent. What is
// on it is never part of the money somebody has (`moneyOnHand` in the core), so what is spent
// on it is never money leaving either: a reading of the money that took the lunches off and
// never put the allowance in made every month look smaller by what was eaten. The projection
// did, the bills due soon of the check up did, and so did what the overview says is still to
// leave. This is the one condition all of them read, built from the core's own list of which
// kinds are benefits, so the two halves cannot disagree.
//
// The spending itself is still spending, in the reports and the limits, because a lunch is a
// lunch whoever paid for it; there the allowance is counted as income beside it.

import { BENEFIT_KINDS } from "@cofre/core";

/** A record whose account is not a benefit card, for a query that names the account column. */
export function notOnABenefitCard(accountColumn: string): string {
	const kinds = BENEFIT_KINDS.map((kind) => `'${kind}'`).join(", ");
	return `NOT EXISTS (SELECT 1 FROM "accounts" benefit_card
		WHERE benefit_card."id" = ${accountColumn} AND benefit_card."kind" IN (${kinds}))`;
}
