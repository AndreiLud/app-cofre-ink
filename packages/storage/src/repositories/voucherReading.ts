// What the core needs to read a benefit card, gathered from the database once.
//
// Two readings ask the same questions of a voucher: the line that says what is left on it,
// and the report that counts its allowance as money that came in. They used to gather their
// answers apart and disagree about the day counting starts, so the gathering lives here and
// the deciding lives in `packages/core/src/accounts/benefit.ts`.

import {
	type CalendarDate,
	type QuotaVersion,
	todayIn,
	type VoucherMovement,
	type VoucherStart,
} from "@cofre/core";
import type { Driver } from "../driver.ts";
import { asNumber } from "../driver.ts";
import { happenedBy } from "../happened.ts";
import type { Account } from "../models.ts";

/**
 * Every version of the allowance of an account, oldest first, or nothing without one: the
 * ones it replaced, and the one it has, from the day each applied from.
 */
export function versionsOf(account: Account): QuotaVersion[] | null {
	if (account.quotaAmount === null || account.quotaDay === null) return null;
	return [
		...account.quotaBefore,
		{
			amount: account.quotaAmount,
			day: account.quotaDay,
			carries: account.quotaCarries ?? true,
			since: account.quotaSince,
		},
	];
}

/**
 * Where counting what is on the card starts.
 *
 * What somebody said was on it, on the day they said it, which is decision 3 of 2.0.0 and
 * may be nothing at all. Or the opening balance a card from release 1.0 was written down
 * with, on the day it was written down. Or nothing said, from the day it was written down.
 */
export function startOf(account: Account, timezone: string): VoucherStart {
	if (account.balanceKnownOn !== null) {
		return { on: account.balanceKnownOn, amount: account.initialBalance };
	}
	return {
		on: todayIn(timezone, new Date(account.createdAt)),
		amount: account.initialBalance === 0 ? null : account.initialBalance,
	};
}

/**
 * What happened on the card from a day up to today, in the card's own currency, which is
 * the one its allowance is written in. Only what has happened, by the one rule for it: a
 * lunch written for next Tuesday has not been eaten.
 *
 * A purchase is spent, and a refund is a purchase the other way round, so it comes back
 * with its sign. Money moved onto the card by hand, a top up by Pix, is added: the
 * application told people to write it as a move between accounts and then never read it,
 * so the money left the current account and arrived nowhere. Money moved off the card,
 * which nothing should write and an old record may hold, left it.
 */
export async function movementsOf(
	driver: Driver,
	accountId: string,
	from: CalendarDate,
	today: CalendarDate,
): Promise<VoucherMovement[]> {
	const rows = await driver.all(
		`SELECT "happened_on", "amount", "kind", "account_id", "counter_account_id"
		 FROM "transactions"
		 WHERE ("account_id" = ? OR ("counter_account_id" = ? AND "kind" = 'transfer'))
		   AND "deleted_at" IS NULL
		   AND ${happenedBy(null)} AND "happened_on" >= ?`,
		[accountId, accountId, today, from],
	);
	return rows.map((row) => {
		const amount = asNumber(row.amount);
		const on = String(row.happened_on);
		if (row.kind === "expense") return { on, amount: -amount, kind: "spent" as const };
		// An income on the card, which only a release before 2.0.0 could write, and which
		// was the allowance written by hand: decided with the owner, it stands for the
		// allowance of its month, so that month counts once.
		if (row.kind === "income") return { on, amount, kind: "income" as const };
		if (row.counter_account_id === accountId) return { on, amount, kind: "added" as const };
		return { on, amount, kind: "spent" as const };
	});
}

/**
 * The incomes written on a card before 2.0.0, which a report needs to leave the computed
 * allowance of their months out, because the income itself is already counted as income.
 */
export async function incomesOf(
	driver: Driver,
	accountId: string,
	until: CalendarDate,
): Promise<VoucherMovement[]> {
	const rows = await driver.all(
		`SELECT "happened_on", "amount" FROM "transactions"
		 WHERE "account_id" = ? AND "kind" = 'income' AND "deleted_at" IS NULL
		   AND ${happenedBy(null)}`,
		[accountId, until],
	);
	return rows.map((row) => ({
		on: String(row.happened_on),
		amount: asNumber(row.amount),
		kind: "income" as const,
	}));
}
