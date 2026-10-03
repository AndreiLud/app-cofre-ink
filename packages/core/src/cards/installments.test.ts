import { describe, expect, it } from "vitest";
import { money } from "../money/money.ts";
import {
	anchorAfterPaid,
	installmentRefusal,
	MAX_INSTALLMENTS,
	planInstallments,
	purchaseDayOf,
	statementParts,
} from "./installments.ts";

const early = { closingDay: 3, dueDay: 10 };

// Part 2, D.1 of the request for 2.0.0: one ceiling, and a refusal rather than a cut.
describe("whether a plan may be written", () => {
	const ask = (over: Partial<Parameters<typeof installmentRefusal>[0]>) =>
		installmentRefusal({
			kind: "expense",
			accountKind: "credit",
			count: 48,
			total: 240_000,
			...over,
		});

	it("takes forty eight parts and refuses forty nine", () => {
		expect(MAX_INSTALLMENTS).toBe(48);
		expect(ask({})).toBeNull();
		expect(ask({ count: 49 })).toBe("tooManyInstallments");
	});

	it("refuses money in, a benefit card and a move in parts, each for its own reason", () => {
		expect(ask({ kind: "income", count: 3 })).toBe("onlyExpensesGoInInstallments");
		expect(ask({ accountKind: "voucher", count: 3 })).toBe("benefitIsNotInInstallments");
		expect(ask({ kind: "transfer", count: 3 })).toBe("transfersAreNotSplit");
	});

	// R$ 0,40 in forty eight made the forty first part nothing, and the write failed half way.
	it("refuses a plan whose parts would be less than a cent", () => {
		expect(ask({ total: 40 })).toBe("partBelowOneCent");
		expect(ask({ total: 48 })).toBeNull();
	});

	it("refuses a first part that is not one of the plan", () => {
		expect(ask({ firstNumber: 49 })).toBe("firstInstallmentOutsidePlan");
		expect(ask({ firstNumber: 0 })).toBe("firstInstallmentOutsidePlan");
		expect(ask({ firstNumber: 48 })).toBeNull();
	});

	it("says nothing of a purchase in one part", () => {
		expect(ask({ count: 1, kind: "income", total: 0 })).toBeNull();
	});
});

// Part 2, D.3 of the request for 2.0.0: a plan written from the part after the ones paid.
describe("a plan from an anchor", () => {
	it("writes from the fifth of ten, each on the next invoice after the anchor's own", () => {
		const parts = planInstallments({
			total: money(100_000, "BRL"),
			count: 10,
			purchasedOn: "2026-10-05",
			cycle: early,
			firstNumber: 5,
			// The cycle puts the fifth of October on November; the anchor says October.
			firstInvoice: "2026-10",
		});
		expect(parts.map((part) => [part.number, part.invoiceMonth, part.amount.amount])).toEqual([
			[5, "2026-10", 10_000],
			[6, "2026-11", 10_000],
			[7, "2026-12", 10_000],
			[8, "2027-01", 10_000],
			[9, "2027-02", 10_000],
			[10, "2027-03", 10_000],
		]);
		expect(parts.reduce((sum, part) => sum + part.amount.amount, 0)).toBe(60_000);
	});

	it("keeps the cents of the whole division on the parts that are written", () => {
		const whole = planInstallments({
			total: money(100_000, "BRL"),
			count: 48,
			purchasedOn: "2026-10-28",
		});
		const after = planInstallments({
			total: money(100_000, "BRL"),
			count: 48,
			purchasedOn: "2027-08-28",
			firstNumber: 11,
		});
		expect(after.map((part) => part.amount.amount)).toEqual(
			whole.slice(10).map((part) => part.amount.amount),
		);
		expect(after[0]?.number).toBe(11);
		expect(after).toHaveLength(38);
	});

	it("finds the anchor after ten paid parts of a purchase on the twenty eighth of December", () => {
		expect(anchorAfterPaid({ purchasedOn: "2025-12-28", paid: 10, cycle: early })).toEqual({
			firstNumber: 11,
			day: "2026-10-28",
			invoice: "2026-11",
		});
	});

	// Part 1, A.7.2 and part 2, D.5.4: the thirty first of January in forty eight on a card that
	// closes on the thirtieth lands one part on each invoice, from February 2026 to January 2030.
	it("puts one part on each invoice whatever the length of the month", () => {
		const parts = planInstallments({
			total: money(480_000, "BRL"),
			count: 48,
			purchasedOn: "2026-01-31",
			cycle: { closingDay: 30, dueDay: 7 },
		});
		const invoices = parts.map((part) => part.invoiceMonth);
		expect(invoices[0]).toBe("2026-02");
		expect(invoices.at(-1)).toBe("2030-01");
		expect(new Set(invoices).size).toBe(48);
	});
});

// Part 2, E.13 of the request for 2.0.0: the parts a statement still has to write.
describe("the parts printed on a statement", () => {
	it("writes the part printed and the ones after it, by number", () => {
		const parts = statementParts({
			eachPart: money(15_000, "BRL"),
			number: 5,
			count: 10,
			purchasedOn: "2026-05-12",
			invoice: "2026-10",
		});
		expect(
			parts.map((part) => [part.number, part.happenedOn, part.invoiceMonth, part.amount.amount]),
		).toEqual([
			[5, "2026-09-12", "2026-10", 15_000],
			[6, "2026-10-12", "2026-11", 15_000],
			[7, "2026-11-12", "2026-12", 15_000],
			[8, "2026-12-12", "2027-01", 15_000],
			[9, "2027-01-12", "2027-02", 15_000],
			[10, "2027-02-12", "2027-03", 15_000],
		]);
	});

	it("reads a day inside the invoice as the day of the part, and one before it as the purchase", () => {
		const period = { from: "2026-09-03", to: "2026-10-02" };
		expect(purchaseDayOf({ printedOn: "2026-09-12", number: 5, period })).toBe("2026-05-12");
		expect(purchaseDayOf({ printedOn: "2026-05-12", number: 5, period })).toBe("2026-05-12");
	});
});
