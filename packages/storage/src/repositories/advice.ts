// Gathering what the findings are made from.
//
// The arithmetic lives in `packages/core` and knows nothing about a database. This file
// is the other half: one read of a space that produces the snapshot that arithmetic
// takes. It is written as a handful of plain queries rather than one clever one,
// because each of them is a question somebody could ask on a screen, and because a
// query nobody can read is a query nobody can fix.

import {
	addMonthsToMonth,
	type CalendarDate,
	type ChargePair,
	type Finding,
	findEverything,
	monthOf,
	type PendingCharge,
	type RepeatingCharge,
	type Snapshot,
} from "@cofre/core";
import { assertCan } from "../actor.ts";
import { asNumber } from "../driver.ts";
import type { AccountsRepository } from "./accounts.ts";
import type { BudgetsRepository } from "./budgets.ts";
import type { RepositoryContext } from "./context.ts";
import type { GoalsRepository } from "./goals.ts";
import type { TransactionsRepository } from "./transactions.ts";

/** How many months behind to read. Six sees a habit without last year deciding today. */
const WINDOW = 6;

/** What falls due inside this many days is what the person can still do something about. */
const SOON = 15;

/** Two charges this far apart, for the same amount, in the same account, look like one. */
const REPEAT_DAYS = 3;

export type { Finding, FindingCode, FindingWeight, Snapshot } from "@cofre/core";

export type AdviceInput = {
	spaceId: string;
	/** The day the reading is made on, in the timezone of the space. */
	today: CalendarDate;
};

/**
 * The repositories this one reads through, handed in rather than reached for.
 *
 * Budgets, goals and balances are already worked out somewhere, with their own
 * permission checks and their own tests. Asking them is how this stays a gatherer
 * rather than a second copy of arithmetic that would drift from the first.
 */
export type AdviceNeeds = {
	budgets: BudgetsRepository;
	goals: GoalsRepository;
	accounts: AccountsRepository;
	transactions: TransactionsRepository;
};

