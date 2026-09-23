// Writing a statement down.
//
// A file arrives, somebody looks at it, and then a few hundred records are written at
// once. Doing that through the ordinary create path would mean a few hundred database
// transactions, so this repository writes the lot inside one, and refuses the lot if
// any line is wrong. Half an imported statement is worse than none: nobody can tell
// which half is missing.
//
// The rules of the space still get their say, so an imported statement arrives sorted
// the way a typed record would be. What this path does not do is guess about
// duplicates. The reading side marks what looks familiar, the person decides, and only
// what they kept reaches here.

import {
	type CalendarDate,
	type CardCycle,
	invoiceMonthOf,
	parseCalendarDate,
	pickRule,
} from "@cofre/core";
import { transactions } from "@cofre/db";
import { assertCan } from "../actor.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { type Account, type SpendingPriority, toAccount, toCategorizationRule } from "../models.ts";
import { marks } from "../sql.ts";
import { insertRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

/** One line of a statement, the way a file gives it: a signed amount and a day. */
export type ImportedRecord = {
	happenedOn: CalendarDate;
	/** Signed minor units. Negative is money leaving, which is what a statement says. */
	amount: number;
	description: string;
	notes?: string | null;
	/** What the bank called it, kept so the same file read twice does not double. */
	externalId?: string | null;
	categoryId?: string | null;
	priority?: SpendingPriority | null;
};

export type ImportInput = {
	spaceId: string;
	/** Every line of one file belongs to one account, which the person picks. */
	accountId: string;
	/**
	 * And to one piece of plastic, when the file says which. A statement names a card by
	 * its four digits, so this is usually worked out rather than chosen.
	 */
	cardId?: string | null;
	records: ImportedRecord[];
};

export type ImportResult = {
	written: number;
	ids: string[];
};

/** What the reading side compares a file against, to say what is already here. */
export type KnownRecord = {
	id: string;
	happenedOn: string;
	amount: number;
	description: string;
	externalId: string | null;
};

function cycleOf(account: Account): CardCycle | undefined {
	if (account.kind !== "credit") return undefined;
	if (account.closingDay === null || account.dueDay === null) return undefined;
	return { closingDay: account.closingDay, dueDay: account.dueDay };
}

export function createImportsRepository(context: RepositoryContext) {
	async function accountIn(spaceId: string, accountId: string): Promise<Account> {
		const rows = await context.driver.all(
			`SELECT "id", "space_id", "kind", "name", "currency", "initial_balance", "institution",
			        "archived_at", "closing_day", "due_day", "credit_limit", "benefit", "created_by",
			        "created_at", "updated_at"
			 FROM "accounts" WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL`,
			[accountId, spaceId],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("account", accountId);
		return toAccount(first);
	}

	return {
		/**
		 * What the space already has around the days a file covers, so the reading side
		 * can mark what looks familiar. Only the four fields that decide it, because this
		 * runs over a window that can be a whole year.
		 */
		async existing(
			spaceId: string,
			range: { from?: CalendarDate; to?: CalendarDate; accountId?: string } = {},
		): Promise<KnownRecord[]> {
			assertCan(context.actor(), spaceId, "transaction.read");

			const where = [`"space_id" = ?`, `"deleted_at" IS NULL`];
			const params: (string | number)[] = [spaceId];

			if (range.accountId) {
				where.push(`"account_id" = ?`);
				params.push(range.accountId);
			}
			if (range.from) {
				where.push(`"happened_on" >= ?`);
				params.push(range.from);
			}
			if (range.to) {
				where.push(`"happened_on" <= ?`);
				params.push(range.to);
			}

			const rows = await context.driver.all(
				`SELECT "id", "happened_on", "amount", "description", "external_id"
				 FROM "transactions" WHERE ${where.join(" AND ")}
				 ORDER BY "happened_on" LIMIT 5000`,
				params,
			);

			return rows.map((row) => ({
				id: String(row.id),
				happenedOn: String(row.happened_on),
				amount: Number(row.amount),
				description: String(row.description),
				externalId: row.external_id === null ? null : String(row.external_id),
			}));
		},

		/** Every line of the file, in one database transaction, or nothing at all. */
		async create(input: ImportInput): Promise<ImportResult> {
			assertCan(context.actor(), input.spaceId, "transaction.create");
			if (input.records.length === 0) return { written: 0, ids: [] };

			const account = await accountIn(input.spaceId, input.accountId);
			if (account.archivedAt !== null) {
				throw new RuleError(
					"accountIsArchived",
					"this account is archived, bring it back before writing to it",
				);
			}

			const spaceRows = await context.driver.all(
				`SELECT "base_currency" FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
				[input.spaceId],
			);
			const spaceCurrency = String(spaceRows[0]?.base_currency ?? "BRL");
			if (account.currency !== spaceCurrency) {
				throw new RuleError(
					"importNeedsTheSameCurrency",
					"this account keeps another currency, so a file cannot be read into it yet",
				);
			}

			// Checked before a single row is written, because the point of one database
			// transaction is that a bad line stops the whole file rather than half of it.
			const chosen = [...new Set(input.records.map((record) => record.categoryId ?? ""))].filter(
				(id) => id !== "",
			);
			if (chosen.length > 0) {
				const found = await context.driver.all(
					`SELECT "id" FROM "categories"
					 WHERE "id" IN (${marks(chosen.length)}) AND "space_id" = ? AND "deleted_at" IS NULL`,
					[...chosen, input.spaceId],
				);
				const known = new Set(found.map((row) => String(row.id)));
				const missing = chosen.find((id) => !known.has(id));
				if (missing !== undefined) throw new NotFoundError("category", missing);
			}

			for (const record of input.records) {
				parseCalendarDate(record.happenedOn);
				if (!Number.isSafeInteger(record.amount) || record.amount === 0) {
					throw new RuleError(
						"amountIsPositiveInteger",
						"every line of the file needs an amount in minor units that is not zero",
					);
				}
				if (record.description.trim() === "") {
					throw new RuleError(
						"descriptionIsRequired",
						"every line of the file needs a description to be found later",
					);
				}
			}

			const ruleRows = await context.driver.all(
				`SELECT "id", "space_id", "match_text", "account_id", "kind", "category_id", "priority",
				 "position", "disabled_at", "created_by", "created_at", "updated_at"
				 FROM "categorization_rules"
				 WHERE "space_id" = ? AND "deleted_at" IS NULL AND "disabled_at" IS NULL
				 ORDER BY "position", "created_at"`,
				[input.spaceId],
			);
			const rules = ruleRows.map(toCategorizationRule);
			const cycle = cycleOf(account);

			// Checked once for the whole file, for the same reason every other check here
			// is: a card that does not reach this account has to stop the import before a
			// single row is written, not halfway through.
			let cardId: string | null = null;
			if (input.cardId) {
				const rows = await context.driver.all(
					`SELECT "id" FROM "cards"
					 WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL
					   AND ("credit_account_id" = ? OR "debit_account_id" = ?)`,
					[input.cardId, input.spaceId, input.accountId, input.accountId],
				);
				if (rows.length === 0) {
					throw new RuleError(
						"cardDoesNotReachAccount",
						"this card does not spend from the account the file is being read into",
					);
				}
				cardId = input.cardId;
			}

			const ids = await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				const written: string[] = [];

				for (const record of input.records) {
					const kind = record.amount < 0 ? "expense" : "income";
					const sorted = record.categoryId
						? null
						: pickRule(rules, {
								description: record.description,
								accountId: input.accountId,
								kind,
							});

					const id = await insertRow(write, {
						table: transactions,
						spaceId: input.spaceId,
						values: {
							kind,
							status: "settled",
							amount: record.amount,
							currency: account.currency,
							fx_rate: null,
							amount_in_base: record.amount,
							happened_on: record.happenedOn,
							description: record.description.trim(),
							account_id: input.accountId,
							counter_account_id: null,
							notes: record.notes ?? null,
							reconciled_at: null,
							installment_group: null,
							installment_number: null,
							installment_count: null,
							invoice_month: cycle ? invoiceMonthOf(record.happenedOn, cycle) : null,
							category_id: record.categoryId ?? sorted?.categoryId ?? null,
							priority: record.priority ?? sorted?.priority ?? null,
							external_id: record.externalId ?? null,
							card_id: cardId,
							created_by: context.actor().userId,
						},
					});
					written.push(id);
				}
				return written;
			});

			return { written: ids.length, ids };
		},
	};
}

export type ImportsRepository = ReturnType<typeof createImportsRepository>;
