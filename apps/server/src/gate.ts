// What a caller does before the server reads a password.
//
// The sign in of a server somebody runs at home is found by machines, and the rate
// limit that Better Auth applies counts per address, which a machine with a thousand
// addresses walks past. So there is a second thing in the way, and unlike the limit it
// costs the caller rather than the server: a number they have to search for, checked
// here in one hash.
//
// Nothing is stored to hand a challenge out. The challenge carries its own salt and its
// own expiry, signed with the secret of this server, so asking for one costs this
// process a signature and nothing else: no entry, no list, no room to run out of.
//
// What is stored is the other half, and only the half that was earned. A proof that
// checks out has its salt written down until it expires, because a challenge is single
// use and that is the only way to know a salt has been spent. Filling that list means
// actually doing the work, over and over, which is precisely the cost this file exists
// to charge.
//
// The earlier shape kept every challenge it ever issued, capped the list and threw away
// the oldest when it overflowed. Those were the ones somebody was in the middle of
// answering, so anybody could have kept the list full and quietly stopped other people
// from signing in, for free.

import { createHmac, timingSafeEqual } from "node:crypto";
import { checkWork, freshSalt } from "@cofre/core";

export type Challenge = { id: string; salt: string; bits: number };

/** Five minutes is longer than anybody takes to type a password and short enough. */
const GOOD_FOR = 5 * 60 * 1000;

/**
 * How many spent salts are kept at once. Every one of them cost somebody the work, so
 * this is not a number anybody reaches by asking: it is here so that a bug upstream
 * cannot turn into memory that only grows.
 */
const MOST = 50_000;

export type Gate = {
	issue: () => Challenge;
	/** True once per challenge, and only for the number that answers it. */
	redeem: (proof: string | null | undefined) => boolean;
	/** For the screen, so it knows whether to make the browser work at all. */
	readonly bits: number;
};

export function createGate(bits: number, secret: string, now: () => number = Date.now): Gate {
	/** Salts that have been answered, and the moment each one stops mattering. */
	const spent = new Map<string, number>();

	function sign(salt: string, expiresAt: number): string {
		return createHmac("sha256", secret).update(`${salt}.${expiresAt}`).digest("hex");
	}

	function signatureHolds(given: string, expected: string): boolean {
		const one = Buffer.from(given, "utf8");
		const two = Buffer.from(expected, "utf8");
		// A length that does not match is a signature that does not match, and comparing
		// the two would throw rather than answer.
		return one.length === two.length && timingSafeEqual(one, two);
	}

	function prune(moment: number): void {
		for (const [salt, expiresAt] of spent) {
			if (expiresAt <= moment) spent.delete(salt);
		}
		while (spent.size > MOST) {
			const oldest = spent.keys().next();
			if (oldest.done) break;
			spent.delete(oldest.value);
		}
	}

	return {
		bits,

		issue(): Challenge {
			const salt = freshSalt();
			const expiresAt = now() + GOOD_FOR;
			// The identifier is the challenge: a salt, the moment it dies, and a signature
			// over both. Nothing here has to be remembered to be recognised later.
			return { id: `${salt}.${expiresAt}.${sign(salt, expiresAt)}`, salt, bits };
		},

		redeem(proof): boolean {
			if (bits === 0) return true;
			if (typeof proof !== "string") return false;

			// The number is after the last dot, because the identifier in front of it has
			// dots of its own.
			const at = proof.lastIndexOf(".");
			if (at <= 0) return false;
			const nonce = Number(proof.slice(at + 1));

			const parts = proof.slice(0, at).split(".");
			if (parts.length !== 3) return false;
			const [salt, when, signature] = parts as [string, string, string];

			const expiresAt = Number(when);
			if (!Number.isSafeInteger(expiresAt)) return false;
			if (!signatureHolds(signature, sign(salt, expiresAt))) return false;

			const moment = now();
			prune(moment);
			if (expiresAt <= moment) return false;

			// Written down whatever the answer turns out to be, so a wrong one cannot be
			// tried again against the same salt until it works.
			if (spent.has(salt)) return false;
			spent.set(salt, expiresAt);

			return checkWork(salt, bits, nonce);
		},
	};
}

/**
 * Cloudflare Turnstile, when the owner turned it on. It is the one third party this
 * server will talk to, it is told nothing but the answer and the address it came from,
 * and it is off unless somebody asked for it.
 */
export async function checkTurnstile(
	secret: string,
	token: string | null | undefined,
	from: string | null,
	fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<boolean> {
	if (typeof token !== "string" || token === "") return false;

	const body = new FormData();
	body.set("secret", secret);
	body.set("response", token);
	if (from) body.set("remoteip", from);

	try {
		const answer = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
			method: "POST",
			body,
		});
		const result = (await answer.json()) as { success?: boolean };
		return result.success === true;
	} catch {
		// Cloudflare not answering is not a reason to let everybody in.
		return false;
	}
}
