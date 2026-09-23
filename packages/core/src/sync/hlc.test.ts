import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	ClockError,
	compareHybridTime,
	createHybridClock,
	decodeHybridTime,
	encodeHybridTime,
} from "./hlc.ts";

describe("hybrid time encoding", () => {
	it("survives a round trip", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 4_000_000_000_000 }),
				fc.integer({ min: 0, max: 0xffff }),
				fc.stringMatching(/^[a-z0-9]{1,16}$/),
				(millis, counter, deviceId) => {
					const decoded = decodeHybridTime(encodeHybridTime({ millis, counter, deviceId }));
					expect(decoded).toEqual({ millis, counter, deviceId });
				},
			),
		);
	});

	it("sorts as text exactly as it sorts as a value", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						millis: fc.integer({ min: 0, max: 2_000_000_000_000 }),
						counter: fc.integer({ min: 0, max: 0xffff }),
						deviceId: fc.stringMatching(/^[a-z0-9]{4}$/),
					}),
					{ minLength: 2, maxLength: 20 },
				),
				(times) => {
					const byValue = [...times].sort(compareHybridTime).map(encodeHybridTime);
					const byText = times.map(encodeHybridTime).sort();
					expect(byText).toEqual(byValue);
				},
			),
		);
	});

	it("refuses a device name that would break the format", () => {
		expect(() => encodeHybridTime({ millis: 1, counter: 0, deviceId: "with.dot" })).toThrow(
			ClockError,
		);
		expect(() => decodeHybridTime("not a stamp")).toThrow(ClockError);
	});
});

describe("hybrid clock", () => {
	it("never goes backwards, even when the device clock does", () => {
		let wall = 1_000_000;
		const clock = createHybridClock("deviceA", () => wall);

		const first = clock.next();
		wall = 999_000;
		const second = clock.next();
		const third = clock.next();

		expect(second > first).toBe(true);
		expect(third > second).toBe(true);
	});

	it("keeps order inside the same millisecond", () => {
		const clock = createHybridClock("deviceA", () => 5_000);
		const stamps = Array.from({ length: 50 }, () => clock.next());
		expect([...stamps].sort()).toEqual(stamps);
		expect(new Set(stamps).size).toBe(50);
	});

	it("moves ahead of what another device reports", () => {
		const slow = createHybridClock("slow", () => 1_000);
		const fast = createHybridClock("fast", () => 9_000);

		const fromFast = fast.next();
		const answer = slow.observe(fromFast);

		expect(answer > fromFast).toBe(true);
		expect(slow.next() > answer).toBe(true);
	});

	it("two devices exchanging events end up in one agreed order", () => {
		let wallA = 1_000;
		let wallB = 1_000;
		const deviceA = createHybridClock("aaaa", () => wallA);
		const deviceB = createHybridClock("bbbb", () => wallB);

		const events: string[] = [];
		for (let round = 0; round < 25; round += 1) {
			wallA += round % 3;
			wallB += round % 2;
			const fromA = deviceA.next();
			events.push(fromA);
			const fromB = deviceB.observe(fromA);
			events.push(fromB);
			deviceA.observe(fromB);
		}

		expect([...events].sort()).toEqual(events);
		expect(new Set(events).size).toBe(events.length);
	});

	it("refuses a stamp from a clock that is absurdly ahead", () => {
		const clock = createHybridClock("here", () => 1_000);
		const future = encodeHybridTime({ millis: 5 * 60 * 60 * 1000, counter: 0, deviceId: "there" });
		expect(() => clock.observe(future)).toThrow(ClockError);
	});
});
