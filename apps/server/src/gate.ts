// What a caller does before the server reads a password.
//
// The sign in of a server somebody runs at home is found by machines, and the rate
// limit that Better Auth applies counts per address, which a machine with a thousand
// addresses walks past. So there is a second thing in the way, and unlike the limit it
// costs the caller rather than the server: a number they have to search for, checked
// here in one hash.
//
// The challenges live in memory and only here. They are single use and short lived, so
// the list is small by construction, and a machine asking for a million of them finds
// the oldest ones thrown away rather than a server out of memory.

import { checkWork, freshSalt, uuidV7 } from "@cofre/core";

export type Challenge = { id: string; salt: string; bits: number };

/** Five minutes is longer than anybody takes to type a password and short enough. */
const GOOD_FOR = 5 * 60 * 1000;

/**
 * How many are kept. A challenge is a hundred bytes or so, and a caller that wants more
 * than this many at once is not somebody signing in.
 */
const MOST = 5_000;

export type Gate = {
	issue: () => Challenge;
	/** True once per challenge, and only for the number that answers it. */
	redeem: (proof: string | null | undefined) => boolean;
	/** For the screen, so it knows whether to make the browser work at all. */
	readonly bits: number;
};

export function createGate(bits: number, now: () => number = Date.now): Gate {
	const open = new Map<string, { salt: string; bits: number; expiresAt: number }>();

	function prune(): void {
		const moment = now();
		for (const [id, challenge] of open) {
			if (challenge.expiresAt <= moment) open.delete(id);
		}
		// Still too many means somebody is collecting them. The oldest go, which are the
		// ones nearest to expiring anyway.
		while (open.size > MOST) {
			const oldest = open.keys().next();
			if (oldest.done) break;
			open.delete(oldest.value);
		}
	}

	return {
		bits,

		issue(): Challenge {
			prune();
			const challenge = { id: uuidV7(), salt: freshSalt(), bits };
			open.set(challenge.id, { salt: challenge.salt, bits, expiresAt: now() + GOOD_FOR });
			return challenge;
		},

		redeem(proof): boolean {
			if (bits === 0) return true;
			if (typeof proof !== "string") return false;

			const at = proof.indexOf(".");
			if (at <= 0) return false;
			const id = proof.slice(0, at);
			const nonce = Number(proof.slice(at + 1));

			const challenge = open.get(id);
			if (!challenge) return false;

			// Taken out whatever the answer is, so a wrong one cannot be tried again
			// against the same salt until it works.
			open.delete(id);
			if (challenge.expiresAt <= now()) return false;

			return checkWork(challenge.salt, challenge.bits, nonce);
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
