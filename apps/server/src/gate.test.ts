// The gate, on its own, because it is the one thing in front of a password.
//
// The flows in app.test.ts prove it is wired to the two routes worth attacking. What is
// proved here is what it promises when somebody is actively trying to get past it: a
// challenge nobody issued, one that has already been answered, one whose expiry was
// edited, and one borrowed from another server.

import { checkWork, solveWork } from "@cofre/core";
import { describe, expect, it } from "vitest";
import { createGate } from "./gate.ts";

/** Four bits is found in a handful of attempts, and proves the same arithmetic. */
const BITS = 4;
const SECRET = "a secret of this server, long enough to be one";

function answer(challenge: { id: string; salt: string; bits: number }): string {
	return `${challenge.id}.${solveWork(challenge.salt, challenge.bits) ?? 0}`;
}

/**
 * A number that is definitely not the answer, found rather than assumed. At four bits
 * one number in sixteen happens to be right, so picking one by hand is a test that
 * fails on its own every so often.
 */
function wrong(challenge: { salt: string; bits: number }): number {
	for (let nonce = 1; nonce < 1_000; nonce += 1) {
		if (!checkWork(challenge.salt, challenge.bits, nonce)) return nonce;
	}
	throw new Error("every number answered it, which cannot happen");
}

describe("the gate", () => {
	it("takes the number that answers the challenge it issued", () => {
		const gate = createGate(BITS, SECRET);
		expect(gate.redeem(answer(gate.issue()))).toBe(true);
	});

	it("refuses the same answer twice, so one challenge buys one attempt", () => {
		const gate = createGate(BITS, SECRET);
		const proof = answer(gate.issue());

		expect(gate.redeem(proof)).toBe(true);
		expect(gate.redeem(proof)).toBe(false);
	});

	it("burns the challenge on a wrong answer, so the same salt cannot be ground down", () => {
		const gate = createGate(BITS, SECRET);
		const challenge = gate.issue();

		expect(gate.redeem(`${challenge.id}.${wrong(challenge)}`)).toBe(false);
		expect(gate.redeem(answer(challenge))).toBe(false);
	});

	it("refuses anything that was not issued here", () => {
		const gate = createGate(BITS, SECRET);

		expect(gate.redeem(undefined)).toBe(false);
		expect(gate.redeem("")).toBe(false);
		expect(gate.redeem("invented.7")).toBe(false);
		expect(gate.redeem("nao.existe.mesmo.7")).toBe(false);
	});

	/**
	 * The challenge carries its own expiry, which means the caller holds it and could
	 * write a later one in. The signature is over the expiry as well as the salt, so a
	 * challenge that was edited is a challenge this server never issued.
	 */
	it("refuses a challenge whose expiry was moved", () => {
		const gate = createGate(BITS, SECRET);
		const challenge = gate.issue();
		const [salt, when, signature] = challenge.id.split(".") as [string, string, string];

		const later = `${salt}.${Number(when) + 60 * 60 * 1000}.${signature}`;
		expect(gate.redeem(`${later}.${solveWork(salt, BITS) ?? 0}`)).toBe(false);
	});

	it("lets a challenge die, and says so without being told", () => {
		let moment = 1_000_000;
		const gate = createGate(BITS, SECRET, () => moment);
		const proof = answer(gate.issue());

		moment += 6 * 60 * 1000;
		expect(gate.redeem(proof)).toBe(false);
	});

	it("does not take a challenge issued by another server", () => {
		const mine = createGate(BITS, SECRET);
		const theirs = createGate(BITS, "another server, another secret entirely");

		expect(mine.redeem(answer(theirs.issue()))).toBe(false);
	});

	it("lets everything through when the owner turned the cost off", () => {
		const gate = createGate(0, SECRET);
		expect(gate.redeem(undefined)).toBe(true);
		expect(gate.redeem("nonsense")).toBe(true);
	});

	/**
	 * Issuing writes nothing down, which is the whole point of the change: the list that
	 * used to fill up was the one anybody could fill for free, and the people it threw
	 * away were the ones in the middle of answering.
	 */
	it("still answers the hundred thousandth challenge, and the one before it", () => {
		const gate = createGate(BITS, SECRET);
		const early = gate.issue();

		for (let count = 0; count < 100_000; count += 1) gate.issue();

		expect(gate.redeem(answer(early))).toBe(true);
	});
});
