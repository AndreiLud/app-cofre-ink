import { describe, expect, it } from "vitest";
import { occurrenceId } from "./occurrenceId.ts";

describe("the identifier of an occurrence", () => {
	const series = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b";

	it("is the same for the same series and day, wherever it is worked out", () => {
		expect(occurrenceId(series, "2026-11-05")).toBe(occurrenceId(series, "2026-11-05"));
	});

	it("differs from one day to the next and from one series to another", () => {
		const days = Array.from({ length: 400 }, (_unused, index) => {
			const day = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
			return occurrenceId(series, day);
		});
		expect(new Set(days).size).toBe(400);
		expect(occurrenceId(series, "2026-11-05")).not.toBe(
			occurrenceId("0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c", "2026-11-05"),
		);
	});

	it("has the shape of a UUID of version 8", () => {
		expect(occurrenceId(series, "2026-11-05")).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});
});
