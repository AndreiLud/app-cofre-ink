// Where the money came from and where it went, as one balanced picture.
//
// A diagram of money only tells the truth when both sides add up. What came in has to
// equal what went out plus what was left, and when more went out than came in, the
// difference came from somewhere: savings, a card, the month before. This says so out
// loud instead of drawing a picture that quietly loses money.

export type FlowItem = {
	/** Stable, so a redraw does not shuffle the picture. */
	key: string;
	label: string;
	/** Positive minor units. */
	amount: number;
};

export type BalancedFlow = {
	sources: FlowItem[];
	destinations: FlowItem[];
	/** The same number on both sides, which is what makes the picture honest. */
	total: number;
	/** What came in and did not leave. Zero when the month spent everything. */
	leftOver: number;
	/** What left and did not come in this period. Zero when income covered it. */
	fromReserves: number;
};

/**
 * Balances the two sides.
 *
 * The keys "leftOver" and "fromReserves" are reserved for the two lines this function
 * adds, so the interface can name them in the language of the person reading.
 */
export function balanceFlow(
	income: readonly FlowItem[],
	spending: readonly FlowItem[],
): BalancedFlow {
	const keep = (items: readonly FlowItem[]) =>
		items.filter((item) => item.amount > 0).map((item) => ({ ...item }));

	const sources = keep(income);
	const destinations = keep(spending);

	const earned = sources.reduce((sum, item) => sum + item.amount, 0);
	const spent = destinations.reduce((sum, item) => sum + item.amount, 0);

	const leftOver = Math.max(0, earned - spent);
	const fromReserves = Math.max(0, spent - earned);

	if (leftOver > 0) {
		destinations.push({ key: "leftOver", label: "leftOver", amount: leftOver });
	}
	if (fromReserves > 0) {
		sources.unshift({ key: "fromReserves", label: "fromReserves", amount: fromReserves });
	}

	return {
		sources,
		destinations,
		total: Math.max(earned, spent),
		leftOver,
		fromReserves,
	};
}

/** The share each item takes of the whole, as a number from 0 to 1. */
export function sharesOf(items: readonly FlowItem[]): Map<string, number> {
	const total = items.reduce((sum, item) => sum + item.amount, 0);
	return new Map(items.map((item) => [item.key, total === 0 ? 0 : item.amount / total]));
}
