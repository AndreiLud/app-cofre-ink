import { describe, expect, it } from "vitest";
import type { DueInvoice, DueRecord } from "../cards/whatFallsDue.ts";
import { median } from "../plan/projection.ts";
import { type Finding, findEverything, type Snapshot } from "./findings.ts";

/** A month where nothing is wrong, for each test to break in exactly one way. */
function quiet(): Snapshot {
	return {
		today: "2026-09-20",
		money: 1_500_000,
		owedOnCards: 0,
		bills: [],
		cardInvoices: [],
		availableAnyDay: 0,
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
		possibleRepeats: [],
		netByMonth: [],
		invoices: [],
		instalments: [],
		incomeSources: [],
		longer: [],
		inflation: null,
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

/** An invoice of a card, due on a day, for what is left on it. */
function invoiceOf(card: string, dueOn: string, left: number): DueInvoice {
	return {
		card,
		accountId: card,
		month: dueOn.slice(0, 7),
		dueOn,
		left,
		withoutRate: 0,
		scheduled: 0,
		scheduledOn: null,
		scheduledBy: null,
	};
}

/** A record of money out still to come. */
function billOf(description: string, day: string, amount: number): DueRecord {
	return {
		description,
		amount,
		day,
		kind: "expense",
		status: "settled",
		invoiceMonth: null,
		onCardWithCycle: false,
		onBenefitCard: false,
	};
}

/** The findings about what falls due, which are the only ones these tests look at. */
function dueFindings(snapshot: Snapshot): Finding[] {
	return findEverything(snapshot).filter(
		(finding) => finding.code === "invoiceOverBalance" || finding.code === "duesOverBalance",
	);
}

// Part 2, J of the request for 2.0.0: with nothing falling due and the money negative, it said
// that one bill of R$ 0,00 fell due, and the money had the cards netted off it.
describe("what falls due", () => {
	it("says the invoice when it is the only bill, against the money in the accounts", () => {
		const snapshot = quiet();
		snapshot.money = 120_000;
		snapshot.owedOnCards = 230_000;
		snapshot.cardInvoices = [invoiceOf("Nubank", "2026-09-25", 230_000)];

		const found = dueFindings(snapshot);
		expect(codes(found)).toEqual(["invoiceOverBalance"]);
		expect(found[0]?.subject).toBe("Nubank");
		expect(found[0]?.amounts).toMatchObject({ short: 110_000, days: 5, money: 120_000 });
	});

	it("says all the bills in one sentence when there are more than one", () => {
		const snapshot = quiet();
		snapshot.money = 120_000;
		snapshot.cardInvoices = [
			invoiceOf("Nubank", "2026-09-25", 90_000),
			invoiceOf("Itaú", "2026-09-28", 80_000),
		];
		const found = dueFindings(snapshot);
		expect(codes(found)).toEqual(["duesOverBalance"]);
		expect(found[0]?.amounts).toMatchObject({ count: 2, short: 50_000 });

		// Two invoices each larger than the money: still one finding, of the whole.
		snapshot.money = 100_000;
		snapshot.cardInvoices = [
			invoiceOf("Nubank", "2026-09-25", 150_000),
			invoiceOf("Itaú", "2026-09-28", 130_000),
		];
		const both = dueFindings(snapshot);
		expect(codes(both)).toEqual(["duesOverBalance"]);
		expect(both[0]?.amounts.short).toBe(180_000);
		expect(both[0]?.subject).toBe("Nubank");
	});

	it("says nothing when nothing falls due, however negative the money is", () => {
		const snapshot = quiet();
		snapshot.money = -111_420;
		expect(dueFindings(snapshot)).toEqual([]);
	});

	it("adds up records too, and names the largest", () => {
		const snapshot = quiet();
		snapshot.money = 100_000;
		snapshot.bills = [billOf("Aluguel", "2026-09-25", 90_000), billOf("Luz", "2026-09-28", 40_000)];

		const found = dueFindings(snapshot);
		expect(found[0]?.code).toBe("duesOverBalance");
		expect(found[0]?.subject).toBe("Aluguel");
		expect(found[0]?.amounts).toMatchObject({ short: 30_000, count: 2, subjectIsInvoice: 0 });
	});

	it("ignores what is due next month, because that is next month's problem", () => {
		const snapshot = quiet();
		snapshot.money = 1_000;
		snapshot.bills = [billOf("Aluguel", "2026-10-25", 90_000)];
		expect(dueFindings(snapshot)).toEqual([]);
	});

	it("says which invoice has a purchase with no rate, and leaves it out of the sum", () => {
		const snapshot = quiet();
		snapshot.money = 10_000;
		snapshot.cardInvoices = [{ ...invoiceOf("Nubank", "2026-09-25", 230_000), withoutRate: 1 }];
		const found = findEverything(snapshot);
		expect(codes(found)).toContain("invoiceUncounted");
		expect(dueFindings(snapshot)).toEqual([]);
	});

	it("says nothing about money when the money is not said, as for a logger", () => {
		const snapshot = quiet();
		snapshot.money = null;
		snapshot.owedOnCards = null;
		snapshot.cardInvoices = [invoiceOf("Nubank", "2026-09-25", 230_000)];
		snapshot.before = snapshot.before.map((month) => ({ ...month, expense: 570_000 }));
		const found = codes(findEverything(snapshot));
		for (const code of [
			"invoiceOverBalance",
			"duesOverBalance",
			"thinReserve",
			"cardsOverAccounts",
			"idleCash",
			"lowSavingRate",
		]) {
			expect(found).not.toContain(code);
		}
	});
});

describe("what is put aside", () => {
	it("measures the reserve in months of an ordinary month, and says the way out", () => {
		const snapshot = quiet();
		snapshot.money = 600_000;

		const finding = one(findEverything(snapshot), "thinReserve");
		expect(finding.weight).toBe("attention");
		// Six hundred thousand against an ordinary month of four hundred: a month and a half.
		expect(finding.amounts.covers).toBe(15);
		expect(finding.amounts.wanted).toBe(1_200_000);
		expect(finding.amounts.everyMonth).toBe(50_000);
	});

	it("takes what the cards owe off the reserve, and says so", () => {
		const snapshot = quiet();
		snapshot.money = 1_500_000;
		snapshot.owedOnCards = 900_000;

		const finding = one(findEverything(snapshot), "thinReserve");
		expect(finding.amounts).toMatchObject({
			money: 1_500_000,
			cards: 900_000,
			reserve: 600_000,
			covers: 15,
		});
	});

	it("says what the cards owe beyond the accounts, rather than a negative month", () => {
		const snapshot = quiet();
		snapshot.money = 120_000;
		snapshot.owedOnCards = 230_000;

		const found = findEverything(snapshot);
		expect(codes(found)).not.toContain("thinReserve");
		expect(one(found, "cardsOverAccounts").amounts.short).toBe(110_000);
	});

	it("calls it a problem when there is less than one month of it", () => {
		const snapshot = quiet();
		snapshot.money = 200_000;
		expect(one(findEverything(snapshot), "thinReserve").weight).toBe("problem");
	});

	it("says when rather more is sitting there than the next months need", () => {
		const snapshot = quiet();
		snapshot.money = 3_000_000;

		const finding = one(findEverything(snapshot), "idleCash");
		expect(finding.weight).toBe("good");
		expect(finding.amounts.spare).toBe(1_800_000);
	});

	// Part 2, H.10.3 of the request for 2.0.0: a caixinha is not counted in the reserve, and
	// the sentence names it as information.
	it("names the holdings that come out the same day without counting them", () => {
		const snapshot = quiet();
		snapshot.money = 200_000;
		snapshot.availableAnyDay = 1_000_000;
		const thin = one(findEverything(snapshot), "thinReserve");
		expect(thin.amounts).toMatchObject({ missing: 1_000_000, availableAnyDay: 1_000_000 });

		snapshot.money = 2_000_000;
		snapshot.availableAnyDay = 1_500_000;
		expect(one(findEverything(snapshot), "idleCash").amounts.spare).toBe(800_000);
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
				createdOn: "2026-04-01",
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
				createdOn: "2026-04-01",
				dueOn: "2027-03-01",
			},
		];
		expect(codes(findEverything(snapshot))).not.toContain("goalStalled");
	});

	/**
	 * A goal set up this morning has never been fed, and by the old reading that made it
	 * stalled from the moment it was saved: "nothing has gone in for nought days".
	 */
	it("leaves a goal nobody has fed yet alone, until it is old enough to have stopped", () => {
		const untouched = {
			goalId: "g1",
			name: "Viagem",
			target: 1_000_000,
			saved: 0,
			lastAddedOn: null,
			createdOn: "2026-09-18",
			dueOn: null,
		};

		const snapshot = quiet();
		snapshot.goals = [untouched];
		expect(codes(findEverything(snapshot))).not.toContain("goalStalled");

		// And once it has sat there for months with nothing in it, it is said.
		const older = quiet();
		older.goals = [{ ...untouched, createdOn: "2026-06-01" }];
		expect(one(findEverything(older), "goalStalled").amounts.days).toBe(111);
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
