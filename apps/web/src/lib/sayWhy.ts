// One error, one sentence, in one place.
//
// Every screen used to carry its own translation of a failure, and they disagreed. Nine
// of them printed error.message, which is the sentence the model writes for whoever wrote
// the code: "not allowed to transaction.update in the space 3f2a9c1e", in English, on a
// Portuguese screen. One turned every failure into "your role does not allow that",
// including a dropped connection. One turned every failure into "I could not read that
// amount", including a refusal. And thirteen writes had no handler at all, so they failed
// in complete silence.
//
// The thing that made this hard to get right by hand is that the same failure arrives in
// two shapes. In browser mode the repositories run in this tab and throw their own
// classes. On a server they are flattened into JSON and rebuilt as one class that carries
// a status and a code, so every `"rule" in error` check ever written was dead there. Both
// shapes are read here, once.

import { CloudError } from "@cofre/cloud";
import { MoneyError } from "@cofre/core";
import { NotFoundError, PermissionError, RuleError } from "@cofre/storage";
import { ServerError } from "../storage/remoteSession.ts";
import { FileTooLargeError, LARGEST_FILE } from "./download.ts";

export type Translate = (key: string, values?: Record<string, unknown>) => string;

/** What the server answers with, and what each of those means to a person. */
const SERVER_CODE: Record<string, string> = {
	notAllowed: "rules.notAllowedHere",
	notFound: "rules.notThere",
};

/**
 * A rule of the model has a sentence of its own, and the key is the name of the rule.
 * Anything the two languages do not carry a sentence for falls back rather than showing
 * a key, which is what a missing translation looks like on screen.
 */
function saidRule(rule: string, t: Translate): string {
	return t(`rules.${rule}`, { defaultValue: t("rules.unknown") });
}

/**
 * The browser's own failure when nothing answered.
 *
 * fetch rejects with a TypeError and a message that changes with the browser, so the
 * shape is what identifies it: an error that is not one of ours and is not an ordinary
 * Error subclass we know.
 */
function nothingAnswered(error: unknown): boolean {
	return error instanceof TypeError;
}

export function sayWhy(error: unknown, t: Translate): string {
	// The two that already had a sentence of their own, kept because they say more than a
	// generic one: which destination, and what it answered.
	if (error instanceof FileTooLargeError) {
		return t("data.tooLarge", { megabytes: Math.round(LARGEST_FILE / 1024 / 1024) });
	}
	if (error instanceof CloudError) {
		if (error.status === 0) return t("destination.unreachable", { where: error.where });
		if (error.status === 401 || error.status === 403) {
			return t("destination.refused", { where: error.where });
		}
		return t("destination.answered", { where: error.where, status: error.status });
	}

	// Browser mode: the classes the repositories throw in this tab.
	if (error instanceof PermissionError) return t("rules.notAllowedHere");
	if (error instanceof NotFoundError) return t("rules.notThere");
	if (error instanceof RuleError) return saidRule(error.rule, t);
	if (error instanceof MoneyError) return t("fields.amountError");

	// Server mode: one class, a status and a code. A rule comes back as 409 with the name
	// of the rule as the code, which is what lets the same sentence be found again.
	if (error instanceof ServerError) {
		const known = SERVER_CODE[error.code];
		if (known !== undefined) return t(known);
		if (error.status === 409) return saidRule(error.code, t);
		if (error.status === 403) return t("rules.notAllowedHere");
		if (error.status === 404) return t("rules.notThere");
		return t("rules.unknown");
	}

	if (nothingAnswered(error)) return t("rules.noConnection");

	// Whatever is left is a fault rather than an answer, so the person is told the one
	// useful thing about it. The message itself goes to the console, where it is for
	// whoever is looking at the code, and not onto the screen.
	if (error !== null && error !== undefined) console.error(error);
	return t("rules.unknown");
}
