// Identifiers are generated on the device, never by the database.
// Version 7 puts the creation time in the leading bits, so rows sort by age, indexes
// stay compact, and two devices that are offline never collide.

const VERSION = 0x70;
const VARIANT = 0x80;
const MAX_COUNTER = 0x0fff;

function randomBytes(length: number): Uint8Array {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return bytes;
}

function toHex(bytes: Uint8Array): string {
	let text = "";
	for (const byte of bytes) {
		text += byte.toString(16).padStart(2, "0");
	}
	return text;
}

/**
 * Builds a generator with its own monotonic state.
 *
 * The state matters: two identifiers made in the same millisecond stay in order
 * thanks to a counter, and a device clock that jumps backwards does not produce an
 * identifier that sorts before one already written. Each generator owns that state,
 * so a test can drive its own clock without disturbing the rest of the application.
 */
export function createUuidV7(wallClock: () => number = Date.now): () => string {
	let lastMillis = 0;
	let counter = 0;

	return function uuid(): string {
		const wall = Math.floor(wallClock());

		if (wall > lastMillis) {
			lastMillis = wall;
			counter = 0;
		} else {
			counter += 1;
			if (counter > MAX_COUNTER) {
				lastMillis += 1;
				counter = 0;
			}
		}

		const millis = lastMillis;
		const bytes = new Uint8Array(16);
		// Forty eight bits of milliseconds, most significant byte first.
		bytes[0] = Math.floor(millis / 2 ** 40) & 0xff;
		bytes[1] = Math.floor(millis / 2 ** 32) & 0xff;
		bytes[2] = Math.floor(millis / 2 ** 24) & 0xff;
		bytes[3] = Math.floor(millis / 2 ** 16) & 0xff;
		bytes[4] = Math.floor(millis / 2 ** 8) & 0xff;
		bytes[5] = millis & 0xff;

		// Four bits of version and twelve bits of counter.
		bytes[6] = VERSION | ((counter >> 8) & 0x0f);
		bytes[7] = counter & 0xff;

		// Two bits of variant and sixty two bits of chance.
		const tail = randomBytes(8);
		bytes[8] = VARIANT | ((tail[0] ?? 0) & 0x3f);
		for (let index = 1; index < 8; index += 1) {
			bytes[8 + index] = tail[index] ?? 0;
		}

		const hex = toHex(bytes);
		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	};
}

/** The generator the application uses, on the real clock. */
export const uuidV7 = createUuidV7();

const PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuidV7(value: string): boolean {
	return PATTERN.test(value);
}

/** Reads back the instant recorded in the identifier. */
export function instantOfUuidV7(value: string): number {
	if (!isUuidV7(value)) {
		throw new Error(`"${value}" is not an identifier of version 7`);
	}
	return Number.parseInt(value.slice(0, 8) + value.slice(9, 13), 16);
}
