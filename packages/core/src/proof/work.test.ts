// The hash against the published vectors, and the cost against itself.

import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256.ts";
import { checkWork, freshSalt, solveWork } from "./work.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("sha256", () => {
	// A hash is either the one everybody else computes or it is nothing, so these are
	// the vectors from the specification and from the usual suite around it.
	it("agrees with the published vectors", () => {
		expect(sha256Hex(bytes(""))).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
		expect(sha256Hex(bytes("abc"))).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
		expect(sha256Hex(bytes("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe(
			"248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
		);
		// Two blocks and then some, which is where padding goes wrong when it goes wrong.
		expect(sha256Hex(bytes("a".repeat(1000)))).toBe(
			"41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3",
		);
	});

	it("keeps the byte length right up to and over a block boundary", () => {
		// Fifty five fits with the marker and the length; fifty six does not and needs
		// another block. Both are the ones that break a padding written from memory.
		expect(sha256Hex(bytes("a".repeat(55)))).toBe(
			"9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318",
		);
		expect(sha256Hex(bytes("a".repeat(56)))).toBe(
			"b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a",
		);
	});
});

describe("the cost before a password is read", () => {
	it("finds an answer, and the answer checks out", () => {
		const salt = "umsalqualquer";
		const nonce = solveWork(salt, 10);

		expect(nonce).not.toBeNull();
		expect(checkWork(salt, 10, nonce ?? -1)).toBe(true);
	});

	it("refuses an answer to another salt, and refuses nonsense", () => {
		const nonce = solveWork("um", 10) ?? -1;

		expect(checkWork("outro", 10, nonce)).toBe(false);
		expect(checkWork("um", 10, -1)).toBe(false);
		expect(checkWork("um", 10, 1.5)).toBe(false);
		expect(checkWork("um", 10, Number.NaN)).toBe(false);
	});

	it("asks for more work the harder it is told to be", () => {
		const salt = "mesmosal";
		const easy = solveWork(salt, 4) ?? 0;
		const hard = solveWork(salt, 14) ?? 0;

		// The search walks upwards from zero, so a harder answer is a later one. This is
		// the whole of the deterrent: the cost is in the searching, not in the checking.
		expect(hard).toBeGreaterThan(easy);
		expect(checkWork(salt, 4, hard)).toBe(true);
	});

	it("gives up instead of searching for ever", () => {
		expect(solveWork("qualquer", 40, 5_000)).toBeNull();
	});

	it("makes a salt nobody could have answered in advance", () => {
		expect(freshSalt()).toMatch(/^[0-9a-f]{32}$/);
		expect(freshSalt()).not.toBe(freshSalt());
	});
});
