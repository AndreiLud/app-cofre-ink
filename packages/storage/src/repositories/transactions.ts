// Transactions: money coming in, money going out, and money moving between accounts.
//
// Three rules live here and nowhere else. The sign of the amount has to match what the
// person said they did. A transfer is one row, so it is never counted twice. And a
// credit card purchase is stamped with the invoice it will be charged on, at the time
// it is written, so changing the closing day later does not move what already closed.

import {
	type CalendarDate,
	type CardCycle,
	invoiceMonthOf,
	money,
	parseCalendarDate,
	planInstallments,
	uuidV7,
} from "@cofre/core";
import { transactions } from "@cofre/db";
import { assertCan, readableSpaceIds, seesOwnRowsOnly } from "../actor.ts";
import { asNumber, type SqlValue } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import {
	type Account,
	type AccountBalance,
	type Transaction,
	type TransactionKind,
	type TransactionStatus,
	toAccount,
	toTransaction,
} from "../models.ts";
import { marks } from "../sql.ts";
import { insertRow, softDeleteRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

const SELECT = `SELECT "id", "space_id", "kind", "status", "amount", "currency", "fx_rate",
	"amount_in_base", "happened_on", "description", "account_id", "counter_account_id", "notes",
	"reconciled_at", "installment_group", "installment_number", "installment_count",
	"invoice_month", "created_by", "created_at", "updated_at"
	FROM "transactions"`;

export type CreateTransactionInput = {
	spaceId: string;
	kind: TransactionKind;
	/** Always positive. The sign comes from the kind, so nobody has to remember it. */
	amount: number;
	happenedOn: CalendarDate;
	description: string;
	accountId: string;
	/** Where the money lands, required for a transfer. */
	counterAccountId?: string | null;
	status?: TransactionStatus;
	currency?: string;
	/** Scaled by ten to the eighth, needed when the currency is not the one of the space. */
	fxRate?: number | null;
	notes?: string | null;
	/** More than one turns the purchase into that many installments. */
	installments?: number;
};

export type UpdateTransactionInput = {
	amount?: number;
	happenedOn?: CalendarDate;
	description?: string;
	accountId?: string;
	counterAccountId?: string | null;
	status?: TransactionStatus;
	notes?: string | null;
};

export type TransactionFilter = {
	spaceId?: string;
	accountId?: string;
	kind?: TransactionKind;
	status?: TransactionStatus;
	from?: CalendarDate;
	to?: CalendarDate;
	invoiceMonth?: string;
	/** Matches the description, case insensitive. */
	search?: string;
	installmentGroup?: string;
	limit?: number;
	offset?: number;
};

function signFor(kind: TransactionKind, amount: number): number {
	if (!Number.isSafeInteger(amount) || amount <= 0) {
		throw new RuleError(
			"amountIsPositiveInteger",
			"the amount is a positive integer of minor units, and the direction comes from the kind",
		);
	}
	return kind === "expense" ? -amount : amount;
}

function cycleOf(account: Account): CardCycle | undefined {
	if (account.kind !== "credit") return undefined;
	if (account.closingDay === null || account.dueDay === null) return undefined;
	return { closingDay: account.closingDay, dueDay: account.dueDay };
}

export function createTransactionsRepository(context: RepositoryContext) {
	async function accountIn(spaceId: string, accountId: string): Promise<Account> {
		const rows = await context.driver.all(
			`SELECT "id", "space_id", "kind", "name", "currency", "initial_balance", "institution",
			        "archived_at", "closing_day", "due_day", "credit_limit", "created_by",
			        "created_at", "updated_at"
			 FROM "accounts" WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL`,
			[accountId, spaceId],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("account", accountId);
		return toAccount(first);
	}

	async function reachable(id: string): Promise<Transaction> {
		const spaceIds = readableSpaceIds(context.actor());
		if (spaceIds.length === 0) throw new NotFoundError("transaction", id);
		const rows = await context.driver.all(
			`${SELECT} WHERE "id" = ? AND "space_id" IN (${marks(spaceIds.length)}) AND "deleted_at" IS NULL`,
			[id, ...spaceIds],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("transaction", id);

		const found = toTransaction(first);
		// A logger sees only what they wrote, so anything else does not exist for them.
		if (
			seesOwnRowsOnly(context.actor(), found.spaceId) &&
			found.createdBy !== context.actor().userId
		) {
			throw new NotFoundError("transaction", id);
		}
		return found;
	}

	function baseAmount(
		amount: number,
		currency: string,
		spaceCurrency: string,
		fxRate?: number | null,
	): number {
		if (currency === spaceCurrency) return amount;
		if (!fxRate || !Number.isSafeInteger(fxRate) || fxRate <= 0) {
			throw new RuleError(
				"rateIsRequired",
				"a record in another currency needs the rate used at the time",
			);
		}
		// The rate is scaled by ten to the eighth, and the result stays an integer.
		return Math.round((amount * fxRate) / 100_000_000);
	}

	/** Every part of one purchase, whatever the filters in play. */
	async function listGroup(groupId: string): Promise<Transaction[]> {
		const spaceIds = readableSpaceIds(context.actor());
		if (spaceIds.length === 0) return [];
		const rows = await context.driver.all(
			`${SELECT} WHERE "installment_group" = ? AND "space_id" IN (${marks(spaceIds.length)})
			 AND "deleted_at" IS NULL ORDER BY "installment_number"`,
			[groupId, ...spaceIds],
		);
		return rows.map(toTransaction);
	}

	async function spaceCurrencyOf(spaceId: string): Promise<string> {
		const rows = await context.driver.all(
			`SELECT "base_currency" FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
			[spaceId],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("space", spaceId);
		return String(first.base_currency);
	}

	return {
		/**
		 * Writes one record, or as many as the purchase has installments. Everything is
		 * written in one transaction, so a purchase never ends up half recorded.
		 */
		async create(input: CreateTransactionInput): Promise<Transaction[]> {
			assertCan(context.actor(), input.spaceId, "transaction.create");
			parseCalendarDate(input.happenedOn);
			// Checked before anything else, and never quietly turned positive: a negative
			// amount here means whoever called got the contract wrong, and guessing what
			// they meant is how money ends up on the wrong side of a report.
			signFor(input.kind, input.amount);

			if (input.description.trim() === "") {
				throw new RuleError(
					"descriptionIsRequired",
					"a record needs a description to be found later",
				);
			}

			const account = await accountIn(input.spaceId, input.accountId);
			if (account.archivedAt !== null) {
				throw new RuleError(
					"accountIsArchived",
					"this account is archived, bring it back before writing to it",
				);
			}

			if (input.kind === "transfer") {
				if (!input.counterAccountId) {
					throw new RuleError("transferNeedsDestination", "a transfer needs an account to land in");
				}
				if (input.counterAccountId === input.accountId) {
					throw new RuleError(
						"transferNeedsTwoAccounts",
						"a transfer needs two different accounts",
					);
				}
				await accountIn(input.spaceId, input.counterAccountId);
			} else if (input.counterAccountId) {
				throw new RuleError(
					"onlyTransfersHaveDestination",
					"only a transfer moves money into another account",
				);
			}

			const currency = input.currency ?? account.currency;
			const spaceCurrency = await spaceCurrencyOf(input.spaceId);
			const cycle = cycleOf(account);
			const count = input.installments ?? 1;
			const status = input.status ?? "settled";

			if (count > 1 && input.kind === "transfer") {
				throw new RuleError("transfersAreNotSplit", "a transfer is not split into installments");
			}

			const parts = planInstallments({
				total: money(input.amount, currency),
				count,
				purchasedOn: input.happenedOn,
				cycle,
			});

			const group = count > 1 ? uuidV7() : null;

			const written = await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				const ids: string[] = [];

				for (const part of parts) {
					const amount = signFor(input.kind, part.amount.amount);
					const id = await insertRow(write, {
						table: transactions,
						spaceId: input.spaceId,
						values: {
							kind: input.kind,
							status,
							amount,
							currency,
							fx_rate: input.fxRate ?? null,
							amount_in_base: baseAmount(amount, currency, spaceCurrency, input.fxRate),
							happened_on: part.happenedOn,
							description:
								count > 1
									? `${input.description.trim()} ${part.number}/${part.count}`
									: input.description.trim(),
							account_id: input.accountId,
							counter_account_id: input.counterAccountId ?? null,
							notes: input.notes ?? null,
							reconciled_at: null,
							installment_group: group,
							installment_number: count > 1 ? part.number : null,
							installment_count: count > 1 ? part.count : null,
							invoice_month: part.invoiceMonth ?? null,
							created_by: context.actor().userId,
						},
					});
					ids.push(id);
				}
				return ids;
			});

			const rows = await context.driver.all(
				`${SELECT} WHERE "id" IN (${marks(written.length)}) ORDER BY "happened_on"`,
				written,
			);
			return rows.map(toTransaction);
		},

		async list(filter: TransactionFilter = {}): Promise<Transaction[]> {
			const actor = context.actor();
			const spaceIds = filter.spaceId
				? [filter.spaceId]
				: readableSpaceIds(actor).filter((id) => context.can(id, "transaction.read"));

			if (filter.spaceId) assertCan(actor, filter.spaceId, "transaction.read");
			if (spaceIds.length === 0) return [];

			const where: string[] = [`"space_id" IN (${marks(spaceIds.length)})`, `"deleted_at" IS NULL`];
			const params: SqlValue[] = [...spaceIds];

			// A logger reads their own rows. Every other role reads the whole space.
			const hidden = spaceIds.filter((id) => seesOwnRowsOnly(actor, id));
			if (hidden.length > 0) {
				where.push(`("space_id" NOT IN (${marks(hidden.length)}) OR "created_by" = ?)`);
				params.push(...hidden, actor.userId);
			}

			if (filter.accountId) {
				where.push(`("account_id" = ? OR "counter_account_id" = ?)`);
				params.push(filter.accountId, filter.accountId);
			}
			if (filter.kind) {
				where.push(`"kind" = ?`);
				params.push(filter.kind);
			}
			if (filter.status) {
				where.push(`"status" = ?`);
				params.push(filter.status);
			}
			if (filter.from) {
				where.push(`"happened_on" >= ?`);
				params.push(filter.from);
			}
			if (filter.to) {
				where.push(`"happened_on" <= ?`);
				params.push(filter.to);
			}
			if (filter.invoiceMonth) {
				where.push(`"invoice_month" = ?`);
				params.push(filter.invoiceMonth);
			}
			if (filter.installmentGroup) {
				where.push(`"installment_group" = ?`);
				params.push(filter.installmentGroup);
			}
			if (filter.search && filter.search.trim() !== "") {
				where.push(`lower("description") LIKE ?`);
				params.push(`%${filter.search.trim().toLowerCase()}%`);
			}

			const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
			const offset = Math.max(filter.offset ?? 0, 0);

			const rows = await context.driver.all(
				`${SELECT} WHERE ${where.join(" AND ")}
				 ORDER BY "happened_on" DESC, "created_at" DESC
				 LIMIT ${limit} OFFSET ${offset}`,
				params,
			);
			return rows.map(toTransaction);
		},

		async get(id: string): Promise<Transaction> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "transaction.read");
			return found;
		},

		async update(id: string, input: UpdateTransactionInput): Promise<Transaction> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "transaction.update");

			if (found.reconciledAt !== null) {
				throw new RuleError(
					"reconciledIsFrozen",
					"this record was reconciled against the bank, undo that before changing it",
				);
			}
			if (
				seesOwnRowsOnly(context.actor(), found.spaceId) &&
				found.createdBy !== context.actor().userId
			) {
				throw new NotFoundError("transaction", id);
			}

			const values: Record<string, SqlValue> = {};
			if (input.amount !== undefined) {
				const amount = signFor(found.kind, input.amount);
				values.amount = amount;
				values.amount_in_base = baseAmount(
					amount,
					found.currency,
					await spaceCurrencyOf(found.spaceId),
					found.fxRate,
				);
			}
			if (input.happenedOn !== undefined) {
				parseCalendarDate(input.happenedOn);
				values.happened_on = input.happenedOn;

				const account = await accountIn(found.spaceId, input.accountId ?? found.accountId);
				const cycle = cycleOf(account);
				values.invoice_month = cycle ? invoiceMonthOf(input.happenedOn, cycle) : null;
			}
			if (input.description !== undefined) values.description = input.description.trim();
			if (input.accountId !== undefined) {
				await accountIn(found.spaceId, input.accountId);
				values.account_id = input.accountId;
			}
			if (input.counterAccountId !== undefined) {
				if (input.counterAccountId) await accountIn(found.spaceId, input.counterAccountId);
				values.counter_account_id = input.counterAccountId;
			}
			if (input.status !== undefined) values.status = input.status;
			if (input.notes !== undefined) values.notes = input.notes;

			await updateRow(context.write(), {
				table: transactions,
				spaceId: found.spaceId,
				id,
				values,
			});
			return reachable(id);
		},

		/** Marks a planned record as having actually happened. */
		async settle(id: string): Promise<Transaction> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "transaction.update");
			await updateRow(context.write(), {
				table: transactions,
				spaceId: found.spaceId,
				id,
				values: { status: "settled" },
			});
			return reachable(id);
		},

		/** Ties the record to a line on a bank statement, and freezes it. */
		async reconcile(id: string, reconciled: boolean): Promise<Transaction> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "transaction.reconcile");
			await updateRow(context.write(), {
				table: transactions,
				spaceId: found.spaceId,
				id,
				values: { reconciled_at: reconciled ? context.now() : null },
			});
			return reachable(id);
		},

		async remove(id: string): Promise<void> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "transaction.delete");
			if (found.reconciledAt !== null) {
				throw new RuleError(
					"reconciledIsFrozen",
					"this record was reconciled against the bank, undo that before removing it",
				);
			}
			if (
				seesOwnRowsOnly(context.actor(), found.spaceId) &&
				found.createdBy !== context.actor().userId
			) {
				throw new NotFoundError("transaction", id);
			}
			await softDeleteRow(context.write(), {
				table: transactions,
				spaceId: found.spaceId,
				id,
			});
		},

		/** Removes every installment of one purchase at once. */
		async removeGroup(groupId: string): Promise<number> {
			const rows = await listGroup(groupId);
			if (rows.length === 0) throw new NotFoundError("installments", groupId);
			assertCan(context.actor(), rows[0]?.spaceId ?? "", "transaction.delete");

			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				for (const row of rows) {
					await softDeleteRow(write, {
						table: transactions,
						spaceId: row.spaceId,
						id: row.id,
					});
				}
			});
			return rows.length;
		},

		/**
		 * What each account is worth. Settled counts what has happened, projected also
		 * counts what is planned, which is the number that answers "will this clear".
		 */
		async balances(spaceId: string): Promise<AccountBalance[]> {
			assertCan(context.actor(), spaceId, "account.read");

			const rows = await context.driver.all(
				`SELECT a."id" AS account_id, a."currency" AS currency, a."initial_balance" AS initial,
				  COALESCE((SELECT SUM(CASE WHEN t."kind" = 'transfer' THEN -t."amount" ELSE t."amount" END)
				            FROM "transactions" t
				            WHERE t."account_id" = a."id" AND t."deleted_at" IS NULL
				              AND t."status" = 'settled'), 0) AS out_settled,
				  COALESCE((SELECT SUM(t."amount") FROM "transactions" t
				            WHERE t."counter_account_id" = a."id" AND t."deleted_at" IS NULL
				              AND t."status" = 'settled'), 0) AS in_settled,
				  COALESCE((SELECT SUM(CASE WHEN t."kind" = 'transfer' THEN -t."amount" ELSE t."amount" END)
				            FROM "transactions" t
				            WHERE t."account_id" = a."id" AND t."deleted_at" IS NULL), 0) AS out_all,
				  COALESCE((SELECT SUM(t."amount") FROM "transactions" t
				            WHERE t."counter_account_id" = a."id" AND t."deleted_at" IS NULL), 0) AS in_all
				 FROM "accounts" a
				 WHERE a."space_id" = ? AND a."deleted_at" IS NULL
				 ORDER BY a."name"`,
				[spaceId],
			);

			return rows.map((row) => {
				const initial = asNumber(row.initial);
				return {
					accountId: String(row.account_id),
					currency: String(row.currency),
					settled: initial + asNumber(row.out_settled) + asNumber(row.in_settled),
					projected: initial + asNumber(row.out_all) + asNumber(row.in_all),
				};
			});
		},
	};
}

export type TransactionsRepository = ReturnType<typeof createTransactionsRepository>;
