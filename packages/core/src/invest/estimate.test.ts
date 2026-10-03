// Part 2, H.5 of the request for 2.0.0, with its numbers.

import { describe, expect, it } from "vitest";
import { estimateByIndex, type IndexDay } from "./estimate.ts";

/** Three days of a CDI of 0,050788%, the last of them the thirtieth of September. */
const CDI: IndexDay[] = [
	{ day: "2026-09-28", rate: 5_078_800 },
	{ day: "2026-09-29", rate: 5_078_800 },
	{ day: "2026-09-30", rate: 5_078_800 },
];

describe("a holding that follows the CDI", () => {
	const box = (rate: number, until = "2026-09-30") =>
		estimateByIndex({
			indexer: "cdi",
			rate,
			from: null,
			moves: [{ day: "2026-09-28", amount: 1_000_000 }],
			until,
			days: CDI,
		});

	it("earns its share of the CDI on every day published, the day of the deposit included", () => {
		expect(box(10_000).value).toBe(1_001_524);
		expect(box(11_000).value).toBe(1_001_677);
	});

	it("stops at the last day kept, and says which", () => {
		expect(box(10_000, "2026-10-05")).toEqual({ value: 1_001_524, through: "2026-09-30" });
	});

	it("starts again from a value typed from the statement", () => {
		const typed = estimateByIndex({
			indexer: "cdi",
			rate: 10_000,
			from: { day: "2026-09-29", value: 1_002_000 },
			moves: [{ day: "2026-09-28", amount: 1_000_000 }],
			until: "2026-09-30",
			days: CDI,
		});
		// Only the thirtieth: the deposit is inside the value typed, and the twenty ninth is its day.
		expect(typed).toEqual({ value: Math.round(1_002_000 * 1.00050788), through: "2026-09-30" });
	});

	it("stops on the day it matures", () => {
		const matured = estimateByIndex({
			indexer: "cdi",
			rate: 10_000,
			from: null,
			moves: [{ day: "2026-09-28", amount: 1_000_000 }],
			until: "2026-09-30",
			maturesOn: "2026-09-29",
			days: CDI,
		});
		expect(matured.through).toBe("2026-09-29");
	});
});

describe("a holding at a fixed rate", () => {
	it("turns 12% a year into 12% over 252 days published", () => {
		const days: IndexDay[] = Array.from({ length: 252 }, (_unused, index) => ({
			day: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
			rate: 4_000_000,
		}));
		const fixed = estimateByIndex({
			indexer: "prefixed",
			rate: 1_200,
			from: null,
			moves: [{ day: "2026-01-01", amount: 1_000_000 }],
			until: "2026-12-31",
			days,
		});
		expect(fixed.value).toBe(1_120_000);
	});
});

describe("a poupança", () => {
	const savings = (until: string) =>
		estimateByIndex({
			indexer: "savings",
			rate: 0,
			from: null,
			moves: [{ day: "2026-10-01", amount: 100_000 }],
			until,
			anniversaryDay: 1,
			days: [{ day: "2026-10-01", rate: 66_240_000 }],
		});

	it("earns on its anniversary, and not a day before", () => {
		expect(savings("2026-10-31").value).toBe(100_000);
		expect(savings("2026-11-01")).toEqual({ value: 100_662, through: "2026-11-01" });
	});
});

describe("a Tesouro Selic", () => {
	it("grows from the last price typed by the daily Selic", () => {
		const treasury = estimateByIndex({
			indexer: "selic",
			rate: 0,
			// 1,50 bonds at R$ 17.000,00 on the thirtieth of September.
			from: { day: "2026-09-30", value: 2_550_000 },
			moves: [],
			until: "2026-10-02",
			days: [
				{ day: "2026-10-01", rate: 5_513_100 },
				{ day: "2026-10-02", rate: 5_513_100 },
			],
		});
		expect(treasury).toEqual({ value: 2_552_812, through: "2026-10-02" });
	});
});
