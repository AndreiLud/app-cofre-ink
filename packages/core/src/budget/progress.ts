// How a limit is doing.
//
// Three numbers and one honest sentence: how much was set aside, how much is gone, and
// whether what is left will hold to the end of the month. The last one is the reason
// this exists. Knowing that four hundred of a thousand is spent on the third of the
// month is a different fact from knowing it on the twenty eighth, and a budget that
// does not say so is decoration.

export type BudgetScope = "total" | "priority" | "category";

export type BudgetShape = {
	id: string;
	scope: BudgetScope;
	categoryId?: string | null;
	priority?: string | null;
	/** Empty means it applies to every month. */
	month?: string | null;
	amount: number;
};

export type SpendingRecord = {
	/** Signed minor units, as everywhere. Only what left counts against a limit. */
	amount: number;
	kind: string;
	categoryId: string | null;
	/** The priority that counts for this record, its own or the one of its category. */
	priority: string | null;
};

export type BudgetProgress = {
	budgetId: string;
	limit: number;
	/** Positive minor units already spent against this limit. */
	spent: number;
	left: number;
	/** From 0 to 1 and beyond, because going over a limit is a thing that happens. */
	share: number;
	/**
	 * What the month would end at if the rest of it looks like the part that has passed.
	 * Only meaningful while the month is running.
	 */
	projected: number;
	state: "comfortable" | "tight" | "over";
};

/** A record counts against a limit when it is money leaving inside its reach. */
export function countsToward(budget: BudgetShape, record: SpendingRecord): boolean {
	if (record.kind !== "expense") return false;
	if (budget.scope === "total") return true;
	if (budget.scope === "priority") return record.priority === budget.priority;
	return record.categoryId === budget.categoryId;
}

/**
 * The limit that applies to a month: the one written for that month, and otherwise the
 * standing one. A month of its own always wins, which is how a December that is not
 * like other months is said.
 */
export function budgetsForMonth<T extends BudgetShape>(budgets: readonly T[], month: string): T[] {
	const specific = budgets.filter((budget) => budget.month === month);
	const covered = new Set(specific.map(keyOf));
	const standing = budgets.filter(
		(budget) => (budget.month ?? null) === null && !covered.has(keyOf(budget)),
	);
	return [...specific, ...standing];
}

function keyOf(budget: BudgetShape): string {
	if (budget.scope === "total") return "total";
	if (budget.scope === "priority") return `priority:${budget.priority ?? ""}`;
	return `category:${budget.categoryId ?? ""}`;
}

export function progressOf(
	budget: BudgetShape,
	records: readonly SpendingRecord[],
	elapsed: { dayOfMonth: number; daysInMonth: number },
): BudgetProgress {
	const spent = records
		.filter((record) => countsToward(budget, record))
		.reduce((total, record) => total + Math.abs(record.amount), 0);

	const limit = Math.abs(budget.amount);
	const left = limit - spent;
	const share = limit === 0 ? 0 : spent / limit;

	const days = Math.max(1, Math.min(elapsed.dayOfMonth, elapsed.daysInMonth));
	const projected = Math.round((spent / days) * elapsed.daysInMonth);

	return {
		budgetId: budget.id,
		limit,
		spent,
		left,
		share,
		projected,
		state: spent > limit ? "over" : projected > limit ? "tight" : "comfortable",
	};
}
