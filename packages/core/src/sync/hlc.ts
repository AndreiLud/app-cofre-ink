// Hybrid logical clock.
// Two devices that edit the same row while offline need an order that both agree on
// when they meet again. A wall clock alone is not enough, because one of the devices
// may be wrong by minutes. This clock keeps the wall clock reading when it is ahead,
// and falls back to a counter when it is not, so ordering stays stable even when a
// device is set to the wrong time.

export type HybridTime = {
	/** Milliseconds since the epoch, as understood by whoever wrote the event. */
	millis: number;
	/** Distinguishes events inside the same millisecond. */
	counter: number;
	/** Breaks the tie between two devices that produced the same instant. */
	deviceId: string;
};

const MILLIS_WIDTH = 15;
const COUNTER_WIDTH = 4;
const MAX_COUNTER = 0xffff;

/** How far ahead a foreign clock may be before we treat it as broken. */
export const MAX_DRIFT_MILLIS = 60 * 60 * 1000;

export class ClockError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ClockError";
	}
}

/**
 * Fixed width so that comparing two stamps as plain text gives the same answer as
 * comparing them field by field. That is what lets the database sort them.
 */
export function encodeHybridTime(time: HybridTime): string {
	if (!Number.isSafeInteger(time.millis) || time.millis < 0) {
		throw new ClockError(`invalid instant ${time.millis}`);
	}
	if (!Number.isSafeInteger(time.counter) || time.counter < 0 || time.counter > MAX_COUNTER) {
		throw new ClockError(`invalid counter ${time.counter}`);
	}
	if (time.deviceId === "" || time.deviceId.includes(".")) {
		throw new ClockError(`invalid device "${time.deviceId}"`);
	}
	const millis = String(time.millis).padStart(MILLIS_WIDTH, "0");
	const counter = time.counter.toString(16).padStart(COUNTER_WIDTH, "0");
	return `${millis}.${counter}.${time.deviceId}`;
}

export function decodeHybridTime(stamp: string): HybridTime {
	const first = stamp.indexOf(".");
	const second = stamp.indexOf(".", first + 1);
	if (first !== MILLIS_WIDTH || second !== MILLIS_WIDTH + 1 + COUNTER_WIDTH) {
		throw new ClockError(`"${stamp}" is not a hybrid stamp`);
	}
	const millis = Number(stamp.slice(0, MILLIS_WIDTH));
	const counter = Number.parseInt(stamp.slice(first + 1, second), 16);
	const deviceId = stamp.slice(second + 1);
	if (!Number.isSafeInteger(millis) || Number.isNaN(counter) || deviceId === "") {
		throw new ClockError(`"${stamp}" is not a hybrid stamp`);
	}
	return { millis, counter, deviceId };
}

/**
 * A stamp that sorts at the very start of an instant.
 *
 * It is not a stamp anybody wrote: it is a line drawn across the log, for saying
 * "everything before this moment". The device it names is the lowest one there is, so
 * nothing real ever ties with it.
 */
export function stampAt(millis: number): string {
	return encodeHybridTime({ millis: Math.max(0, Math.floor(millis)), counter: 0, deviceId: "0" });
}

/** Total order over stamps. Text comparison gives the same result. */
export function compareHybridTime(left: HybridTime, right: HybridTime): number {
	if (left.millis !== right.millis) return left.millis < right.millis ? -1 : 1;
	if (left.counter !== right.counter) return left.counter < right.counter ? -1 : 1;
	if (left.deviceId === right.deviceId) return 0;
	return left.deviceId < right.deviceId ? -1 : 1;
}

export type HybridClock = {
	readonly deviceId: string;
	/** Stamp for an event produced here. */
	next(): string;
	/** Takes in a stamp that arrived from somewhere else and moves ahead of it. */
	observe(stamp: string): string;
	/** The last stamp this clock issued or observed. */
	current(): string;
};

export function createHybridClock(
	deviceId: string,
	wallClock: () => number = Date.now,
): HybridClock {
	let millis = 0;
	let counter = 0;

	const stamp = (): string => encodeHybridTime({ millis, counter, deviceId });

	return {
		deviceId,

		next() {
			const wall = Math.floor(wallClock());
			if (wall > millis) {
				millis = wall;
				counter = 0;
			} else {
				counter += 1;
				if (counter > MAX_COUNTER) {
					millis += 1;
					counter = 0;
				}
			}
			return stamp();
		},

		observe(incoming: string) {
			const remote = decodeHybridTime(incoming);
			const wall = Math.floor(wallClock());

			if (remote.millis > wall + MAX_DRIFT_MILLIS) {
				throw new ClockError(
					`the stamp from device ${remote.deviceId} is more than an hour ahead of this device`,
				);
			}

			const highest = Math.max(millis, remote.millis, wall);
			if (highest === millis && highest === remote.millis) {
				counter = Math.max(counter, remote.counter) + 1;
			} else if (highest === millis) {
				counter += 1;
			} else if (highest === remote.millis) {
				counter = remote.counter + 1;
			} else {
				counter = 0;
			}
			millis = highest;

			if (counter > MAX_COUNTER) {
				millis += 1;
				counter = 0;
			}
			return stamp();
		},

		current() {
			return stamp();
		},
	};
}
