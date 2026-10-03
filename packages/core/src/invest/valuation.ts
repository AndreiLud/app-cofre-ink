// What a holding is worth on a day, and what an investment account is worth.
//
// One reading, used by every screen that shows the money: the overview, the accounts, the
// projection, the month on paper and the goals. Each of them used to add up the holdings of an
// account by itself, from a value the repository had worked out by itself.
//
// A holding is worth what its product says. One counted in units is the quantity on the day
// times the newest price typed up to it. One whose value is typed is the newest value typed,
// with what went in and came out after it. One that follows an index is estimated from the
// newest value typed, or from what was put in, by the days the Banco Central published
// (estimate.ts). The quantity and the cost on the holding are what it was opened with; every
// movement after it is added on top.
//
// An investment account is worth its holdings when it has any, and its balance when it has
// none. Money moved into one without becoming a holding left "Você tem" and arrived nowhere,
// which is why nothing goes in or out of one except through a holding now.

import type { CalendarDate } from "../time/calendar.ts";
import { compareCalendarDates } from "../time/calendar.ts";
import { estimateByIndex, type HoldingMovement, type IndexDay } from "./estimate.ts";
import type { Indexer, Product } from "./products.ts";

/** Quantities are scaled by ten to the eighth, so a fund can have fractions of a unit. */
export const QUANTITY_SCALE = 100_000_000;

/**
 * What a holding was opened with, and what it follows.
 *
 * A product counted by value (one estimated from an index, or typed) is one unit whose price is
 * the whole of it: the quantity is one, scaled, the opening is the unit price, and a value typed
 * later is a price of that one unit.
 */
export type HoldingFacts = {
	product: Product;
	indexer: Indexer | null;
	/** Hundredths of a percentage point: 100% of the CDI is 10000, 12% a year is 1200. */
	rate: number | null;
	/** What it was opened with, scaled by ten to the eighth. */
	quantity: number;
	/** Minor units for one unit, as opened. */
	unitPrice: number;
	/** What the opening cost, in minor units. */
	cost: number;
	/** The day the opening was put in, when it was. */
	boughtOn: CalendarDate | null;
	/** The day the holding was written down, for one with no day of its own. */
	writtenOn: CalendarDate;
	maturesOn: CalendarDate | null;
	anniversaryDay: number | null;
};

/** A price, or a value, typed for a day, and the moment it was written down. */
export type TypedPrice = { day: CalendarDate; unitPrice: number; writtenAt?: number };

/** Money in, money out and income, with the units they moved when there are units. */
export type HoldingMoveFact = {
	day: CalendarDate;
	kind: "in" | "out" | "income";
	/** Minor units, always positive. */
	amount: number;
	quantity: number | null;
	/** The moment it was written down, which says whether a value typed that day had it. */
	writtenAt?: number;
};

/**
 * What went in or out on the day of a value typed, after it was typed: the value is the one at
 * the end of its day as the statement showed it, so money moved later that day is not in it.
 */
function sameDayAfter(moves: readonly HoldingMoveFact[], typed: TypedPrice): number {
	if (typed.writtenAt === undefined) return 0;
	return moves
		.filter(
			(move) =>
				move.day === typed.day &&
				move.kind !== "income" &&
				move.writtenAt !== undefined &&
				move.writtenAt > (typed.writtenAt as number),
		)
		.reduce((sum, move) => sum + (move.kind === "in" ? move.amount : -move.amount), 0);
}

/** The daily series the estimates read. */
export type DailySeries = {
	cdiDaily: readonly IndexDay[];
	selicDaily: readonly IndexDay[];
	savings: readonly IndexDay[];
};

export type HoldingWorth = {
	/** Gross, in minor units. */
	value: number;
	/** The units held on the day, scaled. */
	quantity: number;
	/** What was put in, less what was taken out, in minor units. */
	invested: number;
	/** For an estimate, the last day whose rate is in it. Null otherwise. */
	estimatedThrough: CalendarDate | null;
	/** Whether the value is an estimate from an index. */
	estimated: boolean;
};

const atMost = (left: CalendarDate, right: CalendarDate) => compareCalendarDates(left, right) <= 0;

