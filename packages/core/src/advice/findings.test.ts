import { describe, expect, it } from "vitest";
import { median } from "../plan/projection.ts";
import { type Finding, findEverything, type Snapshot } from "./findings.ts";

/** A month where nothing is wrong, for each test to break in exactly one way. */
function quiet(): Snapshot {
	return {
		today: "2026-09-20",
		onHand: 1_500_000,
		thisMonth: { month: "2026-09", income: 600_000, expense: 400_000 },
		before: [
			{ month: "2026-08", income: 600_000, expense: 400_000 },
			{ month: "2026-07", income: 600_000, expense: 400_000 },
			{ month: "2026-06", income: 600_000, expense: 400_000 },
			{ month: "2026-05", income: 600_000, expense: 400_000 },
		],
		categories: [],
		budgets: [],
		goals: [],
		repeating: [],
		pending: [],
		possibleRepeats: [],
	};
}

function codes(found: readonly Finding[]): string[] {
	return found.map((one) => one.code);
}

function one(found: readonly Finding[], code: string): Finding {
	const match = found.find((finding) => finding.code === code);
	if (!match) throw new Error(`no finding ${code} in ${codes(found).join(", ")}`);
	return match;
}

describe("the middle value", () => {
	it("is the middle of an odd list and the mean of the two middles of an even one", () => {
		expect(median([10, 30, 20])).toBe(20);
		expect(median([10, 20, 30, 40])).toBe(25);
		expect(median([])).toBe(0);
	});

	it("is not moved by one unusual month, which is the whole reason it is used", () => {
		expect(median([100, 100, 100, 5000])).toBe(100);
	});
});

describe("a quiet month", () => {
	it("says nothing at all", () => {
		expect(findEverything(quiet())).toEqual([]);
	});
});

describe("the month itself", () => {
	it("says when more went out than came in, and by how much", () => {
		const snapshot = quiet();
		snapshot.thisMonth = { month: "2026-09", income: 600_000, expense: 750_000 };

		const finding = one(findEverything(snapshot), "spentMoreThanEarned");
		expect(finding.weight).toBe("problem");
		expect(finding.amounts.over).toBe(150_000);
		expect(finding.amounts.percent).toBe(25);
	});

	it("says when the month went better than usual, but only once it is nearly over", () => {
		const early = quiet();
		early.today = "2026-09-05";
		early.thisMonth = { month: "2026-09", income: 600_000, expense: 250_000 };
		expect(codes(findEverything(early))).not.toContain("betterThanUsual");

		const late = quiet();
		late.today = "2026-09-28";
		late.thisMonth = { month: "2026-09", income: 600_000, expense: 250_000 };
		expect(one(findEverything(late), "betterThanUsual").amounts.saved).toBe(150_000);
	});
});

describe("a category against its usual month", () => {
	it("is only compared once there are three months to compare against", () => {
		const snapshot = quiet();
		snapshot.categories = [
			{ categoryId: "c1", name: "Restaurante", thisMonth: 90_000, before: [20_000, 20_000] },
		];
		expect(findEverything(snapshot)).toEqual([]);
	});

	it("says which one went up, against what, and by how much", () => {
		const snapshot = quiet();
		snapshot.categories = [
			{
				categoryId: "c1",
				name: "Restaurante",
				thisMonth: 90_000,
				before: [20_000, 25_000, 20_000, 30_000],
			},
		];

		const finding = one(findEverything(snapshot), "categoryAboveUsual");
		expect(finding.subject).toBe("Restaurante");
		expect(finding.amounts.usual).toBe(22_500);
		expect(finding.amounts.difference).toBe(67_500);
		expect(finding.amounts.percent).toBe(300);
	});

	it("says which one went down, because a month is not only bad news", () => {
		const snapshot = quiet();
		snapshot.categories = [
			{
				categoryId: "c1",
				name: "Mercado",
				thisMonth: 40_000,
				before: [100_000, 100_000, 100_000],
			},
		];

		const finding = one(findEverything(snapshot), "categoryBelowUsual");
		expect(finding.weight).toBe("good");
		expect(finding.amounts.difference).toBe(60_000);
	});

	it("ignores a difference too small to be worth a line on a screen", () => {
		const snapshot = quiet();
		snapshot.categories = [
			{ categoryId: "c1", name: "Padaria", thisMonth: 8_000, before: [5_000, 5_000, 5_000] },
		];
		expect(findEverything(snapshot)).toEqual([]);
	});
});

