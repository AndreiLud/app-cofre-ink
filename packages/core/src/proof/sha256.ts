// SHA 256, by hand, because the one the platform gives is asynchronous.
//
// `crypto.subtle.digest` is a promise per call, and the thing this is for wants a few
// hundred thousand of them in a row. A promise each would make a challenge that should
// take a moment take the best part of a minute, which is a bot deterrent pointed at the
// wrong person.
//
// It is the plain algorithm from the specification, over bytes, with nothing clever in
// it. The tests are the published vectors, which is the only way to be sure of a hash.

const K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL = new Uint32Array([
	0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotateRight(value: number, by: number): number {
	return ((value >>> by) | (value << (32 - by))) >>> 0;
}

/** The message with the one bit, the zeros and the length the specification asks for. */
function padded(message: Uint8Array): Uint8Array {
	const bits = message.length * 8;
	// One byte for the marker, eight for the length, then up to a whole block of zeros.
	const total = Math.ceil((message.length + 9) / 64) * 64;
	const block = new Uint8Array(total);
	block.set(message);
	block[message.length] = 0x80;

	// The length in bits, big endian, in the last eight bytes. A message long enough to
	// need more than 32 bits of it does not happen here and is written anyway.
	const view = new DataView(block.buffer);
	view.setUint32(total - 8, Math.floor(bits / 0x100000000), false);
	view.setUint32(total - 4, bits >>> 0, false);
	return block;
}

export function sha256(message: Uint8Array): Uint8Array {
	const block = padded(message);
	const state = Uint32Array.from(INITIAL);
	const schedule = new Uint32Array(64);
	const view = new DataView(block.buffer, block.byteOffset, block.byteLength);

	for (let at = 0; at < block.length; at += 64) {
		for (let index = 0; index < 16; index += 1) {
			schedule[index] = view.getUint32(at + index * 4, false);
		}
		for (let index = 16; index < 64; index += 1) {
			const left = schedule[index - 15] as number;
			const right = schedule[index - 2] as number;
			const s0 = (rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3)) >>> 0;
			const s1 = (rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10)) >>> 0;
			schedule[index] = (((schedule[index - 16] as number) +
				s0 +
				(schedule[index - 7] as number) +
				s1) >>>
				0) as number;
		}

		let [a, b, c, d, e, f, g, h] = state as unknown as number[];

		for (let index = 0; index < 64; index += 1) {
			const s1 =
				(rotateRight(e as number, 6) ^
					rotateRight(e as number, 11) ^
					rotateRight(e as number, 25)) >>>
				0;
			const choice = (((e as number) & (f as number)) ^ (~(e as number) & (g as number))) >>> 0;
			const one =
				((h as number) + s1 + choice + (K[index] as number) + (schedule[index] as number)) >>> 0;
			const s0 =
				(rotateRight(a as number, 2) ^
					rotateRight(a as number, 13) ^
					rotateRight(a as number, 22)) >>>
				0;
			const majority =
				(((a as number) & (b as number)) ^
					((a as number) & (c as number)) ^
					((b as number) & (c as number))) >>>
				0;
			const two = (s0 + majority) >>> 0;

			h = g;
			g = f;
			f = e;
			e = ((d as number) + one) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (one + two) >>> 0;
		}

		state[0] = ((state[0] as number) + (a as number)) >>> 0;
		state[1] = ((state[1] as number) + (b as number)) >>> 0;
		state[2] = ((state[2] as number) + (c as number)) >>> 0;
		state[3] = ((state[3] as number) + (d as number)) >>> 0;
		state[4] = ((state[4] as number) + (e as number)) >>> 0;
		state[5] = ((state[5] as number) + (f as number)) >>> 0;
		state[6] = ((state[6] as number) + (g as number)) >>> 0;
		state[7] = ((state[7] as number) + (h as number)) >>> 0;
	}

	const out = new Uint8Array(32);
	const outView = new DataView(out.buffer);
	for (let index = 0; index < 8; index += 1) {
		outView.setUint32(index * 4, state[index] as number, false);
	}
	return out;
}

export function sha256Hex(message: Uint8Array): string {
	return [...sha256(message)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
