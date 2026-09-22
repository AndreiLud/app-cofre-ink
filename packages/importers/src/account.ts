// Which account a file belongs to.
//
// Every import used to start with the same question, asked of somebody who had just
// chosen a file that already says the answer: a statement carries the name of the bank
// and usually the last digits of the account, and a card invoice says it is a card.
// So the answer is worked out here, and the screen shows it as a choice already made
// with the reason beside it, which is a thing a person can check in one glance.

import type { DocumentKind } from "./recognise/document.ts";

export type KnownAccount = {
	id: string;
	name: string;
	/** checking, savings, cash, credit, voucher or investment. */
	kind: string;
	institution: string | null;
};

export type AccountHint = {
	/** The name of the bank, when the document says it. */
	institution?: string | null;
	/** The account or card the file names, in whatever shape the bank wrote it. */
	accountHint?: string | null;
	kind?: DocumentKind | null;
};

export type AccountGuess = {
	id: string;
	/** Why this one, so the screen can say it rather than just pick. */
	why: "digits" | "institution" | "onlyCard" | "onlyAccount" | "remembered";
};

function fold(value: string): string {
	return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * The last four digits of every number in a piece of text.
 *
 * A bank writes the same account as 12345-6 in one place and 123456 in another, so the
 * separators inside a run are stepped over and only digits are compared.
 */
function digitsOf(value: string): string[] {
	const runs = value.match(/\d[\d.\s-]{2,}\d|\d{4,}/g) ?? [];
	return runs
		.map((run) => run.replace(/\D/g, ""))
		.filter((run) => run.length >= 4)
		.map((run) => run.slice(-4));
}

const SPENDING_KINDS = new Set(["checking", "savings", "cash", "voucher"]);

/**
 * The account a file is about, or nothing when the file does not say enough.
 *
 * The order is the order of the evidence. Digits that match are almost proof. The name
 * of a bank is good when only one account is with that bank. Being a card invoice when
 * there is one card is good enough to offer. Anything less is a guess, and a guess
 * about which account money goes into is not worth making.
 */
export function guessAccount(
	hint: AccountHint,
	accounts: readonly KnownAccount[],
): AccountGuess | null {
	if (accounts.length === 0) return null;

	const wanted = digitsOf(hint.accountHint ?? "");
	if (wanted.length > 0) {
		const matching = accounts.filter((account) => {
			const mine = digitsOf(`${account.name} ${account.institution ?? ""}`);
			return mine.some((run) => wanted.includes(run));
		});
		if (matching.length === 1 && matching[0]) return { id: matching[0].id, why: "digits" };
	}

	const bank = fold(hint.institution ?? "").trim();
	if (bank !== "") {
		const matching = accounts.filter((account) => {
			const where = fold(`${account.institution ?? ""} ${account.name}`);
			return where.includes(bank);
		});

		if (matching.length === 1 && matching[0]) return { id: matching[0].id, why: "institution" };

		// Several accounts at the same bank: the kind of document decides between them.
		if (matching.length > 1 && hint.kind) {
			const narrowed = matching.filter((account) =>
				hint.kind === "invoice" ? account.kind === "credit" : SPENDING_KINDS.has(account.kind),
			);
			if (narrowed.length === 1 && narrowed[0]) return { id: narrowed[0].id, why: "institution" };
		}
	}

	if (hint.kind === "invoice") {
		const cards = accounts.filter((account) => account.kind === "credit");
		if (cards.length === 1 && cards[0]) return { id: cards[0].id, why: "onlyCard" };
	}

	if (hint.kind === "statement" || hint.kind === "receipt") {
		const spending = accounts.filter((account) => SPENDING_KINDS.has(account.kind));
		if (spending.length === 1 && spending[0]) return { id: spending[0].id, why: "onlyAccount" };
	}

	return null;
}

/**
 * A name for the shape of a file, so that a mapping corrected once can be found again.
 *
 * It is the header, folded and joined. Two exports from the same bank have the same
 * header and the same shape; an export from another bank has another one.
 */
export function shapeOf(header: readonly string[]): string {
	const folded = header
		.map((name) => fold(name).replace(/[^a-z0-9]/g, ""))
		.filter((name) => name !== "");
	return folded.length === 0 ? "" : folded.join("|").slice(0, 200);
}