describe("a budget", () => {
	it("says when it is past its limit and by how much", () => {
		const snapshot = quiet();
		snapshot.budgets = [{ categoryId: "c1", name: "Lazer", limit: 50_000, spent: 78_000 }];

		const finding = one(findEverything(snapshot), "budgetPassed");
		expect(finding.weight).toBe("problem");
		expect(finding.amounts.over).toBe(28_000);
	});

	it("says when the money is going faster than the month, and where it lands", () => {
		const snapshot = quiet();
		// Two thirds of the month's money, on the twentieth of a thirty day month.
		snapshot.budgets = [{ categoryId: "c1", name: "Mercado", limit: 60_000, spent: 48_000 }];

		const finding = one(findEverything(snapshot), "budgetPace");
		expect(finding.amounts.percent).toBe(80);
		// Eighty per cent spent with two thirds gone lands at seventy two thousand.
		expect(finding.amounts.atThisRate).toBe(72_000);
		expect(finding.amounts.over).toBe(12_000);
	});

	it("says nothing about the pace at the very end of the month", () => {
		const snapshot = quiet();
		snapshot.today = "2026-09-29";
		snapshot.budgets = [{ categoryId: "c1", name: "Mercado", limit: 60_000, spent: 59_000 }];
		expect(codes(findEverything(snapshot))).not.toContain("budgetPace");
	});
});

describe("what repeats", () => {
	it("adds up only what has happened enough times to be a habit", () => {
		const snapshot = quiet();
		snapshot.repeating = [
			{ description: "Streaming", amount: 2_790, previousAmount: 2_790, occurrences: 8 },
			{ description: "Academia", amount: 12_000, previousAmount: 12_000, occurrences: 5 },
			{ description: "Curso", amount: 40_000, previousAmount: null, occurrences: 2 },
		];

		const finding = one(findEverything(snapshot), "subscriptionLoad");
		expect(finding.amounts.count).toBe(2);
		expect(finding.amounts.everyMonth).toBe(14_790);
		expect(finding.amounts.everyYear).toBe(177_480);
	});

	it("says when one of them costs more than it did, and what that is in a year", () => {
		const snapshot = quiet();
		snapshot.repeating = [
			{ description: "Streaming", amount: 3_990, previousAmount: 2_790, occurrences: 9 },
		];

		const finding = one(findEverything(snapshot), "subscriptionRose");
		expect(finding.subject).toBe("Streaming");
		expect(finding.amounts.rise).toBe(1_200);
		expect(finding.amounts.everyYear).toBe(14_400);
	});

	it("says nothing about a bill that moved a little, because usage moves a bill", () => {
		const snapshot = quiet();
		snapshot.repeating = [
			{ description: "Luz", amount: 20_400, previousAmount: 20_000, occurrences: 9 },
		];
		expect(codes(findEverything(snapshot))).not.toContain("subscriptionRose");
	});

	it("passes on a pair that looks like the same charge twice", () => {
		const snapshot = quiet();
		snapshot.possibleRepeats = [
			{
				description: "Mercado do bairro",
				amount: 18_990,
				first: "2026-09-14",
				second: "2026-09-15",
				account: "Cartão",
			},
		];

		const finding = one(findEverything(snapshot), "chargedTwice");
		expect(finding.amounts.days).toBe(1);
	});
});

describe("what falls due", () => {
	it("says when a card invoice is bigger than the money there is", () => {
		const snapshot = quiet();
		snapshot.onHand = 80_000;
		snapshot.pending = [
			{ description: "Fatura", amount: 210_000, dueOn: "2026-09-25", invoiceOf: "Nubank" },
		];

		const finding = one(findEverything(snapshot), "invoiceOverBalance");
		expect(finding.subject).toBe("Nubank");
		expect(finding.amounts.short).toBe(130_000);
		expect(finding.amounts.days).toBe(5);
	});

	it("adds the rest up when no single one is the problem", () => {
		const snapshot = quiet();
		snapshot.onHand = 100_000;
		snapshot.pending = [
			{ description: "Aluguel", amount: 90_000, dueOn: "2026-09-25", invoiceOf: null },
			{ description: "Luz", amount: 40_000, dueOn: "2026-09-28", invoiceOf: null },
		];

		const finding = one(findEverything(snapshot), "duesOverBalance");
		expect(finding.amounts.short).toBe(30_000);
		expect(finding.amounts.count).toBe(2);
	});

	it("ignores what is due next month, because that is next month's problem", () => {
		const snapshot = quiet();
		snapshot.onHand = 1_000;
		snapshot.pending = [
			{ description: "Aluguel", amount: 90_000, dueOn: "2026-10-25", invoiceOf: null },
		];
		expect(codes(findEverything(snapshot))).not.toContain("duesOverBalance");
	});
});

