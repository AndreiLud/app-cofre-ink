import { describe, expect, it } from "vitest";
import type { Snapshot } from "./findings.ts";
import { leversIn, type PlanStep, planFrom } from "./plan.ts";

/**
 * A household with four months behind it, six thousand in and five thousand out, and
 * two thousand on hand. It keeps a thousand a month and has nowhere near a reserve,
 * which is the case most of this file exists for.
 */
function household(): Snapshot {
	return {
		today: "2026-09-20",
		onHand: 200_000,
		thisMonth: { month: "2026-09", income: 600_000, expense: 500_000 },
		before: [
			{ month: "2026-08", income: 600_000, expense: 500_000 },
			{ month: "2026-07", income: 600_000, expense: 500_000 },
			{ month: "2026-06", income: 600_000, expense: 500_000 },
			{ month: "2026-05", income: 600_000, expense: 500_000 },
		],
		categories: [],
		budgets: [],
		goals: [],
		repeating: [],
		pending: [],
		possibleRepeats: [],
	};
}

function step(steps: readonly PlanStep[], code: string): PlanStep {
	const found = steps.find((one) => one.code === code);
	if (!found) throw new Error(`no step ${code} in ${steps.map((one) => one.code).join(", ")}`);
	return found;
}

describe("the order of the steps", () => {
	it("puts one month of cover before three, and both before a goal", () => {
		const snapshot = household();
		snapshot.goals = [
			{
				goalId: "g1",
				name: "Viagem",
				target: 400_000,
				saved: 0,
				lastAddedOn: null,
				createdOn: "2026-09-01",
				dueOn: null,
			},
		];

		expect(planFrom(snapshot).steps.map((one) => one.code)).toEqual(["buffer", "reserve", "goal"]);
	});

	it("puts what is already owed in front of everything, with no date on it", () => {
		const snapshot = household();
		snapshot.onHand = 50_000;
		snapshot.pending = [
			{ description: "Fatura", amount: 300_000, dueOn: "2026-09-25", invoiceOf: "Nubank" },
		];

		const plan = planFrom(snapshot);
		expect(plan.steps[0]?.code).toBe("coverDues");
		// Two thousand five hundred short, and it is due this week rather than in a month.
		expect(plan.steps[0]?.amount).toBe(250_000);
		expect(plan.steps[0]?.finishesOn).toBeNull();
	});
});

describe("the months on each step", () => {
	it("counts from when the step before it finishes, because it is the same money", () => {
		const plan = planFrom(household());

		// Three thousand short of one month of cover, at a thousand a month.
		const buffer = step(plan.steps, "buffer");
		expect(buffer.amount).toBe(300_000);
		expect(buffer.everyMonth).toBe(100_000);
		expect(buffer.months).toBe(3);
		expect(buffer.finishesOn).toBe("2026-12");

		// Ten thousand more to reach three months, and it starts in December and not now.
		const reserve = step(plan.steps, "reserve");
		expect(reserve.amount).toBe(1_000_000);
		expect(reserve.months).toBe(10);
		expect(reserve.finishesOn).toBe("2027-10");
		expect(plan.doneOn).toBe("2027-10");
	});

	it("says a goal with a date arrives late, instead of quietly moving the date", () => {
		const snapshot = household();
		snapshot.goals = [
			{
				goalId: "g1",
				name: "Viagem",
				target: 400_000,
				saved: 0,
				lastAddedOn: null,
				createdOn: "2026-09-01",
				dueOn: "2027-06-01",
			},
		];

		const goal = step(planFrom(snapshot).steps, "goal");
		// It queues behind thirteen months of reserve, so the date they asked for is gone.
		expect(goal.finishesOn).toBe("2028-02");
		expect(goal.late).toBe(true);
	});

	it("leaves out a step that is already done", () => {
		const snapshot = household();
		// Four months of cover, which is past both lines.
		snapshot.onHand = 2_000_000;
		expect(planFrom(snapshot).steps).toEqual([]);
	});
});

describe("a month that does not close", () => {
	it("dates nothing, and says what it would take to have a tenth left over", () => {
		const snapshot = household();
		snapshot.before = snapshot.before.map((month) => ({ ...month, expense: 650_000 }));

		const plan = planFrom(snapshot);
		expect(plan.stuck).toBe(true);
		expect(plan.surplus).toBe(-50_000);
		expect(plan.doneOn).toBeNull();

		// Five hundred short of closing, and six hundred more to keep a tenth of it.
		expect(step(plan.steps, "freeUpMonthly").amount).toBe(110_000);
		// The reserve is still worth naming, it just cannot be given a month yet.
		expect(step(plan.steps, "buffer").months).toBe(0);
		expect(step(plan.steps, "buffer").finishesOn).toBeNull();
	});

	it("says nothing at all until there are three months to read", () => {
		const snapshot = household();
		snapshot.before = snapshot.before.slice(0, 2);
		expect(planFrom(snapshot).steps).toEqual([]);
	});
});

describe("where the month goes", () => {
	/** Four months of a category, so that a quietest month means something. */
	const category = (name: string, months: number[]) => ({
		categoryId: name,
		name,
		thisMonth: months[0] ?? 0,
		before: months,
	});

	it("measures what could be freed against their own quietest month, never a share", () => {
		const snapshot = household();
		snapshot.categories = [
			category("Mercado", [200_000, 180_000, 240_000, 200_000]),
			category("Restaurante", [90_000, 40_000, 110_000, 90_000]),
		];

		const { levers, frees } = leversIn(snapshot);
		expect(levers.map((one) => one.name)).toEqual(["Mercado", "Restaurante"]);

		const eating = levers[1];
		expect(eating?.usual).toBe(90_000);
		expect(eating?.best).toBe(40_000);
		// They have already had a five hundred cheaper month, once, without being told to.
		expect(eating?.frees).toBe(50_000);
		expect(eating?.shareOfIncome).toBe(15);

		// And the total is the sum of the rows above it, which somebody can check by eye.
		expect(frees).toBe(20_000 + 50_000);
	});

	it("leaves out a category with too little history to have a quietest month", () => {
		const snapshot = household();
		snapshot.categories = [
			category("Mercado", [200_000, 180_000, 240_000]),
			category("Dentista", [300_000, 10_000]),
		];

		expect(leversIn(snapshot).levers.map((one) => one.name)).toEqual(["Mercado"]);
	});

	it("names only the few biggest, because the rest is a spreadsheet", () => {
		const snapshot = household();
		snapshot.categories = Array.from({ length: 9 }, (_, index) =>
			category(`Categoria ${index}`, [100_000 - index * 1_000, 90_000, 80_000]),
		);

		expect(leversIn(snapshot).levers).toHaveLength(5);
		expect(leversIn(snapshot, 2).levers.map((one) => one.name)).toEqual([
			"Categoria 0",
			"Categoria 1",
		]);
	});
});
