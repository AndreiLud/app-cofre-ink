// Where the two ways of putting money aside open Move between accounts.
//
// The savings rule counts only money moved into the account it names, and a goal is what is
// in its account, so money put aside from the current account is a move and never a spend:
// written as a spend it left the current account and arrived nowhere. The shortcut that
// helps somebody keep either one opens Move between accounts with the account and the amount
// already in it, and the overview and the budget open it the same way from here.
//
// Only an account money can be moved into. A rule or a goal kept in an investment account
// is kept in what is bought there, and that is put aside on the investments screen.

import type { CurrencyCode } from "@cofre/core";
import type { Account, GoalProgress, SavingsProgress } from "@cofre/storage";
import { type MoveStart, movesInto, movesOutOf } from "../components/MoveDialog.tsx";
import { fillAmount } from "./amounts.ts";
import type { Translate } from "./sayWhy.ts";

/** The account money would go into, when it can, and there is another one it can leave. */
function reachable(accounts: readonly Account[], id: string | null): Account | null {
	const into = accounts.find((account) => account.id === id);
	if (!into || !movesInto(into)) return null;
	return accounts.some((account) => account.id !== into.id && movesOutOf(account)) ? into : null;
}

/** "Guardar agora": what the rule still asks for this month, into the account it names. */
export function saveNowStart(
	savings: SavingsProgress | null | undefined,
	accounts: readonly Account[],
	language: string | undefined,
	t: Translate,
): MoveStart | null {
	const rule = savings?.rule;
	if (!savings || !rule) return null;
	const missing = savings.expected - savings.put;
	if (missing <= 0) return null;
	const into = reachable(accounts, rule.accountId);
	if (!into) return null;
	return {
		toId: into.id,
		amount: fillAmount(missing, language, into.currency as CurrencyCode),
		title: t("move.saveNow"),
		description: t("move.saveNowDescription"),
	};
}

/** "Pôr na meta": into the account of the goal, with what a month needs when there is a date. */
export function intoGoalStart(
	goal: GoalProgress,
	accounts: readonly Account[],
	language: string | undefined,
	t: Translate,
): MoveStart | null {
	if (goal.left <= 0) return null;
	const into = reachable(accounts, goal.accountId);
	if (!into) return null;
	return {
		toId: into.id,
		amount:
			goal.monthlyNeeded === null
				? undefined
				: fillAmount(
						Math.min(goal.monthlyNeeded, goal.left),
						language,
						into.currency as CurrencyCode,
					),
		title: t("move.intoGoalTitle", { name: goal.name }),
		description: t("move.intoGoalDescription", { name: goal.name }),
	};
}
