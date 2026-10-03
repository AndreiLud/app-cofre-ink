import { describe, expect, it } from "vitest";
import type { CardCycle } from "./invoice.ts";
import { amountToPay, invoiceStateOf, invoicesInTurn, limitLeftOf } from "./invoiceState.ts";

// A card that closes on the third and falls due on the tenth, as the sample data has.
const early: CardCycle = { closingDay: 3, dueDay: 10 };

function state(over: Partial<Parameters<typeof invoiceStateOf>[0]> = {}) {
	return invoiceStateOf({
		month: "2026-10",
		cycle: early,
		charged: 128_450,
		paid: 0,
		today: "2026-09-29",
		...over,
	});
}

describe("the days of an invoice", () => {
	it("says the days it covers, the day it closes and the day it falls due", () => {
		const one = state();
		expect(one.from).toBe("2026-09-03");
		expect(one.to).toBe("2026-10-02");
		expect(one.closesOn).toBe("2026-10-03");
		expect(one.dueOn).toBe("2026-10-10");
	});

	it("counts the days to each, and turns them negative once they pass", () => {
		expect(state().daysToClose).toBe(4);
		expect(state().daysToDue).toBe(11);
		expect(state({ today: "2026-10-15" }).daysToClose).toBe(-12);
		expect(state({ today: "2026-10-15" }).daysToDue).toBe(-5);
	});

	it("is open until the closing day, and closed on it", () => {
		expect(state({ today: "2026-10-02" }).closed).toBe(false);
		expect(state({ today: "2026-10-03" }).closed).toBe(true);
	});
});

describe("where an invoice stands", () => {
	it("is open while nothing has been paid", () => {
		const one = state();
		expect(one.standing).toBe("open");
		expect(one.left).toBe(128_450);
	});

	it("is partly paid when something has", () => {
		const one = state({ paid: 50_000 });
		expect(one.standing).toBe("partlyPaid");
		expect(one.left).toBe(78_450);
	});

	it("is paid when the whole of it has", () => {
		const one = state({ paid: 128_450 });
		expect(one.standing).toBe("paid");
		expect(one.left).toBe(0);
	});

	it("is in credit when more was paid than charged, which people do on purpose", () => {
		const one = state({ paid: 150_000 });
		expect(one.standing).toBe("inCredit");
		expect(one.left).toBe(-21_550);
	});

	it("is open, and not paid, when it charged nothing", () => {
		expect(state({ charged: 0 }).standing).toBe("open");
	});

	it("reopens when a purchase lands on it after it was paid", () => {
		// What a purchase moved onto a paid invoice does. The payment is money that left
		// the account and does not move; the invoice says what is left.
		const one = state({ charged: 128_450, paid: 128_450 });
		expect(one.standing).toBe("paid");
		const after = state({ charged: 148_450, paid: 128_450 });
		expect(after.standing).toBe("partlyPaid");
		expect(after.left).toBe(20_000);
	});
});

// Part 1, A.6 of the request for 2.0.0. Only a payment with no invoice named on it used to
// move on, so an invoice paid too much by its own button said "paid, with credit", and the
// next one asked for the whole of what it charged.
describe("credit handed on", () => {
	const card = (months: [string, number, number][]) =>
		invoicesInTurn(
			months.map(([month, charged, paid]) => ({
				month,
				cycle: early,
				charged,
				paid,
				today: "2026-11-11",
			})),
		);

	it("pays the next invoice with what was paid too much on one", () => {
		const [october, november] = card([
			["2026-11", 80_000, 0],
			["2026-10", 100_000, 150_000],
		]);
		expect(october?.month).toBe("2026-10");
		expect([october?.standing, october?.left, october?.carriedOut]).toEqual(["paid", 0, 50_000]);
		expect([november?.standing, november?.left, november?.carriedIn]).toEqual([
			"partlyPaid",
			30_000,
			50_000,
		]);
		expect(november?.late).toBe(true);
	});

	it("does the same for a purchase taken off an invoice already paid", () => {
		const [, november] = card([
			["2026-10", 80_000, 100_000],
			["2026-11", 50_000, 0],
		]);
		expect(november?.left).toBe(30_000);
	});

	it("goes on through as many invoices as it covers, and never back", () => {
		const states = card([
			["2026-09", 40_000, 0],
			["2026-10", 10_000, 100_000],
			["2026-11", 30_000, 0],
			["2026-12", 30_000, 0],
		]);
		expect(states.map((one) => one.left)).toEqual([40_000, 0, 0, -30_000]);
		expect(states.at(-1)?.standing).toBe("inCredit");
		// The older invoice is paid by what is meant for it, and is still owed.
		expect(states[0]?.carriedIn).toBe(0);
	});
});

