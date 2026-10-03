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
import { MAX_INSTALLMENTS, MoneyError } from "@cofre/core";
import { NewerDatabaseError, NotFoundError, PermissionError, RuleError } from "@cofre/storage";
import { ServerError } from "../storage/remoteSession.ts";
import { FileTooLargeError, LARGEST_FILE } from "./download.ts";

export type Translate = (key: string, values?: Record<string, unknown>) => string;

/** What the server answers with, and what each of those means to a person. */
const SERVER_CODE: Record<string, string> = {
	notAllowed: "rules.notAllowedHere",
	notFound: "rules.notThere",
	notACofreServer: "rules.notACofreServer",
	// A write refused because the page and the server are of different major versions, here
	// before it is sent or by the server when it is a change log (part 2, K.6).
	serverOtherVersion: "rules.serverOtherVersion",
	// What the server answers when it asked GitHub which version is the latest and could not
	// tell (part 2, K.3.6): refused, usually the limit an hour; nothing answered, usually a
	// server with no internet; or an answer nobody can read.
	githubRefused: "rules.githubRefused",
	githubUnreachable: "rules.githubUnreachable",
	githubUnreadable: "rules.githubUnreadable",
};

/**
 * A rule of the model has a sentence of its own, and the key is the name of the rule.
 * Anything the two languages do not carry a sentence for falls back rather than showing
 * a key, which is what a missing translation looks like on screen.
 */
function saidRule(rule: string, t: Translate): string {
	// The ceiling of a plan goes to every sentence that wants it, so it is said in one place
	// and the copy cannot fall out of step with the model.
	return t(`rules.${rule}`, { defaultValue: t("rules.unknown"), max: MAX_INSTALLMENTS });
}

/**
 * The browser's own failure when nothing answered.
 *
 * fetch rejects with a TypeError, and so does calling something that is not a function,
 * so the class alone is not the answer: every coding defect of that shape was reported as
 * a connection that failed, on an application that in browser mode has nothing to connect
 * to. The message is the tell, and each browser writes its own, which is why three are
 * listed. A request that was given up on rather than refused arrives as a DOMException and
 * belongs here too.
 */
function nothingAnswered(error: unknown): boolean {
	if (error instanceof DOMException) {
		return error.name === "AbortError" || error.name === "TimeoutError";
	}
	if (!(error instanceof TypeError)) return false;
	return /failed to fetch|networkerror|load failed|network request failed/i.test(error.message);
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

	// A database a newer version already migrated, here or on a server, which this version does
	// not open (part 2, K.6.3).
	if (error instanceof NewerDatabaseError) return t("rules.newerDatabase");

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
		// A code nothing recognises, with a status that is none of the three above, which is
		// what a server that crashed looks like from here: a 500 with no JSON body arrives
		// as the code "unexpected". It is the one failure that reaches a person with nothing
		// useful in it, so it is the one that most needs to be somewhere a developer can
		// find it, and this branch returned before the console below ever saw it.
		console.error(error);
		return t("rules.unknown");
	}

	// Everything from here is a fault rather than an answer, so it goes to the console
	// first, where it is for whoever is looking at the code. It used to return before
	// this for exactly the class of failure where that mattered most.
	if (error !== null && error !== undefined) console.error(error);

	if (nothingAnswered(error)) return t("rules.noConnection");

	// And the person is told the one useful thing, rather than the sentence the engine
	// wrote for whoever wrote it.
	return t("rules.unknown");
}
