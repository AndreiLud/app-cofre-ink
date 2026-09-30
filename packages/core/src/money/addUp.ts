// Adding records up, in the one currency a total is allowed to be labelled with.
//
// A record carries the amount and the currency somebody wrote, and a second figure: the
// same amount in the currency of the space, worked out once with the rate of the day and
// kept. Registry 0042 says which of the two counts, and it is always the second one,
// because a total under a list is labelled with the currency of the space and nothing on
// the screen says otherwise.
//
// Four places used to add the written amount up and label the answer with the space
// currency: the total under the list of records, and three sums on the calendar. A dinner
// of 40 dollars in a space that counts in reais came out as R$ 40,00 in every one of them.

/** What any of these sums needs from a record, and nothing more. */
export type Countable = {
	kind: string;
	/** The same amount in the currency of the space. */
	amountInBase: number;
};

/**
 * Adds the records up in the currency of the space, leaving transfers out.
 *
 * A transfer is money moving between two accounts of the same household, so counting it
 * would say the month was busier than it was. Both halves are one row here, and the row
 * is skipped rather than netted, which is what every screen that shows a total already
 * wanted.
 */
export function addUpInBase(rows: readonly Countable[]): number {
	let total = 0;
	for (const row of rows) {
		if (row.kind === "transfer") continue;
		total += row.amountInBase;
	}
	return total;
}
