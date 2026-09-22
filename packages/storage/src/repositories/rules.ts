// Rules that sort a record without anybody being asked.
//
// A rule is a piece of text, a category and an order. It runs when a record is written
// with no category of its own, and it can be run again over what is already there. It
// never overwrites a choice somebody made by hand: a record that already has a category
// is left alone unless the person asks for the opposite.

import { pickRule, type SpendingPriority } from "@cofre/core";
import { categorizationRules, transactions } from "@cofre/db";
import { assertCan, readableSpaceIds, seesOwnRowsOnly } from "../actor.ts";
import type { SqlValue } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import {
	type CategorizationRule,
	type TransactionKind,
	toCategorizationRule,
	toTransaction,
} from "../models.ts";
import { marks } from "../sql.ts";
import { insertRow, softDeleteRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

export type CreateRuleInput = {
	spaceId: string;
	matchText: string;
	categoryId: string;
	accountId?: string | null;
	kind?: TransactionKind | null;
	priority?: SpendingPriority | null;
	position?: number;
};

export type UpdateRuleInput = {
	matchText?: string;
	categoryId?: string;
	accountId?: string | null;
	kind?: TransactionKind | null;
	priority?: SpendingPriority | null;
	position?: number;
	disabled?: boolean;
};

const SELECT = `SELECT "id", "space_id", "match_text", "account_id", "kind", "category_id",
	"priority", "position", "disabled_at", "created_by", "created_at", "updated_at"
	FROM "categorization_rules"`;

export function createRulesRepository(context: RepositoryContext) {
	async function reachable(id: string): Promise<CategorizationRule> {
		const spaceIds = readableSpaceIds(context.actor());
		if (spaceIds.length === 0) throw new NotFoundError("rule", id);
		const rows = await context.driver.all(
			`${SELECT} WHERE "id" = ? AND "space_id" IN (${marks(spaceIds.length)}) AND "deleted_at" IS NULL`,
			[id, ...spaceIds],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("rule", id);
		return toCategorizationRule(first);
	}

	async function categoryIn(spaceId: string, categoryId: string): Promise<string> {
		const rows = await context.driver.all(
			`SELECT "id" FROM "categories" WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL`,
			[categoryId, spaceId],
		);
		if (rows.length === 0) throw new NotFoundError("category", categoryId);
		return categoryId;
	}

	function checkText(text: string): string {
		const trimmed = text.trim();
		if (trimmed.length < 2) {
			throw new RuleError(
				"matchTextIsTooShort",
				"a rule needs at least two letters to match on, otherwise it matches everything",
			);
		}
		return trimmed;
	}

	async function activeRules(spaceId: string): Promise<CategorizationRule[]> {
		const rows = await context.driver.all(
			`${SELECT} WHERE "space_id" = ? AND "deleted_at" IS NULL AND "disabled_at" IS NULL
			 ORDER BY "position", "created_at"`,
			[spaceId],
		);
		return rows.map(toCategorizationRule);
	}

	return {
		async list(spaceId: string): Promise<CategorizationRule[]> {
			assertCan(context.actor(), spaceId, "rule.read");
			const rows = await context.driver.all(
				`${SELECT} WHERE "space_id" = ? AND "deleted_at" IS NULL ORDER BY "position", "created_at"`,
				[spaceId],
			);
			return rows.map(toCategorizationRule);
		},

		async create(input: CreateRuleInput): Promise<CategorizationRule> {
			assertCan(context.actor(), input.spaceId, "rule.write");
			const matchText = checkText(input.matchText);
			await categoryIn(input.spaceId, input.categoryId);

			const id = await insertRow(context.write(), {
				table: categorizationRules,
				spaceId: input.spaceId,
				values: {
					match_text: matchText,
					account_id: input.accountId ?? null,
					kind: input.kind ?? null,
					category_id: input.categoryId,
					priority: input.priority ?? null,
					position: input.position ?? 0,
					disabled_at: null,
					created_by: context.actor().userId,
				},
			});
			return reachable(id);
		},

		async update(id: string, input: UpdateRuleInput): Promise<CategorizationRule> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "rule.write");

			const values: Record<string, SqlValue> = {};
			if (input.matchText !== undefined) values.match_text = checkText(input.matchText);
			if (input.categoryId !== undefined) {
				values.category_id = await categoryIn(found.spaceId, input.categoryId);
			}
			if (input.accountId !== undefined) values.account_id = input.accountId;
			if (input.kind !== undefined) values.kind = input.kind;
			if (input.priority !== undefined) values.priority = input.priority;
			if (input.position !== undefined) values.position = input.position;
			if (input.disabled !== undefined) values.disabled_at = input.disabled ? context.now() : null;

			await updateRow(context.write(), {
				table: categorizationRules,
				spaceId: found.spaceId,
				id,
				values,
			});
			return reachable(id);
		},

		async remove(id: string): Promise<void> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "rule.write");
			await softDeleteRow(context.write(), {
				table: categorizationRules,
				spaceId: found.spaceId,
				id,
			});
		},

		/** What the rules would do to one record, without writing anything. */
		async suggest(input: {
			spaceId: string;
			description: string;
			accountId: string;
			kind: TransactionKind;
		}): Promise<CategorizationRule | null> {
			assertCan(context.actor(), input.spaceId, "rule.read");
			return pickRule(await activeRules(input.spaceId), {
				description: input.description,
				accountId: input.accountId,
				kind: input.kind,
			});
		},

		/**
		 * Runs the rules over what is already there. Only records with no category are
		 * touched, because a person who sorted something by hand has already answered the
		 * question and a rule written later does not get to overrule them.
		 */
		async applyToExisting(input: { spaceId: string; from?: string; to?: string }): Promise<number> {
			assertCan(context.actor(), input.spaceId, "rule.write");
			assertCan(context.actor(), input.spaceId, "transaction.update");

			const rules = await activeRules(input.spaceId);
			if (rules.length === 0) return 0;

			const where = [`"space_id" = ?`, `"deleted_at" IS NULL`, `"category_id" IS NULL`];
			const params: SqlValue[] = [input.spaceId];
			// A transfer is not spending, so it is never sorted into a category.
			where.push(`"kind" <> 'transfer'`);
			if (input.from) {
				where.push(`"happened_on" >= ?`);
				params.push(input.from);
			}
			if (input.to) {
				where.push(`"happened_on" <= ?`);
				params.push(input.to);
			}
			if (seesOwnRowsOnly(context.actor(), input.spaceId)) {
				where.push(`"created_by" = ?`);
				params.push(context.actor().userId);
			}

			const rows = await context.driver.all(
				`SELECT "id", "space_id", "kind", "status", "amount", "currency", "fx_rate",
				 "amount_in_base", "happened_on", "description", "account_id", "counter_account_id",
				 "notes", "reconciled_at", "installment_group", "installment_number",
				 "installment_count", "invoice_month", "category_id", "priority", "recurrence_id",
				 "created_by", "created_at", "updated_at"
				 FROM "transactions" WHERE ${where.join(" AND ")} LIMIT 2000`,
				params,
			);

			const sorted = rows
				.map(toTransaction)
				.map((record) => ({ record, rule: pickRule(rules, record) }))
				.filter((pair) => pair.rule !== null && pair.record.reconciledAt === null);

			if (sorted.length === 0) return 0;

			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				for (const { record, rule } of sorted) {
					await updateRow(write, {
						table: transactions,
						spaceId: record.spaceId,
						id: record.id,
						values: {
							category_id: rule?.categoryId ?? null,
							...(rule?.priority ? { priority: rule.priority } : {}),
						},
					});
				}
			});

			return sorted.length;
		},
	};
}

export type RulesRepository = ReturnType<typeof createRulesRepository>;
