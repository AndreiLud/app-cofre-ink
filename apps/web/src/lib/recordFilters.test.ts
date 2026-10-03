// The period of the list in the address and in a saved filter.
//
// Part 2, F.2, F.3 and F.6 of the request for 2.0.0: the list takes a year as well as a
// month, the month wins when both are there, and a saved filter keeps the month it is and the
// year it is as words that follow the calendar, where it kept the month it was saved in.

import { describe, expect, it } from "vitest";
import {
	addressFromFilters,
	daysOfPeriod,
	type Filters,
	filtersFromAddress,
	filtersFromSaved,
	readRecordsSearch,
	savedFromFilters,
	THIS_YEAR,
} from "./recordFilters.ts";

const NOTHING: Filters = {
	kind: "",
	status: "",
	accountId: "",
	cardId: "",
	categoryId: "",
	search: "",
	recurrenceId: "",
	month: "2026-10",
};

describe("the period in the address", () => {
	it("reads a year, as the router hands it and as somebody types it", () => {
		expect(readRecordsSearch({ ano: 2026 }).ano).toBe(2026);
		expect(readRecordsSearch({ ano: "2026" }).ano).toBe(2026);
		expect(readRecordsSearch({ ano: "dois mil" }).ano).toBeUndefined();
		expect(readRecordsSearch({ mes: "2026-13" }).mes).toBeUndefined();
	});

	it("opens the month when the address says a month and a year", () => {
		expect(filtersFromAddress({ mes: "2026-09", ano: 2026 }, "2026-10").month).toBe("2026-09");
		expect(filtersFromAddress({ ano: 2025 }, "2026-10").month).toBe("2025");
		expect(filtersFromAddress({ mes: "tudo" }, "2026-10").month).toBe("");
		expect(filtersFromAddress({}, "2026-10").month).toBe("2026-10");
	});

	it("writes a year as ano, every month as tudo, and this month as nothing", () => {
		expect(addressFromFilters({ ...NOTHING, month: "2026" }, "2026-10")).toMatchObject({
			mes: undefined,
			ano: 2026,
		});
		expect(addressFromFilters({ ...NOTHING, month: "" }, "2026-10").mes).toBe("tudo");
		expect(addressFromFilters(NOTHING, "2026-10")).toMatchObject({
			mes: undefined,
			ano: undefined,
		});
	});

	it("gives a year its twelve months and February its twenty eight days", () => {
		expect(daysOfPeriod("2026")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
		expect(daysOfPeriod("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
		expect(daysOfPeriod("")).toEqual({});
	});
});

describe("a saved filter", () => {
	it("keeps the month it is as no month, and the year it is as a word", () => {
		const lazer = { ...NOTHING, search: "cinema" };
		expect(savedFromFilters(lazer, "2026-10")).toEqual({ search: "cinema" });
		expect(savedFromFilters({ ...lazer, month: "2026" }, "2026-10")).toEqual({
			search: "cinema",
			month: THIS_YEAR,
		});
		expect(savedFromFilters({ ...lazer, month: "2026-09" }, "2026-10").month).toBe("2026-09");
		expect(savedFromFilters({ ...lazer, month: "" }, "2026-10").month).toBe("");
		expect(savedFromFilters({ ...lazer, month: "2025" }, "2026-10").month).toBe("2025");
	});

	it("opens on the month and the year of the day it is opened", () => {
		// Saved on the twenty eighth of October, opened on the fifth of November.
		expect(filtersFromSaved({ search: "cinema" }, "2026-11").month).toBe("2026-11");
		expect(filtersFromSaved({ month: THIS_YEAR }, "2027-01").month).toBe("2027");
		expect(filtersFromSaved({ month: "2026-09" }, "2026-11").month).toBe("2026-09");
		// A row from before 2.0.0 kept the month it was saved in, and it is not touched.
		expect(
			filtersFromSaved({ ...NOTHING, search: "cinema", month: "2026-10" }, "2026-11").month,
		).toBe("2026-10");
	});
});