describe("whether it is late", () => {
	it("is not late before the day it falls due", () => {
		expect(state({ today: "2026-10-10" }).late).toBe(false);
	});

	it("is late the day after, while anything is still owed", () => {
		expect(state({ today: "2026-10-11" }).late).toBe(true);
	});

	it("is not late once it is paid, however long ago it fell due", () => {
		expect(state({ today: "2026-12-01", paid: 128_450 }).late).toBe(false);
	});
});

describe("what a payment is offered for", () => {
	it("offers what is left, and not what was charged", () => {
		expect(amountToPay(state({ paid: 50_000 }))).toBe(78_450);
	});

	// A payment dated ahead is not paid yet, and it is not something to pay again either.
	it("leaves a scheduled payment owing, and does not offer it a second time", () => {
		const waiting = state({ charged: 200_000, scheduled: 200_000, scheduledOn: "2026-10-10" });
		expect(waiting.left).toBe(200_000);
		expect(waiting.standing).toBe("open");
		expect(waiting.scheduledOn).toBe("2026-10-10");
		expect(amountToPay(waiting)).toBe(0);
		expect(amountToPay(state({ charged: 200_000, scheduled: 50_000 }))).toBe(150_000);
		expect(state({ charged: 200_000 }).scheduledOn).toBe(null);
	});

	it("offers nothing on an invoice that is already in credit", () => {
		expect(amountToPay(state({ paid: 150_000 }))).toBe(0);
	});
});

describe("how much of the limit is left", () => {
	const inThree = [
		state({ month: "2026-10", charged: 30_000, paid: 0 }),
		state({ month: "2026-11", charged: 30_000, paid: 0 }),
		state({ month: "2026-12", charged: 30_000, paid: 0 }),
	];

	it("takes what is owed and the instalments still to come off once", () => {
		expect(limitLeftOf({ creditLimit: 500_000, states: inThree })).toBe(410_000);
	});

	it("gives the headroom back as the invoices are paid", () => {
		const paid = [
			state({ month: "2026-10", charged: 30_000, paid: 30_000 }),
			state({ month: "2026-11", charged: 30_000, paid: 0 }),
			state({ month: "2026-12", charged: 30_000, paid: 0 }),
		];
		expect(limitLeftOf({ creditLimit: 500_000, states: paid })).toBe(440_000);
	});

	// Credit the card holds is headroom, which is what the bank does with it. Release 1.2.1
	// left it out, and with nothing to carry it forward the credit was simply lost.
	it("counts the credit a card holds as headroom", () => {
		const credited = invoicesInTurn([
			{ month: "2026-10", cycle: early, charged: 30_000, paid: 50_000, today: "2026-10-11" },
		]);
		expect(limitLeftOf({ creditLimit: 500_000, states: credited })).toBe(520_000);
	});

	it("answers nothing when no limit was written down", () => {
		expect(limitLeftOf({ creditLimit: null, states: inThree })).toBe(null);
	});

	it("goes past the limit rather than stopping at it, because the card did", () => {
		const over = [state({ month: "2026-10", charged: 600_000, paid: 0 })];
		expect(limitLeftOf({ creditLimit: 500_000, states: over })).toBe(-100_000);
	});
});
