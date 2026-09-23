// Things that happen again.
//
// A recurrence is a rule, not a queue. Nothing remembers "the next one": the series is
// worked out from the rule every time, so two devices that have not spoken in a month
// reach the same answer. What is written are ordinary planned records carrying the
// identifier of the series, which means every screen that already understands a record
// understands these without knowing anything about recurrence.
//
// Writing them is idempotent by day: a series never produces two records for the same
// date, whatever runs the generation and however often.

import {
	addDays,
	type CalendarDate,
	occurrencesBetween,
	parseCalendarDate,
	type SpendingPriority,
	todayIn,
} from "@cofre/core";
import { recurrences as recurrenceTable, transactions } from "@cofre/db";
import { assertCan, readableSpaceIds } from "../actor.ts";
import type { SqlValue } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import {
	type Recurrence,
	type RecurrenceFrequency,
	type TransactionKind,
	toRecurrence,
} from "../models.ts";
import { marks } from "../sql.ts";
import { insertRow, softDeleteRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

export type CreateRecurrenceInput = {
	spaceId: string;
	description: string;
	kind: TransactionKind;
	/** Always positive. The direction comes from the kind. */
	amount: number;
	accountId: string;
	counterAccountId?: string | null;
	categoryId?: string | null;
	priority?: SpendingPriority | null;
	frequency: RecurrenceFrequency;
	intervalCount?: number;
	dayOfMonth?: number | null;
	monthOfYear?: number | null;
	startsOn: CalendarDate;
	endsOn?: CalendarDate | null;
	currency?: string;
	notes?: string | null;
};

export type UpdateRecurrenceInput = Partial<Omit<CreateRecurrenceInput, "spaceId" | "kind">> & {
	paused?: boolean;
};

const SELECT = `SELECT "id", "space_id", "description", "kind", "amount", "currency",
	"account_id", "counter_account_id", "category_id", "priority", "frequency",
	"interval_count", "day_of_month", "weekday", "month_of_year", "starts_on", "ends_on",
	"notes", "paused_at", "created_by", "created_at", "updated_at"
	FROM "recurrences"`;

/** How far ahead the planned records are written, counted from today. */
export const DEFAULT_HORIZON_DAYS = 62;

export function createRecurrencesRepository(context: RepositoryContext) {
	async function reachable(id: string): Promise<Recurrence> {
		const spaceIds = readableSpaceIds(context.actor());
		if (spaceIds.length === 0) throw new NotFoundError("recurrence", id);
		const rows = await context.driver.all(
			`${SELECT} WHERE "id" = ? AND "space_id" IN (${marks(spaceIds.length)}) AND "deleted_at" IS NULL`,
			[id, ...spaceIds],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("recurrence", id);
		return toRecurrence(first);
	}

	async function accountIn(spaceId: string, accountId: string): Promise<string> {
		const rows = await context.driver.all(
			`SELECT "id", "currency" FROM "accounts" WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL`,
			[accountId, spaceId],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("account", accountId);
		return String(first.currency);
	}

	async function categoryIn(spaceId: string, categoryId: string): Promise<string> {
		const rows = await context.driver.all(
			`SELECT "id" FROM "categories" WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL`,
			[categoryId, spaceId],
		);
		if (rows.length === 0) throw new NotFoundError("category", categoryId);
		return categoryId;
	}

	function checkAmount(amount: number): number {
		if (!Number.isSafeInteger(amount) || amount <= 0) {
			throw new RuleError(
				"amountIsPositiveInteger",
				"the amount is a positive integer of minor units, and the direction comes from the kind",
			);
		}
		return amount;
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

	/**
	 * A series in another currency would need a rate for every day it writes, and a rate
	 * from a year ago is not a rate anybody wants applied to next month. Until the rate
	 * question is answered properly, a recurrence lives in the currency of its space.
	 */
	async function sameCurrency(spaceId: string, accountCurrency: string): Promise<string> {
		const currency = await spaceCurrencyOf(spaceId);
		if (accountCurrency !== currency) {
			throw new RuleError(
				"recurrenceNeedsOneCurrency",
				"a recurring record uses the currency of the space, so pick an account in it",
			);
		}
		return currency;
	}

	async function timezoneOf(spaceId: string): Promise<string> {
		const rows = await context.driver.all(
			`SELECT "timezone" FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
			[spaceId],
		);
		return String(rows[0]?.timezone ?? "America/Sao_Paulo");
	}

	return {
		async list(spaceId: string): Promise<Recurrence[]> {
			assertCan(context.actor(), spaceId, "recurrence.read");
			const rows = await context.driver.all(
				`${SELECT} WHERE "space_id" = ? AND "deleted_at" IS NULL ORDER BY "description"`,
				[spaceId],
			);
			return rows.map(toRecurrence);
		},

		async get(id: string): Promise<Recurrence> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "recurrence.read");
			return found;
		},

		async create(input: CreateRecurrenceInput): Promise<Recurrence> {
			assertCan(context.actor(), input.spaceId, "recurrence.write");
			checkAmount(input.amount);
			parseCalendarDate(input.startsOn);
			if (input.endsOn) parseCalendarDate(input.endsOn);
			if (input.description.trim() === "") {
				throw new RuleError("descriptionIsRequired", "a recurrence needs a description");
			}

			const accountCurrency = await accountIn(input.spaceId, input.accountId);
			const currency = await sameCurrency(input.spaceId, accountCurrency);
			if (input.kind === "transfer" && !input.counterAccountId) {
				throw new RuleError("transferNeedsDestination", "a transfer needs an account to land in");
			}
			if (input.counterAccountId) await accountIn(input.spaceId, input.counterAccountId);
			if (input.categoryId) await categoryIn(input.spaceId, input.categoryId);

			const id = await insertRow(context.write(), {
				table: recurrenceTable,
				spaceId: input.spaceId,
				values: {
					description: input.description.trim(),
					kind: input.kind,
					amount: input.amount,
					currency,
					account_id: input.accountId,
					counter_account_id: input.counterAccountId ?? null,
					category_id: input.categoryId ?? null,
					priority: input.priority ?? null,
					frequency: input.frequency,
					interval_count: input.intervalCount ?? 1,
					day_of_month: input.dayOfMonth ?? null,
					weekday: null,
					month_of_year: input.monthOfYear ?? null,
					starts_on: input.startsOn,
					ends_on: input.endsOn ?? null,
					notes: input.notes ?? null,
					paused_at: null,
					created_by: context.actor().userId,
				},
			});
			return reachable(id);
		},

		async update(id: string, input: UpdateRecurrenceInput): Promise<Recurrence> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "recurrence.write");

			const values: Record<string, SqlValue> = {};
			if (input.description !== undefined) values.description = input.description.trim();
			if (input.amount !== undefined) values.amount = checkAmount(input.amount);
			if (input.accountId !== undefined) {
				await sameCurrency(found.spaceId, await accountIn(found.spaceId, input.accountId));
				values.account_id = input.accountId;
			}
			if (input.counterAccountId !== undefined) {
				if (input.counterAccountId) await accountIn(found.spaceId, input.counterAccountId);
				values.counter_account_id = input.counterAccountId;
			}
			if (input.categoryId !== undefined) {
				values.category_id = input.categoryId
					? await categoryIn(found.spaceId, input.categoryId)
					: null;
			}
			if (input.priority !== undefined) values.priority = input.priority;
			if (input.frequency !== undefined) values.frequency = input.frequency;
			if (input.intervalCount !== undefined) values.interval_count = input.intervalCount;
			if (input.dayOfMonth !== undefined) values.day_of_month = input.dayOfMonth;
			if (input.monthOfYear !== undefined) values.month_of_year = input.monthOfYear;
			if (input.startsOn !== undefined) {
				parseCalendarDate(input.startsOn);
				values.starts_on = input.startsOn;
			}
			if (input.endsOn !== undefined) {
				if (input.endsOn) parseCalendarDate(input.endsOn);
				values.ends_on = input.endsOn;
			}
			if (input.notes !== undefined) values.notes = input.notes;
			if (input.paused !== undefined) values.paused_at = input.paused ? context.now() : null;

			await updateRow(context.write(), {
				table: recurrenceTable,
				spaceId: found.spaceId,
				id,
				values,
			});
			return reachable(id);
		},

		/**
		 * Stops the series. What it already wrote stays, except the records that are
		 * still only planned, because those are promises this series made about days
		 * that have not arrived.
		 */
		async remove(id: string, options: { keepPlanned?: boolean } = {}): Promise<number> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "recurrence.write");

			let removed = 0;
			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };

				if (options.keepPlanned !== true) {
					const planned = await tx.all(
						`SELECT "id" FROM "transactions" WHERE "recurrence_id" = ? AND "status" = 'planned'
						 AND "deleted_at" IS NULL AND "reconciled_at" IS NULL`,
						[id],
					);
					for (const row of planned) {
						await softDeleteRow(write, {
							table: transactions,
							spaceId: found.spaceId,
							id: String(row.id),
						});
						removed += 1;
					}
				}

				await softDeleteRow(write, {
					table: recurrenceTable,
					spaceId: found.spaceId,
					id,
				});
			});
			return removed;
		},

		/**
		 * Writes the planned records this series owes, up to the horizon. Safe to call on
		 * every load: what already exists for a day is never written twice.
		 */
		async materialize(input: { spaceId: string; until?: CalendarDate }): Promise<number> {
			assertCan(context.actor(), input.spaceId, "recurrence.write");

			const today = todayIn(await timezoneOf(input.spaceId));
			const until = input.until ?? addDays(today, DEFAULT_HORIZON_DAYS);

			const rows = await context.driver.all(
				`${SELECT} WHERE "space_id" = ? AND "deleted_at" IS NULL AND "paused_at" IS NULL`,
				[input.spaceId],
			);
			const series = rows.map(toRecurrence);
			if (series.length === 0) return 0;

			let written = 0;

			for (const one of series) {
				const days = occurrencesBetween(
					{
						frequency: one.frequency,
						intervalCount: one.intervalCount,
						startsOn: one.startsOn,
						endsOn: one.endsOn,
						dayOfMonth: one.dayOfMonth,
						monthOfYear: one.monthOfYear,
					},
					one.startsOn,
					until,
				);
				if (days.length === 0) continue;

				const already = await context.driver.all(
					`SELECT "happened_on" FROM "transactions" WHERE "recurrence_id" = ? AND "deleted_at" IS NULL`,
					[one.id],
				);
				const seen = new Set(already.map((row) => String(row.happened_on)));
				const missing = days.filter((day) => !seen.has(day));
				if (missing.length === 0) continue;

				const amount = one.kind === "expense" ? -one.amount : one.amount;

				await context.driver.transaction(async (tx) => {
					const write = { ...context.write(), driver: tx };
					for (const day of missing) {
						await insertRow(write, {
							table: transactions,
							spaceId: one.spaceId,
							values: {
								kind: one.kind,
								// Everything a series writes is a promise, never a fact. It
								// becomes a fact when somebody says it happened.
								status: "planned",
								amount,
								currency: one.currency,
								fx_rate: null,
								// The currency of a series is the currency of its space, so
								// the amount is already the one reports add up.
								amount_in_base: amount,
								happened_on: day,
								description: one.description,
								account_id: one.accountId,
								counter_account_id: one.counterAccountId,
								notes: one.notes,
								reconciled_at: null,
								installment_group: null,
								installment_number: null,
								installment_count: null,
								invoice_month: null,
								category_id: one.categoryId,
								priority: one.priority,
								recurrence_id: one.id,
								created_by: context.actor().userId,
							},
						});
						written += 1;
					}
				});
			}

			return written;
		},
	};
}

export type RecurrencesRepository = ReturnType<typeof createRecurrencesRepository>;
