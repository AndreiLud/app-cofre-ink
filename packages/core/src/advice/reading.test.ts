import { describe, expect, it } from "vitest";
import type { Snapshot } from "./findings.ts";
import { readingOf, type SignCode, type VitalSign, verdictFrom, vitalSigns } from "./reading.ts";

/**
 * A household in good shape, for each test to break in exactly one way.
 *
 * Six thousand a month in, four thousand out, fifteen thousand on hand. That is a third
 * left over and nearly four months of cover, which is every sign good.
 */
function healthy(): Snapshot {
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

function sign(signs: readonly VitalSign[], code: SignCode): VitalSign {
	const found = signs.find((one) => one.code === code);
	if (!found) throw new Error(`no sign ${code}`);
	return found;
}

describe("the four signs", () => {
	it("always answers with all four, in the order somebody asks for them", () => {
		expect(vitalSigns(healthy()).map((one) => one.code)).toEqual([
			"savingRate",
			"reserve",
			"committed",
			"repeatingLoad",
		]);
	});

	it("reads a household that is in good shape as good, on every one of them", () => {
		const signs = vitalSigns(healthy());
		expect(signs.map((one) => one.state)).toEqual(["good", "good", "good", "good"]);
		expect(verdictFrom(signs)).toBe("comfortable");
	});
});

describe("what is left over", () => {
	it("is a share of what comes in, and carries what it would take to reach the line", () => {
		const snapshot = healthy();
		snapshot.before = snapshot.before.map((month) => ({ ...month, expense: 570_000 }));

		const found = sign(vitalSigns(snapshot), "savingRate");
		// Five per cent left over, which is under the ten the line is drawn at.
		expect(found.value).toBe(5);
		expect(found.state).toBe("poor");
		expect(found.amounts.left).toBe(30_000);
		expect(found.amounts.wanted).toBe(60_000);
		expect(found.amounts.missing).toBe(30_000);
	});

	it("is fair between the two lines and good above the higher one", () => {
		const middling = healthy();
		middling.before = middling.before.map((month) => ({ ...month, expense: 510_000 }));
		expect(sign(vitalSigns(middling), "savingRate").state).toBe("fair");

		const generous = healthy();
		generous.before = generous.before.map((month) => ({ ...month, expense: 400_000 }));
		expect(sign(vitalSigns(generous), "savingRate").state).toBe("good");
	});
});

describe("the reserve", () => {
	it("is months of ordinary spending, in tenths, and says what a year of saving takes", () => {
		const snapshot = healthy();
		snapshot.money = 600_000;

		const found = sign(vitalSigns(snapshot), "reserve");
		// Six thousand on hand against four thousand a month is a month and a half.
		expect(found.value).toBe(15);
		expect(found.state).toBe("fair");
		expect(found.amounts.wanted).toBe(1_200_000);
		expect(found.amounts.missing).toBe(600_000);
		expect(found.amounts.everyMonth).toBe(50_000);
	});

	it("is poor under a single month of cover", () => {
		const snapshot = healthy();
		snapshot.money = 200_000;
		expect(sign(vitalSigns(snapshot), "reserve").state).toBe("poor");
		expect(verdictFrom(vitalSigns(snapshot))).toBe("tight");
	});
});

describe("what is about to be asked for", () => {
	// Part 2, J.6 of the request for 2.0.0: a logger's balance is made of their own rows, so
	// neither the reserve nor what falls due can be read for them.
	it("is unknown, with the reserve, when the money is not said", () => {
		const snapshot = healthy();
		snapshot.money = null;
		snapshot.owedOnCards = null;
		const signs = vitalSigns(snapshot);
		expect(sign(signs, "reserve").state).toBe("unknown");
		expect(sign(signs, "committed").state).toBe("unknown");
	});

	it("takes the cards off the reserve and not off what pays the bills", () => {
		const snapshot = healthy();
		snapshot.money = 120_000;
		snapshot.owedOnCards = 230_000;
		snapshot.cardInvoices = [
			{
				card: "Nubank",
				accountId: "Nubank",
				month: "2026-09",
				dueOn: "2026-09-25",
				left: 230_000,
				withoutRate: 0,
				scheduled: 0,
				scheduledOn: null,
				scheduledBy: null,
			},
		];
		const signs = vitalSigns(snapshot);
		expect(sign(signs, "committed").amounts).toMatchObject({
			due: 230_000,
			money: 120_000,
			short: 110_000,
			count: 1,
		});
		// No reserve at all, said as nothing and never as a negative month.
		expect(sign(signs, "reserve").value).toBe(0);
		expect(sign(signs, "reserve").state).toBe("poor");
	});

	it("needs no history at all, which is what makes it readable in week one", () => {
		const snapshot = healthy();
		snapshot.before = [];
		snapshot.bills = [
			{
				description: "Aluguel",
				amount: 300_000,
				day: "2026-09-25",
				kind: "expense",
				status: "settled",
				invoiceMonth: null,
				onCardWithCycle: false,
				onBenefitCard: false,
			},
		];

		const signs = vitalSigns(snapshot);
		expect(signs.filter((one) => one.state === "unknown").map((one) => one.code)).toEqual([
			"savingRate",
			"reserve",
			"repeatingLoad",
		]);
		// Three thousand due against fifteen thousand on hand is a fifth of it.
		expect(sign(signs, "committed").value).toBe(20);
		expect(sign(signs, "committed").state).toBe("good");
	});

	it("leaves out what is further off than the next fortnight", () => {
		const snapshot = healthy();
		snapshot.bills = [
			{
				description: "Aluguel",
				amount: 300_000,
				day: "2026-09-25",
				kind: "expense",
				status: "settled",
				invoiceMonth: null,
				onCardWithCycle: false,
				onBenefitCard: false,
			},
			{
				description: "Escola",
				amount: 900_000,
				day: "2026-11-10",
				kind: "expense",
				status: "settled",
				invoiceMonth: null,
				onCardWithCycle: false,
				onBenefitCard: false,
			},
		];

		expect(sign(vitalSigns(snapshot), "committed").amounts.due).toBe(300_000);
		expect(sign(vitalSigns(snapshot), "committed").amounts.count).toBe(1);
	});

	it("is poor when something is due and there is nothing to pay it with", () => {
		const snapshot = healthy();
		snapshot.money = 0;
		snapshot.cardInvoices = [
			{
				card: "Nubank",
				accountId: "Nubank",
				month: "2026-09",
				dueOn: "2026-09-22",
				left: 120_000,
				withoutRate: 0,
				scheduled: 0,
				scheduledOn: null,
				scheduledBy: null,
			},
		];

		const found = sign(vitalSigns(snapshot), "committed");
		expect(found.state).toBe("poor");
		expect(found.amounts.short).toBe(120_000);
	});

	it("is good when nothing is due, even with nothing on hand", () => {
		const snapshot = healthy();
		snapshot.money = 0;
		expect(sign(vitalSigns(snapshot), "committed").state).toBe("good");
	});
});

describe("what repeats", () => {
	it("counts only what has happened three times, as a share of what comes in", () => {
		const snapshot = healthy();
		snapshot.repeating = [
			{ description: "streaming", amount: 5_000, previousAmount: 5_000, occurrences: 6 },
			{ description: "academia", amount: 15_000, previousAmount: 15_000, occurrences: 4 },
			// Twice is two purchases, and it is left out of the load entirely.
			{ description: "passagem", amount: 200_000, previousAmount: null, occurrences: 2 },
		];

		const found = sign(vitalSigns(snapshot), "repeatingLoad");
		expect(found.amounts.everyMonth).toBe(20_000);
		expect(found.amounts.everyYear).toBe(240_000);
		expect(found.amounts.count).toBe(2);
		// Two hundred against six thousand coming in is three per cent.
		expect(found.value).toBe(3);
		expect(found.state).toBe("good");
	});

	/**
	 * Against what goes out, rather than against what comes in, this would read close to
	 * a hundred for any tidy household: rent, power and the shop are most of an ordinary
	 * month and all three of them repeat. A sign that is poor for somebody who is doing
	 * fine is the most expensive mistake a screen like this can make.
	 */
	it("does not call a household poor for having ordinary fixed costs", () => {
		const snapshot = healthy();
		snapshot.repeating = [
			// Every last thing they spend repeats, and they still keep a third of what
			// they earn.
			{ description: "aluguel", amount: 400_000, previousAmount: 400_000, occurrences: 6 },
		];

		const found = sign(vitalSigns(snapshot), "repeatingLoad");
		expect(found.value).toBe(67);
		expect(found.state).toBe("fair");
		expect(verdictFrom(vitalSigns(snapshot))).toBe("steady");
	});

	it("is poor when most of what comes in is spoken for before anybody decides", () => {
		const snapshot = healthy();
		snapshot.repeating = [
			{ description: "aluguel", amount: 500_000, previousAmount: 500_000, occurrences: 6 },
		];
		expect(sign(vitalSigns(snapshot), "repeatingLoad").value).toBe(83);
		expect(sign(vitalSigns(snapshot), "repeatingLoad").state).toBe("poor");
	});
});

describe("the state of the money", () => {
	it("is too soon to say all is well until every sign can be read", () => {
		const snapshot = healthy();
		snapshot.before = [
			{ month: "2026-08", income: 600_000, expense: 400_000 },
			{ month: "2026-07", income: 600_000, expense: 400_000 },
		];

		// Fifteen thousand on hand and nothing due reads as good on the one sign that
		// needs no history. That is not a clean bill of health, and saying so on a
		// fortnight of records would be the most confident thing this file ever said.
		expect(sign(vitalSigns(snapshot), "committed").state).toBe("good");
		expect(verdictFrom(vitalSigns(snapshot))).toBe("tooSoon");
	});

	it("still calls a problem a problem in the first week, before any history exists", () => {
		const snapshot = healthy();
		snapshot.before = [];
		snapshot.money = 20_000;
		snapshot.bills = [
			{
				description: "Aluguel",
				amount: 300_000,
				day: "2026-09-25",
				kind: "expense",
				status: "settled",
				invoiceMonth: null,
				onCardWithCycle: false,
				onBenefitCard: false,
			},
		];

		expect(verdictFrom(vitalSigns(snapshot))).toBe("tight");
	});

	it("is tight when any sign is poor, whatever the others say", () => {
		const snapshot = healthy();
		snapshot.money = 100_000;
		expect(verdictFrom(vitalSigns(snapshot))).toBe("tight");
	});

	it("is steady when nothing is poor and something is not yet good", () => {
		const snapshot = healthy();
		snapshot.before = snapshot.before.map((month) => ({ ...month, expense: 510_000 }));
		snapshot.money = 2_000_000;
		expect(verdictFrom(vitalSigns(snapshot))).toBe("steady");
	});
});

describe("the whole reading", () => {
	it("carries the verdict, the signs, the months behind it and everything found", () => {
		const snapshot = healthy();
		snapshot.thisMonth = { month: "2026-09", income: 600_000, expense: 900_000 };

		const reading = readingOf(snapshot);
		expect(reading.today).toBe("2026-09-20");
		expect(reading.monthsRead).toBe(4);
		expect(reading.signs).toHaveLength(4);
		expect(reading.findings.map((one) => one.code)).toContain("spentMoreThanEarned");
	});
});
