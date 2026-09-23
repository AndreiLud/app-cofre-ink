import { describe, expect, it } from "vitest";
import { createUuidV7, instantOfUuidV7, isUuidV7, uuidV7 } from "./uuidV7.ts";

describe("uuidV7", () => {
	it("produces the shape and the version the standard asks for", () => {
		for (let index = 0; index < 100; index += 1) {
			expect(isUuidV7(uuidV7())).toBe(true);
		}
	});

	it("carries the instant it was created", () => {
		const instant = 1_758_412_345_678;
		const generate = createUuidV7(() => instant);
		expect(instantOfUuidV7(generate())).toBe(instant);
	});

	it("sorts by creation time", () => {
		let clock = 1_000_000_000_000;
		const generate = createUuidV7(() => clock);
		const early = generate();
		clock = 1_000_000_001_000;
		const later = generate();
		clock = 2_000_000_000_000;
		const latest = generate();
		expect([latest, early, later].sort()).toEqual([early, later, latest]);
	});

	it("keeps order and stays unique inside one millisecond", () => {
		const generate = createUuidV7(() => 1_700_000_000_000);
		const made = Array.from({ length: 5_000 }, generate);
		expect(new Set(made).size).toBe(5_000);
		expect([...made].sort()).toEqual(made);
	});

	it("never goes backwards when the device clock does", () => {
		let clock = 1_700_000_000_000;
		const generate = createUuidV7(() => clock);
		const before = generate();
		clock = 1_600_000_000_000;
		const after = generate();
		expect(after > before).toBe(true);
	});

	it("does not collide across many calls", () => {
		const made = new Set(Array.from({ length: 20_000 }, () => uuidV7()));
		expect(made.size).toBe(20_000);
	});

	it("refuses to read an instant out of something else", () => {
		expect(() => instantOfUuidV7("not an identifier")).toThrow();
		expect(isUuidV7("6f1a2b3c-4d5e-4f60-8123-456789abcdef")).toBe(false);
	});
});
