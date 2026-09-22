import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	applyScenario,
	firstShortfall,
	type MonthlyAmounts,
	median,
	project,
} from "./projection.ts";

const history: MonthlyAmounts[] = [
	{ month: "2026-04", income: 500_000, expense: 400_000 },
	{ month: "2026-05", income: 500_000, expense: 420_000 },
	{ month: "2026-06", income: 500_000, expense: 380_000 },
	// One holiday, which is what an average would turn into a habit.
	{ month: "2026-07", income: 500_000, expense: 900_000 },
	{ month: "2026-08", income: 500_000, expense: 400_000 },
	{ month: "2026-09", income: 500_000, expense: 410_000 },
];

describe("the middle of the months behind", () => {
	it("is not moved by one unusual month", () => {
		expect(median([400_000, 420_000, 380_000, 900_000, 400_000, 410_000])).toBe(405_000);
	});

	it("answers for an empty history and for one month", () => {
		expect(median([])).toBe(0);
		expect(median([42])).toBe(42);
	});
});

describe("the months ahead", () => {
	it("adds up the three things and carries the balance", () => {
		const projected = project({
			opening: 1_000_000,
			from: "2026-10",
			months: 3,
			written: [{ month: "2026-10", income: 0, expense: 150_000 }],
			recurring: [
				{ month: "2026-10", income: 0, expense: 100_000 },
				{ month: "2026-11", income: 0, expense: 100_000 },
				{ month: "2026-12", income: 0, expense: 100_000 },
			],
			history,
		});

		expect(projected).toHaveLength(3);

		// October: a bill written, a subscription that repeats, and the habit for the
		// rest, which is the usual month minus what is already known about it.
		const october = projected[0];
		expect(october?.expenseFrom).toEqual({
			written: 150_000,
			recurring: 100_000,
			habitual: 155_000,
		});
		expect(october?.expense).toBe(405_000);
		expect(october?.income).toBe(500_000);
		expect(october?.balance).toBe(1_095_000);

		// November has nothing written, so the habit covers more of it.
		expect(projected[1]?.expenseFrom.written).toBe(0);
		expect(projected[1]?.expense).toBe(405_000);
		expect(projected[2]?.balance).toBe(1_285_000);
	});

	it("never counts what is already known twice", () => {
		const projected = project({
			opening: 0,
			from: "2026-10",
			months: 1,
			// A month where everything is already written, and more than usual.
			written: [{ month: "2026-10", income: 0, expense: 800_000 }],
			recurring: [],
			history,
		});

		expect(projected[0]?.expenseFrom.habitual).toBe(0);
		expect(projected[0]?.expense).toBe(800_000);
	});

	it("keeps to thirty six months, whatever it is asked for", () => {
		expect(
			project({ opening: 0, from: "2026-10", months: 120, written: [], recurring: [], history }),
		).toHaveLength(36);
		expect(
			project({ opening: 0, from: "2026-10", months: 0, written: [], recurring: [], history }),
		).toHaveLength(1);
	});

	it("says which month the money runs out", () => {
		const projected = project({
			opening: 100_000,
			from: "2026-10",
			months: 6,
			written: [],
			recurring: [{ month: "2026-10", income: 0, expense: 0 }],
			history: [
				{ month: "2026-09", income: 100_000, expense: 200_000 },
				{ month: "2026-08", income: 100_000, expense: 200_000 },
			],
		});

		// October ends at exactly nothing, which is not yet short. November is.
		expect(projected[0]?.balance).toBe(0);
		expect(firstShortfall(projected)).toBe("2026-11");
	});

	it("says nothing when the money never runs out", () => {
		expect(
			firstShortfall(
				project({
					opening: 1_000_000,
					from: "2026-10",
					months: 6,
					written: [],
					recurring: [],
					history,
				}),
			),
		).toBe(null);
	});
});

describe("trying something out", () => {
	const projected = project({
		opening: 0,
		from: "2026-10",
		months: 3,
		written: [],
		recurring: [],
		history,
	});

	it("takes a share off what goes out", () => {
		const cheaper = applyScenario(
			projected,
			{
				name: "Gastar um décimo a menos",
				adjustments: [{ kind: "expense", percent: -1000 }],
			},
			0,
		);

		expect(cheaper[0]?.expense).toBe(364_500);
		expect(cheaper[0]?.left).toBe(135_500);
		expect(cheaper[2]?.balance).toBe(406_500);
	});

	it("adds an amount from a month onwards", () => {
		const raised = applyScenario(
			projected,
			{
				name: "Aumento em novembro",
				adjustments: [{ kind: "income", amount: 50_000, from: "2026-11" }],
			},
			0,
		);

		expect(raised[0]?.income).toBe(500_000);
		expect(raised[1]?.income).toBe(550_000);
		expect(raised[2]?.income).toBe(550_000);
	});

	it("never takes a month below nothing", () => {
		const impossible = applyScenario(
			projected,
			{
				name: "Sem gastar nada",
				adjustments: [{ kind: "expense", percent: -20_000 }],
			},
			0,
		);

		expect(impossible[0]?.expense).toBe(0);
	});
});

describe("whatever it is given", () => {
	it("never throws and always adds up", () => {
		const amounts = fc.record({
			month: fc.constantFrom("2026-10", "2026-11", "2026-12"),
			income: fc.integer({ min: 0, max: 10_000_000 }),
			expense: fc.integer({ min: 0, max: 10_000_000 }),
		});

		fc.assert(
			fc.property(
				fc.integer({ min: -1_000_000, max: 10_000_000 }),
				fc.array(amounts, { maxLength: 6 }),
				fc.array(amounts, { maxLength: 6 }),
				(opening, written, past) => {
					const projected = project({
						opening,
						from: "2026-10",
						months: 12,
						written,
						recurring: [],
						history: past,
					});

					expect(
						projected.every(
							(month) =>
								month.income ===
									month.incomeFrom.written +
										month.incomeFrom.recurring +
										month.incomeFrom.habitual &&
								month.expense ===
									month.expenseFrom.written +
										month.expenseFrom.recurring +
										month.expenseFrom.habitual &&
								month.left === month.income - month.expense &&
								Number.isSafeInteger(month.balance),
						),
					).toBe(true);
				},
			),
			{ numRuns: 200 },
		);
	});
});
