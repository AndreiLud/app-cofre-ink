// What a card already owes on the day it is written down.
//
// The cycle of a card somebody already owns started before they got here. So the account
// form asks what is on the invoice today, and the answer becomes one record dated today,
// charged to that card, which lands on the invoice still taking purchases because that is
// what any record dated today does.
//
// It is a small rule and it was seven lines inside a React component, where no test could
// reach it and where the question of what an empty field means was answered by a truthiness
// check. An amount of money is a rule, so it lives here.

import { MoneyError } from "../money/money.ts";
import type { CalendarDate } from "../time/calendar.ts";

export type OpeningCharge = {
	kind: "expense";
	/** Minor units, always above zero: nothing is written for an empty field. */
	amount: number;
	happenedOn: CalendarDate;
};

/**
 * The one record a card is written down with, or nothing.
 *
 * Nothing for an empty field, for zero and for a negative amount, which are three ways of
 * saying the card owes nothing and none of them is a record. A card with nothing on it is
 * the ordinary case and writing an expense of zero for it would put a line in somebody's
 * history that says nothing happened.
 *
 * A fraction of a cent is refused rather than rounded. Money is an integer number of cents
 * everywhere in this application, and a caller that has not parsed its field yet should
 * find that out here rather than halfway into a database.
 */
export function openingChargeOf(input: {
	charged: number | null;
	today: CalendarDate;
}): OpeningCharge | null {
	if (input.charged === null) return null;
	if (!Number.isSafeInteger(input.charged)) {
		throw new MoneyError("what is on an invoice is an integer number of cents");
	}
	if (input.charged <= 0) return null;

	return { kind: "expense", amount: input.charged, happenedOn: input.today };
}