export function createAdviceRepository(context: RepositoryContext, needs: AdviceNeeds) {
	async function monthlyTotals(spaceId: string, from: string, to: string) {
		const rows = await context.driver.all(
			`SELECT SUBSTR("happened_on", 1, 7) AS month,
			   COALESCE(SUM(CASE WHEN "kind" = 'income' THEN "amount_in_base" ELSE 0 END), 0) AS income,
			   COALESCE(SUM(CASE WHEN "kind" = 'expense' THEN "amount_in_base" ELSE 0 END), 0) AS expense
			 FROM "transactions"
			 WHERE "space_id" = ? AND "deleted_at" IS NULL AND "status" = 'settled'
			   AND "happened_on" >= ? AND "happened_on" <= ?
			 GROUP BY SUBSTR("happened_on", 1, 7)
			 ORDER BY month DESC`,
			[spaceId, from, to],
		);

		return rows.map((row) => ({
			month: String(row.month),
			income: asNumber(row.income),
			expense: Math.abs(asNumber(row.expense)),
		}));
	}

	async function spendingByCategory(spaceId: string, from: string, to: string) {
		const rows = await context.driver.all(
			`SELECT t."category_id" AS category_id, c."name" AS name,
			   SUBSTR(t."happened_on", 1, 7) AS month,
			   COALESCE(SUM(t."amount_in_base"), 0) AS total
			 FROM "transactions" t
			 JOIN "categories" c ON c."id" = t."category_id"
			 WHERE t."space_id" = ? AND t."deleted_at" IS NULL AND t."status" = 'settled'
			   AND t."kind" = 'expense' AND t."happened_on" >= ? AND t."happened_on" <= ?
			 GROUP BY t."category_id", c."name", SUBSTR(t."happened_on", 1, 7)`,
			[spaceId, from, to],
		);

		return rows.map((row) => ({
			categoryId: String(row.category_id),
			name: String(row.name),
			month: String(row.month),
			total: Math.abs(asNumber(row.total)),
		}));
	}

	/**
	 * What repeats, read from the records rather than from the rules.
	 *
	 * A recurrence in the database says what somebody set up. This says what actually
	 * happens, which is the interesting one: a subscription nobody ever wrote a rule for
	 * still leaves three identical lines in three months.
	 */
	async function repeatingCharges(
		spaceId: string,
		from: string,
		to: string,
	): Promise<RepeatingCharge[]> {
		const rows = await context.driver.all(
			`SELECT LOWER(TRIM("description")) AS label, "happened_on" AS day, "amount_in_base" AS amount
			 FROM "transactions"
			 WHERE "space_id" = ? AND "deleted_at" IS NULL AND "status" = 'settled'
			   AND "kind" = 'expense' AND "happened_on" >= ? AND "happened_on" <= ?
			   AND "description" <> ''
			 ORDER BY "happened_on"`,
			[spaceId, from, to],
		);

		const byLabel = new Map<string, { months: Set<string>; amounts: number[]; shown: string }>();
		for (const row of rows) {
			const label = String(row.label);
			const found = byLabel.get(label) ?? { months: new Set(), amounts: [], shown: label };
			found.months.add(String(row.day).slice(0, 7));
			found.amounts.push(Math.abs(asNumber(row.amount)));
			byLabel.set(label, found);
		}

		const charges: RepeatingCharge[] = [];
		for (const [label, found] of byLabel) {
			// One a month, in at least three different months. Two coffees in one week
			// is not a subscription however identical the two lines are.
			if (found.months.size < 3) continue;
			if (found.amounts.length > found.months.size * 2) continue;

			const amounts = found.amounts;
			charges.push({
				description: label,
				amount: amounts[amounts.length - 1] ?? 0,
				previousAmount: amounts.length > 1 ? (amounts[amounts.length - 2] ?? null) : null,
				occurrences: found.months.size,
			});
		}

		return charges.sort((left, right) => right.amount - left.amount);
	}

	async function pendingCharges(
		spaceId: string,
		today: CalendarDate,
		until: CalendarDate,
	): Promise<PendingCharge[]> {
		const rows = await context.driver.all(
			`SELECT t."description" AS description, t."amount_in_base" AS amount,
			   t."happened_on" AS due, t."invoice_month" AS invoice_month, a."name" AS account,
			   a."kind" AS account_kind
			 FROM "transactions" t
			 LEFT JOIN "accounts" a ON a."id" = t."account_id"
			 WHERE t."space_id" = ? AND t."deleted_at" IS NULL AND t."status" = 'planned'
			   AND t."kind" = 'expense' AND t."happened_on" >= ? AND t."happened_on" <= ?
			 ORDER BY t."happened_on"`,
			[spaceId, today, until],
		);

		return rows.map((row) => ({
			description: String(row.description ?? ""),
			amount: Math.abs(asNumber(row.amount)),
			dueOn: String(row.due),
			invoiceOf: row.invoice_month !== null && row.account !== null ? String(row.account) : null,
		}));
	}

	/**
	 * Pairs that look like the same charge twice.
	 *
	 * Same amount, same account, the same few days apart, and a description that starts
	 * the same way. It is deliberately narrow: a false one of these costs the person a
	 * trip to a screen for nothing, and there is no undo for being told off by software.
	 */
	async function possibleRepeats(spaceId: string, from: string, to: string): Promise<ChargePair[]> {
		const rows = await context.driver.all(
			`SELECT a."description" AS description, a."amount_in_base" AS amount,
			   a."happened_on" AS first_day, b."happened_on" AS second_day,
			   acc."name" AS account
			 FROM "transactions" a
			 JOIN "transactions" b
			   ON b."space_id" = a."space_id" AND b."amount_in_base" = a."amount_in_base"
			  AND b."account_id" = a."account_id"
			  -- One row per pair. By identifier and not by date, because the two can
			  -- disagree: a charge written today may have happened yesterday.
			  AND b."id" > a."id"
			 LEFT JOIN "accounts" acc ON acc."id" = a."account_id"
			 WHERE a."space_id" = ? AND a."deleted_at" IS NULL AND b."deleted_at" IS NULL
			   AND a."kind" = 'expense' AND b."kind" = 'expense'
			   AND a."happened_on" >= ? AND a."happened_on" <= ?
			   AND a."installment_number" IS NULL AND b."installment_number" IS NULL
			   AND SUBSTR(LOWER(a."description"), 1, 8) = SUBSTR(LOWER(b."description"), 1, 8)
			 ORDER BY a."happened_on" DESC
			 -- Somebody who buys the same coffee every day for the same price produces a
			 -- great many of these pairs. Only the newest few are ever shown, and the
			 -- days filter below throws most of them away anyway, so the database is
			 -- asked to stop rather than to hand over a month of coincidences.
			 LIMIT 100`,
			[spaceId, from, to],
		);

		return rows
			.map((row) => {
				const days = [String(row.first_day), String(row.second_day)].sort();
				return {
					description: String(row.description ?? ""),
					amount: Math.abs(asNumber(row.amount)),
					first: days[0] ?? "",
					second: days[1] ?? "",
					account: String(row.account ?? ""),
				};
			})
			.filter((pair) => daysApart(pair.first, pair.second) <= REPEAT_DAYS)
			.slice(0, 5);
	}

	async function categoryNames(spaceId: string): Promise<Map<string, string>> {
		const rows = await context.driver.all(
			`SELECT "id", "name" FROM "categories" WHERE "space_id" = ? AND "deleted_at" IS NULL`,
			[spaceId],
		);
		return new Map(rows.map((row) => [String(row.id), String(row.name)]));
	}

	/** The last day money went into each account, which is how a goal is seen to stall. */
	async function lastPaidIn(spaceId: string): Promise<Map<string, CalendarDate>> {
		const rows = await context.driver.all(
			`SELECT "counter_account_id" AS account_id, MAX("happened_on") AS day
			 FROM "transactions"
			 WHERE "space_id" = ? AND "deleted_at" IS NULL AND "counter_account_id" IS NOT NULL
			 GROUP BY "counter_account_id"`,
			[spaceId],
		);
		return new Map(rows.map((row) => [String(row.account_id), String(row.day)]));
	}

	return {
		/**
		 * Everything the figures of a space have to say, heaviest first.
		 *
		 * It reads and never writes, so it takes the permission to read records. A member
		 * who only sees their own rows gets findings about their own rows, which is the
		 * same rule every other screen follows.
		 */
		async findings(input: AdviceInput): Promise<Finding[]> {
			return findEverything(await this.snapshot(input));
		},

		/** The figures themselves, for a screen that wants to show the working. */
		async snapshot(input: AdviceInput): Promise<Snapshot> {
			assertCan(context.actor(), input.spaceId, "transaction.read");

			const thisMonth = monthOf(input.today);
			const firstMonth = addMonthsToMonth(thisMonth, -WINDOW);
			const from = `${firstMonth}-01`;
			const to = `${thisMonth}-31`;
			const until = addDays(input.today, SOON);

			const [
				months,
				categories,
				budgets,
				goals,
				repeating,
				pending,
				repeats,
				balances,
				accounts,
				names,
				lastSaved,
			] = await Promise.all([
				monthlyTotals(input.spaceId, from, to),
				spendingByCategory(input.spaceId, from, to),
				needs.budgets.progress({ spaceId: input.spaceId, month: thisMonth, today: input.today }),
				needs.goals.progress({ spaceId: input.spaceId, today: input.today }),
				repeatingCharges(input.spaceId, from, to),
				pendingCharges(input.spaceId, input.today, until),
				possibleRepeats(input.spaceId, `${addMonthsToMonth(thisMonth, -1)}-01`, to),
				needs.transactions.balances(input.spaceId),
				needs.accounts.list(input.spaceId),
				categoryNames(input.spaceId),
				lastPaidIn(input.spaceId),
			]);

			// Money on hand is what is in the accounts somebody spends from. What is put
			// aside is not a reserve of cash and counting it as one hides the problem.
			const spendable = new Set(
				accounts.filter((account) => account.kind !== "investment").map((account) => account.id),
			);
			const onHand = balances
				.filter((balance) => spendable.has(balance.accountId))
				.reduce((total, balance) => total + balance.settled, 0);

			const current = months.find((month) => month.month === thisMonth) ?? {
				month: thisMonth,
				income: 0,
				expense: 0,
			};

			const byCategory = new Map<string, { name: string; thisMonth: number; before: number[] }>();
			for (const row of categories) {
				const found = byCategory.get(row.categoryId) ?? {
					name: row.name,
					thisMonth: 0,
					before: [],
				};
				if (row.month === thisMonth) found.thisMonth = row.total;
				else found.before.push(row.total);
				byCategory.set(row.categoryId, found);
			}

			return {
				today: input.today,
				onHand,
				thisMonth: current,
				before: months.filter((month) => month.month !== thisMonth),
				categories: [...byCategory].map(([categoryId, found]) => ({ categoryId, ...found })),
				budgets: budgets.map((budget) => ({
					categoryId: budget.categoryId ?? "",
					// A budget for one category is called after it. One for a priority or
					// for the whole month is called after what it covers, and the
					// interface reads that back out of the code.
					name:
						budget.categoryId === null
							? (budget.priority ?? "total")
							: (names.get(budget.categoryId) ?? ""),
					limit: budget.amount,
					spent: budget.progress.spent,
				})),
				goals: goals.map((goal) => ({
					goalId: goal.id,
					name: goal.name,
					target: goal.targetAmount,
					saved: goal.saved,
					lastAddedOn: lastSaved.get(goal.accountId) ?? null,
					dueOn: goal.targetDate,
				})),
				repeating,
				pending,
				possibleRepeats: repeats,
			};
		},
	};
}

function daysApart(from: CalendarDate, to: CalendarDate): number {
	return Math.abs(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

function addDays(day: CalendarDate, count: number): CalendarDate {
	const at = new Date(`${day}T00:00:00Z`);
	at.setUTCDate(at.getUTCDate() + count);
	return at.toISOString().slice(0, 10);
}

export type AdviceRepository = ReturnType<typeof createAdviceRepository>;
