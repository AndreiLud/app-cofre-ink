// Dividing one expense between people, and working out who owes whom.
//
// This is the part of a shared space where a rounding error becomes an argument, so
// every division here adds up to the cent and the order is fixed. The shares are
// integers of minor units, never percentages carried around and multiplied later.

import { allocate } from "../money/split.ts";

export type SplitMethod = "evenly" | "shares" | "income";

export type SplitParticipant = {
	userId: string;
	/** Used by the shares method: two and one is two thirds and one third. */
	weight?: number;
	/** Used by the income method, in minor units. */
	monthlyIncome?: number | null;
};

export type SplitPart = { userId: string; amount: number };

export class SplitError extends Error {
	readonly rule: string;

	constructor(rule: string, message: string) {
		super(message);
		this.name = "SplitError";
		this.rule = rule;
	}
}

/**
 * Divides a total between people. The total is given in positive minor units, and
 * every part comes back positive: which side of the ledger this sits on is decided by
 * the record it belongs to, not here.
 */
export function divide(
	total: number,
	method: SplitMethod,
	participants: readonly SplitParticipant[],
): SplitPart[] {
	if (participants.length === 0) {
		throw new SplitError("splitNeedsPeople", "there is nobody to divide this between");
	}
	if (!Number.isSafeInteger(total) || total <= 0) {
		throw new SplitError(
			"amountIsPositiveInteger",
			"the amount to divide is a positive integer of minor units",
		);
	}

	const weights = participants.map((person) => {
		if (method === "evenly") return 1;
		if (method === "shares") return person.weight ?? 0;
		return person.monthlyIncome ?? 0;
	});

	if (weights.every((weight) => weight <= 0)) {
		throw new SplitError(
			method === "income" ? "splitNeedsIncome" : "splitNeedsShares",
			method === "income"
				? "nobody in this space has said what they earn, so there is nothing to divide by"
				: "the shares add up to zero, so there is nothing to divide by",
		);
	}

	return allocate(total, weights).map((amount, index) => ({
		userId: participants[index]?.userId ?? "",
		amount,
	}));
}

export type SharedExpense = {
	/** Positive minor units. What the expense cost, whoever paid it. */
	amount: number;
	/** Who put the money in. */
	paidBy: string;
	/** What each person owes of it. The parts add up to the amount. */
	parts: readonly SplitPart[];
};

export type Settlement = { fromUserId: string; toUserId: string; amount: number };

/**
 * What each person is owed, or owes, after everything that was shared and everything
 * that was already settled. A positive number means the others owe them.
 */
export function balancesBetween(
	expenses: readonly SharedExpense[],
	settled: readonly Settlement[] = [],
): Map<string, number> {
	const net = new Map<string, number>();
	const add = (userId: string, amount: number) => net.set(userId, (net.get(userId) ?? 0) + amount);

	for (const expense of expenses) {
		add(expense.paidBy, expense.amount);
		for (const part of expense.parts) add(part.userId, -part.amount);
	}
	// Paying somebody back moves the debt, it does not make money appear.
	for (const payment of settled) {
		add(payment.fromUserId, payment.amount);
		add(payment.toUserId, -payment.amount);
	}

	return net;
}

/**
 * The shortest list of payments that clears the balances. Largest debt pays the largest
 * credit until nothing is left, which is the fewest transfers anybody has to make.
 */
export function settleUp(balances: Map<string, number>): Settlement[] {
	const owed = [...balances.entries()]
		.filter(([, amount]) => amount > 0)
		.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
		.map(([userId, amount]) => ({ userId, amount }));

	const owing = [...balances.entries()]
		.filter(([, amount]) => amount < 0)
		.sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
		.map(([userId, amount]) => ({ userId, amount: -amount }));

	const payments: Settlement[] = [];
	let credit = 0;
	let debt = 0;

	while (credit < owed.length && debt < owing.length) {
		const receiver = owed[credit];
		const payer = owing[debt];
		if (!receiver || !payer) break;

		const amount = Math.min(receiver.amount, payer.amount);
		if (amount > 0) {
			payments.push({ fromUserId: payer.userId, toUserId: receiver.userId, amount });
			receiver.amount -= amount;
			payer.amount -= amount;
		}
		if (receiver.amount === 0) credit += 1;
		if (payer.amount === 0) debt += 1;
	}

	return payments;
}