/** The money in and out of a holding up to a day, as the estimate reads it. */
export function movementsOf(
	moves: readonly HoldingMoveFact[],
	on: CalendarDate,
): HoldingMovement[] {
	return moves
		.filter((move) => atMost(move.day, on) && move.kind !== "income")
		.map((move) => ({ day: move.day, amount: move.kind === "in" ? move.amount : -move.amount }));
}

/** What a holding is worth on a day. */
export function valueOfHolding(input: {
	facts: HoldingFacts;
	prices: readonly TypedPrice[];
	moves: readonly HoldingMoveFact[];
	series: DailySeries;
	on: CalendarDate;
}): HoldingWorth {
	const { facts, on } = input;
	const moves = input.moves.filter((move) => atMost(move.day, on));
	const quantity =
		facts.quantity +
		moves.reduce(
			(sum, move) =>
				sum +
				(move.quantity === null
					? 0
					: move.kind === "in"
						? move.quantity
						: move.kind === "out"
							? -move.quantity
							: 0),
			0,
		);
	const invested =
		facts.cost +
		moves.reduce(
			(sum, move) =>
				sum + (move.kind === "in" ? move.amount : move.kind === "out" ? -move.amount : 0),
			0,
		);
	const prices = input.prices
		.filter((price) => atMost(price.day, on))
		.slice()
		.sort((left, right) => compareCalendarDates(left.day, right.day));
	const newest = prices.at(-1) ?? null;
	const valuation = facts.product.valuation(facts.indexer);

	if (valuation === "price") {
		const unitPrice = newest?.unitPrice ?? facts.unitPrice;
		return {
			value: Math.round((quantity * unitPrice) / QUANTITY_SCALE),
			quantity,
			invested,
			estimatedThrough: null,
			estimated: false,
		};
	}

	const opening = Math.round((facts.quantity * facts.unitPrice) / QUANTITY_SCALE);

	if (valuation === "typed") {
		// The newest value typed, which is the whole value of a product counted by value, and what
		// went in and came out after it; with none typed, the opening and every movement.
		const from = newest
			? { day: newest.day, value: newest.unitPrice + sameDayAfter(moves, newest) }
			: { day: facts.boughtOn ?? facts.writtenOn, value: opening };
		const after = movementsOf(moves, on).filter(
			(move) => newest === null || compareCalendarDates(from.day, move.day) < 0,
		);
		return {
			value: from.value + after.reduce((sum, move) => sum + move.amount, 0),
			quantity,
			invested,
			estimatedThrough: null,
			estimated: false,
		};
	}

	// Estimated: from the newest value typed, or from what was put in on its day.
	const indexer = facts.indexer ?? facts.product.indexers[0] ?? "cdi";
	const kind = indexer === "ipca" ? "cdi" : indexer;
	const days =
		kind === "selic"
			? input.series.selicDaily
			: kind === "savings"
				? input.series.savings
				: input.series.cdiDaily;
	const from = newest
		? { day: newest.day, value: newest.unitPrice + sameDayAfter(moves, newest) }
		: null;
	const deposits = movementsOf(moves, on);
	if (from === null) deposits.push({ day: facts.boughtOn ?? facts.writtenOn, amount: opening });
	const estimate = estimateByIndex({
		indexer: kind,
		rate: facts.rate ?? 10_000,
		from,
		moves: deposits,
		until: on,
		maturesOn: facts.maturesOn,
		anniversaryDay: facts.anniversaryDay,
		days,
	});
	return {
		value: estimate.value,
		quantity,
		invested,
		estimatedThrough: estimate.through,
		estimated: true,
	};
}

/**
 * What each investment account is worth, from the values of its holdings: the sum of them, for
 * every account that has at least one. An account with none is worth its balance, which the
 * totals read when an account is missing here.
 */
export function worthByAccount(
	holdings: readonly { accountId: string; value: number }[],
): Record<string, number> {
	const worth: Record<string, number> = {};
	for (const holding of holdings) {
		worth[holding.accountId] = (worth[holding.accountId] ?? 0) + holding.value;
	}
	return worth;
}
