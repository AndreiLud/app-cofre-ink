// Part 2, H.7 of the request for 2.0.0, with its numbers.

import { describe, expect, it } from "vitest";
import { incomeTaxRate, iofRate, netIfTakenOut } from "./tax.ts";

describe("the income tax on fixed income", () => {
	it("falls with the days a deposit stayed", () => {
		const on = "2026-10-28";
		expect([180, 181, 360, 361, 720, 721].map((days) => incomeTaxRate(days, on))).toEqual([
			2_250, 2_000, 2_000, 1_750, 1_750, 1_500,
		]);
	});
});

describe("what is left if it is all taken out", () => {
	it("takes 20% of the income of a deposit that stayed 181 days", () => {
		// R$ 10.000,00 put in on the first of March of 2026, worth R$ 10.100,00 on the twenty ninth
		// of August.
		expect(
			netIfTakenOut({
				taxation: "regressive",
				moves: [{ day: "2026-03-01", amount: 1_000_000 }],
				value: 1_010_000,
				on: "2026-08-29",
			}),
		).toEqual({ net: 1_008_000, incomeTax: 2_000, iof: 0 });
	});

	it("takes the IOF first in the first days, and the income tax on what it leaves", () => {
		// R$ 100,00 of income one day after the deposit.
		expect(iofRate(1, "2026-10-28")).toBe(9_600);
		expect(
			netIfTakenOut({
				taxation: "regressive",
				moves: [{ day: "2026-10-27", amount: 1_000_000 }],
				value: 1_010_000,
				on: "2026-10-28",
			}),
		).toEqual({ net: 1_010_000 - 9_600 - 90, incomeTax: 90, iof: 9_600 });
	});

	it("takes what came out from the oldest deposit", () => {
		const net = netIfTakenOut({
			taxation: "regressive",
			moves: [
				{ day: "2025-01-01", amount: 500_000 },
				{ day: "2026-09-01", amount: 500_000 },
				// The old deposit leaves, so the income left is the new one's, at 22,5%, past the
				// thirty days of the IOF.
				{ day: "2026-09-10", amount: -500_000 },
			],
			value: 510_000,
			on: "2026-10-28",
		});
		expect(net?.incomeTax).toBe(2_250);
	});

	it("says exempt products keep it all, and has nothing to say without the days of deposits", () => {
		expect(
			netIfTakenOut({ taxation: "exempt", moves: [], value: 1_010_000, on: "2026-10-28" }),
		).toEqual({ net: 1_010_000, incomeTax: 0, iof: 0 });
		expect(
			netIfTakenOut({ taxation: "regressive", moves: [], value: 1_010_000, on: "2026-10-28" }),
		).toBeNull();
		expect(
			netIfTakenOut({
				taxation: "notComputed",
				moves: [{ day: "2026-01-01", amount: 1 }],
				value: 2,
				on: "2026-10-28",
			}),
		).toBeNull();
	});
});
