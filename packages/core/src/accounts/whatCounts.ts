// Which accounts are the money somebody has.
//
// This existed three times and the three disagreed. The overview counted every kind,
// so a card invoice was netted off the headline and a meal voucher was counted as
// spendable cash. The check up counted everything except investments. The projection
// counted everything except credit, and converted currencies while the other two did
// not. Three screens, three answers, one question.
//
// So the policy lives here, once, and every reader names the question it is asking
// rather than writing a filter of its own. There is more than one honest question, and
// that is the point: what somebody has is not the same as what they can spend this
// afternoon, and neither is what they owe. What was wrong was not having several
// answers, it was having them scattered and unnamed.

/**
 * The kinds of account this product knows.
 *
 * Written out here rather than imported, because this package is the bottom of the
 * stack and knows nothing about storage. The database holds the same list and the
 * conformance suite is what keeps the two honest.
 */
export type AccountKind = "checking" | "savings" | "cash" | "credit" | "voucher" | "investment";

/** What somebody has. The number a screen shows when it says "you have this much". */
export const MONEY_KINDS: readonly AccountKind[] = ["checking", "savings", "cash", "investment"];

/**
 * What somebody can spend this afternoon.
 *
 * An investment is money, which is why it is in the list above, and it is not money you
 * spend on lunch. Every question of the form "is there enough" reads this one, because
 * answering it with a holding in a fund is how a reserve looks healthy right up to the
 * week somebody needs it.
 */
export const SPENDABLE_KINDS: readonly AccountKind[] = ["checking", "savings", "cash"];

/** What is owed. A card invoice is a debt and never a smaller amount of money. */
export const DEBT_KINDS: readonly AccountKind[] = ["credit"];

/** A benefit is a monthly allowance and not money: it buys lunch and nothing else. */
export const BENEFIT_KINDS: readonly AccountKind[] = ["voucher"];

export function countsAsMoney(kind: AccountKind): boolean {
	return MONEY_KINDS.includes(kind);
}

export function isSpendable(kind: AccountKind): boolean {
	return SPENDABLE_KINDS.includes(kind);
}

export function isDebt(kind: AccountKind): boolean {
	return DEBT_KINDS.includes(kind);
}

export function isBenefit(kind: AccountKind): boolean {
	return BENEFIT_KINDS.includes(kind);
}

/** Only what a total needs to know about an account. */
export type CountedAccount = {
	id: string;
	kind: AccountKind;
};

/** Only what a total needs to know about a balance. */
export type CountedBalance = {
	accountId: string;
	/** What has happened, in minor units. */
	settled: number;
};

export type TotalInput = {
	accounts: readonly CountedAccount[];
	balances: readonly CountedBalance[];
	/**
	 * What an investment account is worth today, by account, when it holds anything.
	 *
	 * A holding is priced by hand and a price is not a movement, so an investment
	 * account's balance is what was paid into it and not what it is worth. Where the
	 * portfolio has a figure, that figure is the truth and the balance is ignored.
	 */
	worth?: Readonly<Record<string, number>>;
};

function totalOver(input: TotalInput, wanted: (kind: AccountKind) => boolean): number {
	const settledOf = new Map<string, number>();
	for (const balance of input.balances) {
		settledOf.set(balance.accountId, (settledOf.get(balance.accountId) ?? 0) + balance.settled);
	}

	let total = 0;
	for (const account of input.accounts) {
		if (!wanted(account.kind)) continue;
		const priced = account.kind === "investment" ? input.worth?.[account.id] : undefined;
		total += priced ?? settledOf.get(account.id) ?? 0;
	}
	return total;
}

/**
 * What somebody has: the one number the overview opens with.
 *
 * Amounts are added as minor units of one currency. Adding two currencies is refused
 * higher up, where the accounts are read, because a total that silently added reais to
 * dollars is what three of these call sites were doing.
 */
export function moneyOnHand(input: TotalInput): number {
	return totalOver(input, countsAsMoney);
}

/** What somebody can spend now, which is what every question of "is there enough" reads. */
export function spendableNow(input: TotalInput): number {
	return totalOver(input, isSpendable);
}

/**
 * What can be spent this month, which is what can be spent now less the savings accounts
 * where money is put aside.
 *
 * A savings account is spendable, and it is where the savings rule and the goals send money.
 * Moving the five hundred the rule asks for from the current account to the savings account
 * left what is spendable as it was and cleared what the rule still asked, so what was left to
 * spend this month rose by five hundred, at the moment somebody did the one thing the figure
 * is meant to encourage. So an account the rule or a goal points at is left out of this, and
 * what the rule still asks is taken off what is left, as before.
 *
 * Only a savings account. A rule or a goal pointed at the current account, which nothing
 * stops, would otherwise take every account somebody spends from out of the figure.
 */
export function spendableThisMonth(input: TotalInput, putAside: Iterable<string | null>): number {
	const aside = new Set(putAside);
	return totalOver(
		{
			...input,
			accounts: input.accounts.filter(
				(account) => !(account.kind === "savings" && aside.has(account.id)),
			),
		},
		isSpendable,
	);
}

/** What is owed on the cards, as a positive number, because a debt is not a small balance. */
export function owedOnCards(input: TotalInput): number {
	return -totalOver(input, isDebt);
}

/** What is left on the benefit accounts. Never part of the money. */
export function leftOnBenefits(input: TotalInput): number {
	return totalOver(input, isBenefit);
}
