// What a holding would leave in the bank if it were taken out today.
//
// Every value on screen is the gross one, as the statement shows it. A caixinha, a CDB and the
// Tesouro also show what is left after the tax on taking it out today: the income tax on fixed
// income falls with how long each deposit stayed, and in the first thirty days the IOF takes
// most of the income first, the income tax being charged on what the IOF leaves. An LCI, an LCA
// and a poupança say they are exempt. Nothing else says anything, because what a fund or a share
// pays depends on things this does not know.
//
// The tables are the law's, and the law changes: each one says the day it applies from, and the
// one used is the newest that already applied on the day asked about.
//
// What was taken out came from the oldest deposits first, and the income of what is left is
// shared among the deposits still there by what each put in. Without the days of the deposits,
// as with every holding written down before 2.0.0, there is nothing to work it out from, and the
// screen says so.

import { type CalendarDate, compareCalendarDates } from "../time/calendar.ts";
import type { HoldingMovement } from "./estimate.ts";
import type { Taxation } from "./products.ts";

/** Hundredths of a percentage point in one whole. */
const SCALE = 10_000;

type IncomeTaxTable = {
	from: CalendarDate;
	/** Up to so many days held, inclusive, this rate; the last one has no end. */
	brackets: readonly { upToDays: number; rate: number }[];
};

/** Lei 11.033 of 2004, from the first of January of 2005. */
export const INCOME_TAX_TABLES: readonly IncomeTaxTable[] = [
	{
		from: "2005-01-01",
		brackets: [
			{ upToDays: 180, rate: 2_250 },
			{ upToDays: 360, rate: 2_000 },
			{ upToDays: 720, rate: 1_750 },
			{ upToDays: Number.POSITIVE_INFINITY, rate: 1_500 },
		],
	},
];

type IofTable = {
	from: CalendarDate;
	/** The share of the income taken on the first, second and so on day held, until the thirtieth. */
	byDay: readonly number[];
};

/** Decreto 6.306 of 2007, the IOF on redemptions in the first thirty days. */
export const IOF_TABLES: readonly IofTable[] = [
	{
		from: "2008-01-01",
		byDay: [
			9_600, 9_300, 9_000, 8_600, 8_300, 8_000, 7_600, 7_300, 7_000, 6_600, 6_300, 6_000, 5_600,
			5_300, 5_000, 4_600, 4_300, 4_000, 3_600, 3_300, 3_000, 2_600, 2_300, 2_000, 1_600, 1_300,
			1_000, 600, 300, 0,
		],
	},
];

function newestOn<T extends { from: CalendarDate }>(tables: readonly T[], on: CalendarDate): T {
	const applying = tables.filter((table) => compareCalendarDates(table.from, on) <= 0);
	return (applying.at(-1) ?? tables[0]) as T;
}

/** The income tax on fixed income, by the days a deposit stayed, in hundredths of a point. */
export function incomeTaxRate(daysHeld: number, on: CalendarDate): number {
	const table = newestOn(INCOME_TAX_TABLES, on);
	const bracket = table.brackets.find((one) => daysHeld <= one.upToDays);
	return (bracket ?? table.brackets[table.brackets.length - 1])?.rate ?? 0;
}

/** The IOF on the income of a deposit taken out after so many days, in hundredths of a point. */
export function iofRate(daysHeld: number, on: CalendarDate): number {
	if (daysHeld >= 30) return 0;
	const table = newestOn(IOF_TABLES, on);
	return table.byDay[Math.max(daysHeld, 1) - 1] ?? 0;
}

function daysBetween(from: CalendarDate, to: CalendarDate): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type NetIfTakenOut = {
	/** Minor units left in the bank. */
	net: number;
	incomeTax: number;
	iof: number;
};

/**
 * What would be left after tax if the whole holding were taken out on a day.
 *
 * Null when this product's tax is not worked out here, or when there are no days of deposits to
 * work it out from. Exempt products keep their whole value.
 */
export function netIfTakenOut(input: {
	taxation: Taxation;
	/** What went in, positive, and what came out, negative, with their days. */
	moves: readonly HoldingMovement[];
	/** What the holding is worth on the day, gross. */
	value: number;
	on: CalendarDate;
}): NetIfTakenOut | null {
	if (input.taxation === "notComputed") return null;
	if (input.taxation === "exempt") return { net: input.value, incomeTax: 0, iof: 0 };

	// What is still in, deposit by deposit, after what came out took the oldest first.
	const lots: { day: CalendarDate; amount: number }[] = [];
	for (const move of [...input.moves].sort((left, right) =>
		compareCalendarDates(left.day, right.day),
	)) {
		if (move.amount > 0) {
			lots.push({ day: move.day, amount: move.amount });
			continue;
		}
		let out = -move.amount;
		while (out > 0 && lots.length > 0) {
			const oldest = lots[0] as { day: CalendarDate; amount: number };
			const taken = Math.min(oldest.amount, out);
			oldest.amount -= taken;
			out -= taken;
			if (oldest.amount === 0) lots.shift();
		}
	}
	const principal = lots.reduce((sum, lot) => sum + lot.amount, 0);
	if (lots.length === 0 || principal <= 0) return null;

	const income = input.value - principal;
	if (income <= 0) return { net: input.value, incomeTax: 0, iof: 0 };

	let iof = 0;
	let incomeTax = 0;
	for (const lot of lots) {
		const days = daysBetween(lot.day, input.on);
		const share = (income * lot.amount) / principal;
		const lotIof = (share * iofRate(days, input.on)) / SCALE;
		iof += lotIof;
		incomeTax += ((share - lotIof) * incomeTaxRate(days, input.on)) / SCALE;
	}
	const roundedIof = Math.round(iof);
	const roundedTax = Math.round(incomeTax);
	return { net: input.value - roundedIof - roundedTax, incomeTax: roundedTax, iof: roundedIof };
}
