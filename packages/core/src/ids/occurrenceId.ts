// The identifier of the record a series writes for one day.
//
// Every other identifier is drawn at random on the device, which is right for something a
// person writes once. A series writes the same day from every device that opens the space and
// from every request the server receives, and two of them at the same moment wrote the day
// twice. So the record of a day is named by the series and the day: two writers reach the same
// name, the database keeps the first and the second is a no op, and a day once written and
// deleted keeps its name, so it is known as written.
//
// The shape is a UUID of version 8, the one the standard leaves for identifiers made by an
// application's own rule, so it sits in the same column as every other identifier.

/** Four lanes of 32 bits, mixed from the text. Not cryptographic, and it does not need to be. */
function hash128(text: string): [number, number, number, number] {
	let h1 = 1779033703;
	let h2 = 3144134277;
	let h3 = 1013904242;
	let h4 = 2773480762;
	for (let index = 0; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
		h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
		h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
		h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
	}
	h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
	h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
	h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
	h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
	h1 ^= h2 ^ h3 ^ h4;
	h2 ^= h1;
	h3 ^= h1;
	h4 ^= h1;
	return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

const hex = (value: number) => value.toString(16).padStart(8, "0");

/** The same series and day give the same identifier, on every device and every time. */
export function occurrenceId(seriesId: string, day: string): string {
	const [a, b, c, d] = hash128(`${seriesId}|${day}`);
	const text = `${hex(a)}${hex(b)}${hex(c)}${hex(d)}`.split("");
	// Version 8, and the variant of the standard.
	text[12] = "8";
	text[16] = ((Number.parseInt(text[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
	const joined = text.join("");
	return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}
