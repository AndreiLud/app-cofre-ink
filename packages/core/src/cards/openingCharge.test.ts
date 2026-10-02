import { describe, expect, it } from "vitest";
import { MoneyError } from "../money/money.ts";
import { openingChargeOf } from "./openingCharge.ts";

describe("what a card already owes on the day it is written down", () => {
	it("turns an amount already on the invoice into one expense dated today", () => {
		expect(openingChargeOf({ charged: 50_000, today: "2026-10-02" })).toEqual({
			kind: "expense",
			amount: 50_000,
			happenedOn: "2026-10-02",
		});
	});

	it("writes nothing for a card that owes nothing", () => {
		// Three ways of saying the same thing, and none of them is a record.
		expect(openingChargeOf({ charged: null, today: "2026-10-02" })).toBe(null);
		expect(openingChargeOf({ charged: 0, today: "2026-10-02" })).toBe(null);
		expect(openingChargeOf({ charged: -1, today: "2026-10-02" })).toBe(null);
	});

	it("refuses a fraction of a cent rather than rounding it", () => {
		expect(() => openingChargeOf({ charged: 50_000.5, today: "2026-10-02" })).toThrow(MoneyError);
		expect(() => openingChargeOf({ charged: Number.NaN, today: "2026-10-02" })).toThrow(MoneyError);
	});
});
