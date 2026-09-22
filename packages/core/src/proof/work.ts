// A cost the caller pays before the server reads a password.
//
// The sign in of a server somebody runs at home is found by machines that try a
// thousand passwords a minute, and a rate limit per address only makes that a thousand
// addresses. What stops volume is making each attempt cost something the attacker
// cannot avoid: a number that has to be searched for, and that the server checks in one
// hash.
//
// This is that, and it is deliberately not a captcha from somebody else. A widget from
// a third party would mean every person opening the sign in page of a private server
// announcing themselves to a company that was not invited, which is the one thing this
// project says it will not do.
//
// It is not a person detector. It does not know whether there is a human there and does
// not pretend to. It makes a thousand attempts cost what one attempt costs a thousand
// times, which is the part that matters.

import { sha256 } from "./sha256.ts";

/** How hard, in leading zero bits. Eighteen is a moment here and a wall in bulk. */
export const DEFAULT_BITS = 18;

const encoder = new TextEncoder();

/** How many zero bits the digest of this attempt starts with. */
function leadingZeroBits(digest: Uint8Array): number {
	let bits = 0;
	for (const byte of digest) {
		if (byte === 0) {
			bits += 8;
			continue;
		}
		// The position of the highest bit that is set decides the rest.
		bits += Math.clz32(byte) - 24;
		break;
	}
	return bits;
}

function attempt(salt: string, nonce: number): Uint8Array {
	return sha256(encoder.encode(`${salt}:${nonce}`));
}

/** Whether this number is the answer to that salt at that difficulty. */
export function checkWork(salt: string, bits: number, nonce: number): boolean {
	if (!Number.isSafeInteger(nonce) || nonce < 0) return false;
	return leadingZeroBits(attempt(salt, nonce)) >= bits;
}

/**
 * Searches for the answer. Costs about two to the power of the difficulty hashes, and
 * gives up rather than searching for ever: a browser that cannot find one is better off
 * saying so than freezing.
 */
export function solveWork(salt: string, bits: number, limit = 50_000_000): number | null {
	for (let nonce = 0; nonce < limit; nonce += 1) {
		if (leadingZeroBits(attempt(salt, nonce)) >= bits) return nonce;
	}
	return null;
}

/** A salt nobody can have solved in advance. */
export function freshSalt(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
