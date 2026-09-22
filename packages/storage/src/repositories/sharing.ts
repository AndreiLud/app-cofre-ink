// Who owes whom, in a space people share.
//
// One expense, one payer, and a share for each person. The arithmetic lives in the core
// package and adds up to the cent; this file stores the parts, refuses the ones that do
// not add up, and answers the only question that matters at the end of the month: who
// pays whom, and how much.
//
// A settlement is not a transaction. Paying somebody back does not change what the
// house spent, it changes who is holding the bill, so it is its own row and never shows
// up in a report about spending.

import {
	balancesBetween,
	divide,
	parseCalendarDate,
	SplitError,
	type SplitMethod,
	settleUp,
} from "@cofre/core";
import { expenseSplits, settlements as settlementTable, transactions } from "@cofre/db";
import { assertCan, readableSpaceIds } from "../actor.ts";
import { asNumber } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import {
	type ExpenseSplit,
	type Settlement,
	toExpenseSplit,
	toSettlement,
	toTransaction,
} from "../models.ts";
import { marks } from "../sql.ts";
import { insertRow, softDeleteRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

export type SplitInput = {
	transactionId: string;
	method: SplitMethod;
	/** Who takes part. Empty means everybody active in the space. */
	userIds?: string[];
	/** Used by the shares method, in the same order as the people. */
	weights?: number[];
	/** Who actually paid. Empty leaves it as it is, or as whoever wrote the record. */
	paidBy?: string | null;
};

export type PersonBalance = {
	userId: string;
	/** Positive when the others owe this person, negative when they owe the others. */
	amount: number;
};

export type SettleSuggestion = { fromUserId: string; toUserId: string; amount: number };

const SPLIT_SELECT = `SELECT "id", "space_id", "transaction_id", "user_id", "amount",
	"created_by", "created_at", "updated_at"
	FROM "expense_splits"`;

const SETTLEMENT_SELECT = `SELECT "id", "space_id", "from_user_id", "to_user_id", "amount",
	"currency", "happened_on", "note", "created_by", "created_at", "updated_at"
	FROM "settlements"`;

const TRANSACTION_SELECT = `SELECT "id", "space_id", "kind", "status", "amount", "currency",
	"fx_rate", "amount_in_base", "happened_on", "description", "account_id",
	"counter_account_id", "notes", "reconciled_at", "installment_group", "installment_number",
	"installment_count", "invoice_month", "category_id", "priority", "recurrence_id", "paid_by",
	"created_by", "created_at", "updated_at"
	FROM "transactions"`;

export function createSharingRepository(context: RepositoryContext) {
	async function transactionIn(spaceIds: string[], id: string) {
		const rows = await context.driver.all(
			`${TRANSACTION_SELECT} WHERE "id" = ? AND "space_id" IN (${marks(spaceIds.length)})
			 AND "deleted_at" IS NULL`,
			[id, ...spaceIds],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("transaction", id);
		return toTransaction(first);
	}

	/** Everybody who is actually in the space, with what they said they earn. */
	async function membersOf(spaceId: string) {
		const rows = await context.driver.all(
			`SELECT "user_id", "monthly_income" FROM "space_members"
			 WHERE "space_id" = ? AND "state" = 'active' AND "deleted_at" IS NULL
			 ORDER BY "created_at"`,
			[spaceId],
		);
		return rows.map((row) => ({
			userId: String(row.user_id),
			monthlyIncome: row.monthly_income === null ? null : asNumber(row.monthly_income),
		}));
	}

	return {
		/** The parts of one expense, or nothing when it was never divided. */
		async splitsOf(transactionId: string): Promise<ExpenseSplit[]> {
			const spaceIds = readableSpaceIds(context.actor());
			if (spaceIds.length === 0) return [];
			const found = await transactionIn(spaceIds, transactionId);
			assertCan(context.actor(), found.spaceId, "sharing.read");

			const rows = await context.driver.all(
				`${SPLIT_SELECT} WHERE "transaction_id" = ? AND "deleted_at" IS NULL ORDER BY "created_at"`,
				[transactionId],
			);
			return rows.map(toExpenseSplit);
		},

		/**
		 * Divides one expense between people. Writing it again replaces what was there,
		 * because a division is one answer and not a pile of attempts.
		 */
		async split(input: SplitInput): Promise<ExpenseSplit[]> {
			const spaceIds = readableSpaceIds(context.actor());
			if (spaceIds.length === 0) throw new NotFoundError("transaction", input.transactionId);
			const found = await transactionIn(spaceIds, input.transactionId);
			assertCan(context.actor(), found.spaceId, "sharing.write");

			if (found.kind !== "expense") {
				throw new RuleError(
					"onlyExpensesAreSplit",
					"only an expense is divided between people, because only an expense is a cost",
				);
			}

			const members = await membersOf(found.spaceId);
			if (members.length < 2) {
				throw new RuleError(
					"splitNeedsPeople",
					"there is nobody to divide this with, this space has one person in it",
				);
			}

			const chosen = input.userIds && input.userIds.length > 0 ? input.userIds : null;
			const taking = chosen ? members.filter((member) => chosen.includes(member.userId)) : members;

			if (chosen && taking.length !== chosen.length) {
				throw new RuleError(
					"splitNeedsMembers",
					"somebody in this division does not belong to the space",
				);
			}

			const participants = taking.map((member, index) => ({
				userId: member.userId,
				monthlyIncome: member.monthlyIncome,
				weight: input.weights?.[index],
			}));

			let parts: { userId: string; amount: number }[];
			try {
				parts = divide(Math.abs(found.amount), input.method, participants);
			} catch (error) {
				// The core says why in a word, and the word is what the interface reads.
				if (error instanceof SplitError) throw new RuleError(error.rule, error.message);
				throw error;
			}

			const payer = input.paidBy ?? found.paidBy ?? found.createdBy;
			if (!members.some((member) => member.userId === payer)) {
				throw new RuleError("payerIsNotAMember", "whoever paid has to belong to the space");
			}

			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };

				const old = await tx.all(
					`SELECT "id" FROM "expense_splits" WHERE "transaction_id" = ? AND "deleted_at" IS NULL`,
					[input.transactionId],
				);
				for (const row of old) {
					await softDeleteRow(write, {
						table: expenseSplits,
						spaceId: found.spaceId,
						id: String(row.id),
					});
				}

				for (const part of parts) {
					await insertRow(write, {
						table: expenseSplits,
						spaceId: found.spaceId,
						values: {
							transaction_id: input.transactionId,
							user_id: part.userId,
							amount: part.amount,
							created_by: context.actor().userId,
						},
					});
				}

				if (payer !== found.paidBy) {
					await updateRow(write, {
						table: transactions,
						spaceId: found.spaceId,
						id: found.id,
						values: { paid_by: payer },
					});
				}
			});

			return this.splitsOf(input.transactionId);
		},

		/** Undoes a division, leaving the expense as one person's. */
		async clearSplit(transactionId: string): Promise<void> {
			const spaceIds = readableSpaceIds(context.actor());
			if (spaceIds.length === 0) throw new NotFoundError("transaction", transactionId);
			const found = await transactionIn(spaceIds, transactionId);
			assertCan(context.actor(), found.spaceId, "sharing.write");

			const rows = await context.driver.all(
				`SELECT "id" FROM "expense_splits" WHERE "transaction_id" = ? AND "deleted_at" IS NULL`,
				[transactionId],
			);
			for (const row of rows) {
				await softDeleteRow(context.write(), {
					table: expenseSplits,
					spaceId: found.spaceId,
					id: String(row.id),
				});
			}
		},

		async settlements(spaceId: string): Promise<Settlement[]> {
			assertCan(context.actor(), spaceId, "sharing.read");
			const rows = await context.driver.all(
				`${SETTLEMENT_SELECT} WHERE "space_id" = ? AND "deleted_at" IS NULL
				 ORDER BY "happened_on" DESC, "created_at" DESC`,
				[spaceId],
			);
			return rows.map(toSettlement);
		},

		/** Records that one person paid another back. */
		async settle(input: {
			spaceId: string;
			fromUserId: string;
			toUserId: string;
			amount: number;
			happenedOn: string;
			note?: string | null;
		}): Promise<Settlement> {
			assertCan(context.actor(), input.spaceId, "sharing.write");
			parseCalendarDate(input.happenedOn);

			if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
				throw new RuleError("amountIsPositiveInteger", "paying somebody back is a positive amount");
			}
			if (input.fromUserId === input.toUserId) {
				throw new RuleError("settlementNeedsTwoPeople", "somebody cannot pay themselves back");
			}

			const members = await membersOf(input.spaceId);
			const inside = (userId: string) => members.some((member) => member.userId === userId);
			if (!inside(input.fromUserId) || !inside(input.toUserId)) {
				throw new RuleError("payerIsNotAMember", "both people have to belong to the space");
			}

			const rows = await context.driver.all(
				`SELECT "base_currency" FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
				[input.spaceId],
			);

			const id = await insertRow(context.write(), {
				table: settlementTable,
				spaceId: input.spaceId,
				values: {
					from_user_id: input.fromUserId,
					to_user_id: input.toUserId,
					amount: input.amount,
					currency: String(rows[0]?.base_currency ?? "BRL"),
					happened_on: input.happenedOn,
					note: input.note ?? null,
					created_by: context.actor().userId,
				},
			});

			const written = await context.driver.all(`${SETTLEMENT_SELECT} WHERE "id" = ?`, [id]);
			const first = written[0];
			if (!first) throw new NotFoundError("settlement", id);
			return toSettlement(first);
		},

		async forgetSettlement(id: string): Promise<void> {
			const spaceIds = readableSpaceIds(context.actor());
			if (spaceIds.length === 0) throw new NotFoundError("settlement", id);
			const rows = await context.driver.all(
				`${SETTLEMENT_SELECT} WHERE "id" = ? AND "space_id" IN (${marks(spaceIds.length)})
				 AND "deleted_at" IS NULL`,
				[id, ...spaceIds],
			);
			const first = rows[0];
			if (!first) throw new NotFoundError("settlement", id);
			const found = toSettlement(first);

			assertCan(context.actor(), found.spaceId, "sharing.write");
			await softDeleteRow(context.write(), {
				table: settlementTable,
				spaceId: found.spaceId,
				id,
			});
		},

		/**
		 * Where everybody stands: what was divided, minus what was already paid back. A
		 * person with nothing to their name is left out, because a list of zeros is not
		 * an answer to anything.
		 */
		async balances(spaceId: string): Promise<PersonBalance[]> {
			assertCan(context.actor(), spaceId, "sharing.read");

			const rows = await context.driver.all(
				`SELECT s."transaction_id" AS transaction_id, s."user_id" AS user_id,
				        s."amount" AS amount, t."amount" AS total,
				        COALESCE(t."paid_by", t."created_by") AS paid_by
				 FROM "expense_splits" s
				 JOIN "transactions" t ON t."id" = s."transaction_id"
				 WHERE s."space_id" = ? AND s."deleted_at" IS NULL AND t."deleted_at" IS NULL`,
				[spaceId],
			);

			const grouped = new Map<
				string,
				{ amount: number; paidBy: string; parts: { userId: string; amount: number }[] }
			>();
			for (const row of rows) {
				const key = String(row.transaction_id);
				const found = grouped.get(key) ?? {
					amount: Math.abs(asNumber(row.total)),
					paidBy: String(row.paid_by),
					parts: [],
				};
				found.parts.push({ userId: String(row.user_id), amount: asNumber(row.amount) });
				grouped.set(key, found);
			}

			const paid = await this.settlements(spaceId);
			const net = balancesBetween(
				[...grouped.values()],
				paid.map((one) => ({
					fromUserId: one.fromUserId,
					toUserId: one.toUserId,
					amount: one.amount,
				})),
			);

			return [...net.entries()]
				.filter(([, amount]) => amount !== 0)
				.map(([userId, amount]) => ({ userId, amount }))
				.sort((left, right) => right.amount - left.amount);
		},

		/** The shortest list of payments that clears everything. */
		async suggestSettlements(spaceId: string): Promise<SettleSuggestion[]> {
			const balances = await this.balances(spaceId);
			return settleUp(new Map(balances.map((one) => [one.userId, one.amount])));
		},
	};
}

export type SharingRepository = ReturnType<typeof createSharingRepository>;