describe("what is put aside", () => {
	it("measures the reserve in months of an ordinary month, and says the way out", () => {
		const snapshot = quiet();
		snapshot.onHand = 600_000;

		const finding = one(findEverything(snapshot), "thinReserve");
		expect(finding.weight).toBe("attention");
		// Six hundred thousand against an ordinary month of four hundred: a month and a half.
		expect(finding.amounts.covers).toBe(15);
		expect(finding.amounts.wanted).toBe(1_200_000);
		expect(finding.amounts.everyMonth).toBe(50_000);
	});

	it("calls it a problem when there is less than one month of it", () => {
		const snapshot = quiet();
		snapshot.onHand = 200_000;
		expect(one(findEverything(snapshot), "thinReserve").weight).toBe("problem");
	});

	it("says when rather more is sitting there than the next months need", () => {
		const snapshot = quiet();
		snapshot.onHand = 3_000_000;

		const finding = one(findEverything(snapshot), "idleCash");
		expect(finding.weight).toBe("good");
		expect(finding.amounts.spare).toBe(1_800_000);
	});

	it("says when almost nothing is left over each month", () => {
		const snapshot = quiet();
		snapshot.before = snapshot.before.map((month) => ({ ...month, expense: 570_000 }));

		const finding = one(findEverything(snapshot), "lowSavingRate");
		expect(finding.amounts.percent).toBe(5);
		expect(finding.amounts.wanted).toBe(60_000);
		expect(finding.amounts.missing).toBe(30_000);
	});

	it("says which goal stopped, and what a month it takes to still arrive", () => {
		const snapshot = quiet();
		snapshot.goals = [
			{
				goalId: "g1",
				name: "Viagem",
				target: 1_000_000,
				saved: 400_000,
				lastAddedOn: "2026-05-01",
				dueOn: "2027-03-01",
			},
		];

		const finding = one(findEverything(snapshot), "goalStalled");
		expect(finding.amounts.still).toBe(600_000);
		expect(finding.amounts.months).toBe(6);
		expect(finding.amounts.everyMonth).toBe(100_000);
	});

	it("leaves a goal alone while somebody is still putting money into it", () => {
		const snapshot = quiet();
		snapshot.goals = [
			{
				goalId: "g1",
				name: "Viagem",
				target: 1_000_000,
				saved: 400_000,
				lastAddedOn: "2026-09-01",
				dueOn: "2027-03-01",
			},
		];
		expect(codes(findEverything(snapshot))).not.toContain("goalStalled");
	});
});

describe("the order", () => {
	it("puts a problem before something to watch, and both before good news", () => {
		const snapshot = quiet();
		snapshot.thisMonth = { month: "2026-09", income: 600_000, expense: 800_000 };
		snapshot.budgets = [{ categoryId: "c1", name: "Lazer", limit: 50_000, spent: 78_000 }];
		snapshot.categories = [
			{ categoryId: "c2", name: "Mercado", thisMonth: 40_000, before: [100_000, 100_000, 100_000] },
		];

		const weights = findEverything(snapshot).map((finding) => finding.weight);
		expect(weights[0]).toBe("problem");
		expect(weights[weights.length - 1]).toBe("good");
	});

	it("puts the heavier of two problems first", () => {
		const snapshot = quiet();
		snapshot.budgets = [
			{ categoryId: "c1", name: "Pequeno", limit: 50_000, spent: 60_000 },
			{ categoryId: "c2", name: "Grande", limit: 50_000, spent: 200_000 },
		];

		expect(findEverything(snapshot)[0]?.subject).toBe("Grande");
	});
});
