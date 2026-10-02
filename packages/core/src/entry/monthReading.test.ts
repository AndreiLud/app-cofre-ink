import { describe, expect, it } from "vitest";
import { progressOf } from "../budget/progress.ts";
import {
	againstAUsualMonth,
	limitsNearBreaking,
	type MonthAmounts,
	whatTookIt,
} from "./monthReading.ts";

const months: MonthAmounts[] = [
	{ month: "2026-10", income: 500_000, expense: 30_000 },
	{ month: "2026-09", income: 500_000, expense: 400_000 },
	{ month: "2026-08", income: 500_000, expense: 410_000 },
	{ month: "2026-07", income: 500_000, expense: 390_000 },
	{ month: "2026-06", income: 500_000, expense: 400_000 },
];

describe("this month against a usual one", () => {
	it("says nothing about a month three days old", () => {
		const early = againstAUsualMonth({ month: "2026-10", today: "2026-10-03", months });

		expect(early?.usualOut).toBe(400_000);
		expect(early?.monthOut).toBe(30_000);
		// The figures are there. The verdict is not, because a month of three days has mostly
		// not been spent yet and calling that thrift is the one harm this reading can do.
		expect(early?.comparable).toBe(false);
		expect(early?.verdict).toBe("tooEarly");
	});

	it("says it once four fifths of the month has gone", () => {
		const late = againstAUsualMonth({ month: "2026-10", today: "2026-10-28", months });
		expect(late?.comparable).toBe(true);
		expect(late?.verdict).toBe("lower");
		expect(late?.differenceOut).toBe(-370_000);
	});

	it("speaks freely about a month that is over", () => {
		const closed = againstAUsualMonth({ month: "2026-09", today: "2026-10-03", months });
		expect(closed?.comparable).toBe(true);
		// Four hundred thousand against the middle of June, July and August, which is four
		// hundred thousand: the same month, and the word for that is not better or worse.
		expect(closed?.verdict).toBe("same");
	});

	it("has no usual month until three of them are closed", () => {
		expect(
			againstAUsualMonth({ month: "2026-10", today: "2026-10-28", months: months.slice(0, 3) }),
		).toBeNull();
	});

	it("reads at most six months back, so last year is not deciding today", () => {
		const long = [
			{ month: "2026-10", income: 0, expense: 100_000 },
			...["09", "08", "07", "06", "05", "04"].map((month) => ({
				month: `2026-${month}`,
				income: 0,
				expense: 200_000,
			})),
			// A year of nothing, which would halve the median if it were read.
			...["03", "02", "01"].map((month) => ({ month: `2026-${month}`, income: 0, expense: 0 })),
		];
		expect(
			againstAUsualMonth({ month: "2026-10", today: "2026-10-28", months: long })?.usualOut,
		).toBe(200_000);
	});
});

describe("what the month went on", () => {
	const rows = [
		{
			amountInBase: -220_000,
			kind: "expense",
			categoryId: null,
			externalId: "mes:2026-10:spending",
		},
		{
			amountInBase: -180_000,
			kind: "expense",
			categoryId: null,
			externalId: "mes:2026-10:invoice",
		},
		{ amountInBase: -30_000, kind: "expense", categoryId: "food", externalId: null },
		{ amountInBase: -10_000, kind: "expense", categoryId: "fun", externalId: null },
		{ amountInBase: -20_000, kind: "expense", categoryId: null, externalId: null },
		{ amountInBase: 500_000, kind: "income", categoryId: "wages", externalId: null },
	];

	it("leaves the three typed numbers out of the ranking, and names them apart", () => {
		const took = whatTookIt(rows);

		expect(took.notItemised).toBe(400_000);
		expect(took.sorted).toBe(60_000);
		// By what each one took, with the unsorted line in its place rather than first: the
		// ranking that counts the typed totals puts a null line of four hundred and twenty
		// thousand at the top and announces that the month went on nothing in particular.
		expect(took.ranked.map((one) => one.categoryId)).toEqual(["food", null, "fun"]);
	});

	it("shares out what is sorted, and not the whole month", () => {
		const took = whatTookIt(rows);
		expect(took.ranked[0]?.share).toBeCloseTo(0.5);
		expect(took.ranked.reduce((total, one) => total + one.share, 0)).toBeCloseTo(1);
	});

	/**
	 * In the currency of the space, from the figure worked out at the rate of each day.
	 *
	 * This shipped summing the amount as it was typed, which is the same fault this release
	 * took out of the card invoice: a month holding a dinner of forty dollars and a market of
	 * a hundred reais came back as fourteen thousand, a number in no currency at all, and the
	 * screen printed it with the currency of the space beside it.
	 */
	it("adds a purchase in another currency up as what it was worth here", () => {
		// Both columns, as a record carries them: forty dollars as typed, worth two hundred and
		// eight reais on the day, and a hundred reais that are the same in both.
		const rows = [
			{
				amount: -4_000,
				amountInBase: -20_800,
				kind: "expense",
				categoryId: "food",
				externalId: null,
			},
			{
				amount: -10_000,
				amountInBase: -10_000,
				kind: "expense",
				categoryId: "fun",
				externalId: null,
			},
		];
		const took = whatTookIt(rows);

		expect(took.sorted).toBe(30_800);
		expect(took.ranked[0]).toMatchObject({ categoryId: "food", amount: 20_800 });
	});

	it("answers nothing for a month that is only three numbers", () => {
		const took = whatTookIt(rows.slice(0, 2));
		expect(took.ranked).toEqual([]);
		expect(took.sorted).toBe(0);
		expect(took.notItemised).toBe(400_000);
	});
});

describe("limits close to breaking", () => {
	it("calls four fifths close, and past it over", () => {
		expect(limitsNearBreaking([{ budgetId: "t", limit: 250_000, spent: 210_000 }])[0]?.state).toBe(
			"close",
		);
		expect(
			limitsNearBreaking([{ budgetId: "t", limit: 250_000, spent: 300_000 }])[0],
		).toMatchObject({ state: "over", left: -50_000 });
		expect(limitsNearBreaking([{ budgetId: "t", limit: 250_000, spent: 100_000 }])).toEqual([]);
	});

	it("leaves out a limit of nothing, which is not a limit", () => {
		expect(limitsNearBreaking([{ budgetId: "t", limit: 0, spent: 100_000 }])).toEqual([]);
	});

	it("puts what is broken above what is close", () => {
		const risks = limitsNearBreaking([
			{ budgetId: "close", limit: 100_000, spent: 90_000 },
			{ budgetId: "over", limit: 100_000, spent: 120_000 },
		]);
		expect(risks.map((one) => one.budgetId)).toEqual(["over", "close"]);
	});

	/**
	 * Why this is not the budget screen's own reading.
	 *
	 * Three numbers are a claim about a whole month. The pace rule reads a figure against how
	 * far through the month today is, which is right for a household writing records as they
	 * happen and wrong here: the same hundred thousand, read on the third, comes back as a
	 * warning about a month nobody has spent yet.
	 */
	it("reads the month whole, where the pace rule reads the day", () => {
		const paced = progressOf(
			{ id: "t", scope: "total", amount: 250_000 },
			[{ amount: -100_000, kind: "expense", categoryId: null, priority: null }],
			{ dayOfMonth: 3, daysInMonth: 30 },
		);
		expect(paced.state).toBe("tight");
		expect(limitsNearBreaking([{ budgetId: "t", limit: 250_000, spent: 100_000 }])).toEqual([]);
	});
});
