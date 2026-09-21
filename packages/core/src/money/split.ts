// Splitting money is where rounding errors become arguments between people.
// Every function here distributes the leftover minor units with the largest remainder
// method, in a deterministic order, so the parts always add up to the total exactly.

import { type Money, MoneyError, money } from "./money.ts";

/** Distributes an integer amount across weights, keeping the sum exact. */
export function allocate(totalMinorUnits: number, weights: readonly number[]): number[] {
	if (weights.length === 0) {
		throw new MoneyError("cannot split across an empty list of weights");
	}
	if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
		throw new MoneyError("weights have to be finite and not negative");
	}

	const weightTotal = weights.reduce((total, weight) => total + weight, 0);
	if (weightTotal <= 0) {
		throw new MoneyError("the weights add up to zero, there is nothing to split by");
	}

	const sign = totalMinorUnits < 0 ? -1 : 1;
	const target = Math.abs(totalMinorUnits);

	const exact = weights.map((weight) => (target * weight) / weightTotal);
	const parts = exact.map((value) => Math.floor(value));
	const distributed = parts.reduce((total, value) => total + value, 0);

	const order = exact
		.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
		.sort((left, right) => right.remainder - left.remainder || left.index - right.index);

	let leftover = target - distributed;
	let cursor = 0;
	while (leftover > 0) {
		const position = order[cursor % order.length];
		if (position === undefined) break;
		parts[position.index] = (parts[position.index] ?? 0) + 1;
		leftover -= 1;
		cursor += 1;
	}

	return parts.map((value) => value * sign);
}

/** Splits a total into equal parts, the leftover cents going to the first ones. */
export function splitEvenly(total: Money, parts: number): Money[] {
	if (!Number.isInteger(parts) || parts <= 0) {
		throw new MoneyError(`the number of parts has to be a positive integer, received ${parts}`);
	}
	return allocate(total.amount, new Array<number>(parts).fill(1)).map((amount) =>
		money(amount, total.currency),
	);
}

/** Splits a total by weights, for example the income of each member of a house. */
export function splitByWeights(total: Money, weights: readonly number[]): Money[] {
	return allocate(total.amount, weights).map((amount) => money(amount, total.currency));
}

/**
 * Splits a purchase into installments the way Brazilian card issuers do: every
 * installment has the same value and the leftover cents land on the earliest ones,
 * so the sum matches the purchase to the cent.
 */
export function allocateInstallments(total: Money, count: number): Money[] {
	if (!Number.isInteger(count) || count <= 0) {
		throw new MoneyError(`the number of installments has to be positive, received ${count}`);
	}

	const sign = total.amount < 0 ? -1 : 1;
	const target = Math.abs(total.amount);
	const base = Math.floor(target / count);
	const leftover = target - base * count;

	return Array.from({ length: count }, (_unused, index) =>
		money((base + (index < leftover ? 1 : 0)) * sign, total.currency),
	);
}

/** Splits by percentage, given in hundredths of a percent to avoid decimals. */
export function splitByBasisPoints(total: Money, basisPoints: readonly number[]): Money[] {
	const declared = basisPoints.reduce((sum, value) => sum + value, 0);
	if (declared !== 10_000) {
		throw new MoneyError(
			`the shares have to add up to 100 percent, they add up to ${declared / 100}`,
		);
	}
	return splitByWeights(total, basisPoints);
}
