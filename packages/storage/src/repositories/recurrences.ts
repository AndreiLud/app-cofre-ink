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
	type CardCycle,
	compareCalendarDates,
	invoiceMonthOf,
	monthOf,
	occurrenceId,
	occurrencesBetween,
	parseCalendarDate,
	type RecurrenceSpec,
	type SpendingPriority,
	seriesPeriodOf,
	todayIn,
} from "@cofre/core";
import { recurrences as recurrenceTable, transactions } from "@cofre/db";
import { assertCan, readableSpaceIds } from "../actor.ts";
import { asNumber, type SqlValue } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { stillToComeOn } from "../happened.ts";
import {
	type Recurrence,
	type RecurrenceFrequency,
	type TransactionKind,
	toRecurrence,
} from "../models.ts";
import { marks } from "../sql.ts";
import { insertRow, insertRowIfAbsent, softDeleteRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";
import { assertAccountRules } from "./transactions.ts";

export type CreateRecurrenceInput = {
	spaceId: string;
	description: string;
	kind: TransactionKind;
	/** Always positive. The direction comes from the kind. */
	amount: number;
	accountId: string;
	counterAccountId?: string | null;
	/** The card a series of purchases is charged to, as "Pago com" says of a record. */
	cardId?: string | null;
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

/**
 * A series, with why it stopped when it did: an account or the card it uses deleted or put
 * away. Every condition on it is written against `r`.
 */
const SELECT = `SELECT r."id", r."space_id", r."description", r."kind", r."amount", r."currency",
	r."account_id", r."counter_account_id", r."category_id", r."priority", r."frequency",
	r."interval_count", r."day_of_month", r."weekday", r."month_of_year", r."starts_on",
	r."ends_on", r."notes", r."paused_at", r."card_id", r."writes_from", r."follows_id",
	r."created_by", r."created_at", r."updated_at",
	CASE
		WHEN a."id" IS NULL OR a."deleted_at" IS NOT NULL OR a."archived_at" IS NOT NULL
			THEN 'account'
		WHEN r."counter_account_id" IS NOT NULL
			AND (o."id" IS NULL OR o."deleted_at" IS NOT NULL OR o."archived_at" IS NOT NULL)
			THEN 'account'
		WHEN r."card_id" IS NOT NULL
			AND (c."id" IS NULL OR c."deleted_at" IS NOT NULL OR c."archived_at" IS NOT NULL)
			THEN 'card'
	END AS "stopped_by"
	FROM "recurrences" r
	LEFT JOIN "accounts" a ON a."id" = r."account_id"
	LEFT JOIN "accounts" o ON o."id" = r."counter_account_id"
	LEFT JOIN "cards" c ON c."id" = r."card_id"`;

/** How far ahead the planned records are written, counted from today. */
export const DEFAULT_HORIZON_DAYS = 62;

export function createRecurrencesRepository(context: RepositoryContext) {
	async function reachable(id: string): Promise<Recurrence> {
		const spaceIds = readableSpaceIds(context.actor());
		if (spaceIds.length === 0) throw new NotFoundError("recurrence", id);
		const rows = await context.driver.all(
			`${SELECT} WHERE r."id" = ? AND r."space_id" IN (${marks(spaceIds.length)}) AND r."deleted_at" IS NULL`,
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

	/**
	 * The rules of an account, asked of a series as they are of a record: a series of income
	 * on a voucher, or of moves out of one or out of a credit card, writes every month what a
	 * record may not.
	 */
	async function accountRulesFor(spaceId: string, kind: string, accountId: string): Promise<void> {
		const rows = await context.driver.all(
			`SELECT "kind" FROM "accounts" WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL`,
			[accountId, spaceId],
		);
		assertAccountRules(kind as TransactionKind, { kind: String(rows[0]?.kind ?? "") });
	}

	/**
	 * The cycle of the account a series is charged to, when it has one.
	 *
	 * The same shape the hand written path uses: a credit account with both of its days
	 * set, and nothing for every other kind, so a series on a current account goes on
	 * belonging to no invoice.
	 */
	async function cycleOfAccount(accountId: string): Promise<CardCycle | undefined> {
		const rows = await context.driver.all(
			`SELECT "kind", "closing_day", "due_day" FROM "accounts"
			 WHERE "id" = ? AND "deleted_at" IS NULL`,
			[accountId],
		);
		const first = rows[0];
		if (!first || String(first.kind) !== "credit") return undefined;
		if (first.closing_day === null || first.due_day === null) return undefined;
		return { closingDay: asNumber(first.closing_day), dueDay: asNumber(first.due_day) };
	}

	/** A card of the space, in use, that spends from the account of the series. */
	async function cardIn(spaceId: string, cardId: string, accountId: string): Promise<string> {
		const rows = await context.driver.all(
			`SELECT "credit_account_id", "debit_account_id", "archived_at"
			 FROM "cards" WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL`,
			[cardId, spaceId],
		);
		const card = rows[0];
		if (!card) throw new NotFoundError("card", cardId);
		if (card.archived_at !== null) {
			throw new RuleError("cardIsArchived", "this card is archived, bring it back before using it");
		}
		if (card.credit_account_id !== accountId && card.debit_account_id !== accountId) {
			throw new RuleError(
				"cardDoesNotReachAccount",
				"this card does not spend from the account the series is charged to",
			);
		}
		return cardId;
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

	/** The rule of a series, as the schedule reads it. */
	function specOf(one: Recurrence): RecurrenceSpec {
		return {
			frequency: one.frequency,
			intervalCount: one.intervalCount,
			startsOn: one.startsOn,
			endsOn: one.endsOn,
			dayOfMonth: one.dayOfMonth,
			monthOfYear: one.monthOfYear,
		};
	}

	/** The series a series continues, the one just before it first, up the chain. */
	async function chainBefore(one: Recurrence): Promise<string[]> {
		const ids: string[] = [];
		let next = one.followsId;
		// A chain that loops is a chain somebody wrote by hand, and it ends here.
		while (next !== null && !ids.includes(next) && ids.length < 500) {
			ids.push(next);
			const rows = await context.driver.all(
				`SELECT "follows_id" FROM "recurrences" WHERE "id" = ?`,
				[next],
			);
			const above = rows[0]?.follows_id;
			next = above === null || above === undefined ? null : String(above);
		}
		return ids;
	}

	/**
	 * The periods, from its start on, where a series it continues still has a record: one changed
	 * by hand, which a change of the series leaves where it is. The continuation writes nothing
	 * in them, so the rent of a month is not paid twice.
	 */
	async function periodsKeptBefore(one: Recurrence): Promise<Set<string>> {
		const before = await chainBefore(one);
		if (before.length === 0) return new Set();
		const rows = await context.driver.all(
			`SELECT "happened_on" FROM "transactions"
			 WHERE "recurrence_id" IN (${marks(before.length)}) AND "deleted_at" IS NULL
			   AND "happened_on" >= ?`,
			[...before, one.startsOn],
		);
		return new Set(rows.map((row) => seriesPeriodOf(one.frequency, String(row.happened_on))));
	}

	return {
		async list(spaceId: string): Promise<Recurrence[]> {
			assertCan(context.actor(), spaceId, "recurrence.read");
			const rows = await context.driver.all(
				`${SELECT} WHERE r."space_id" = ? AND r."deleted_at" IS NULL ORDER BY r."description"`,
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
			await accountRulesFor(input.spaceId, input.kind, input.accountId);
			if (input.kind === "transfer" && !input.counterAccountId) {
				throw new RuleError("transferNeedsDestination", "a transfer needs an account to land in");
			}
			if (input.counterAccountId) await accountIn(input.spaceId, input.counterAccountId);
			if (input.categoryId) await categoryIn(input.spaceId, input.categoryId);
			const cardId = input.cardId
				? await cardIn(input.spaceId, input.cardId, input.accountId)
				: null;

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
					card_id: cardId,
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
				if (input.accountId !== found.accountId) {
					await accountRulesFor(found.spaceId, found.kind, input.accountId);
				}
				values.account_id = input.accountId;
			}
			if (input.counterAccountId !== undefined) {
				if (input.counterAccountId) await accountIn(found.spaceId, input.counterAccountId);
				values.counter_account_id = input.counterAccountId;
			}
			// The account and the card keep agreeing: a series moved to an account its card does
			// not reach loses the card rather than charging it somewhere it cannot.
			if (input.cardId !== undefined) {
				values.card_id = input.cardId
					? await cardIn(found.spaceId, input.cardId, input.accountId ?? found.accountId)
					: null;
			} else if (input.accountId !== undefined && found.cardId !== null) {
				const still = await context.driver.all(
					`SELECT "id" FROM "cards" WHERE "id" = ? AND ("credit_account_id" = ? OR "debit_account_id" = ?)`,
					[found.cardId, input.accountId, input.accountId],
				);
				if (still.length === 0) values.card_id = null;
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
		 * Stops the series. What it already wrote stays, except what is still to come:
		 * the days it wrote ahead, and a promise from before 1.1.0 nobody answered.
		 *
		 * This asked for the promises alone, which was the same thing while a series wrote
		 * promises. It writes facts held back by their day now, and asking for the status
		 * would have left every day ahead in place after the series was gone.
		 */
		async remove(id: string, options: { keepPlanned?: boolean } = {}): Promise<number> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "recurrence.write");
			const today = todayIn(await timezoneOf(found.spaceId));

			let removed = 0;
			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };

				if (options.keepPlanned !== true) {
					const planned = await tx.all(
						`SELECT "id" FROM "transactions" WHERE "recurrence_id" = ? AND ${stillToComeOn(null)}
						 AND "deleted_at" IS NULL AND "reconciled_at" IS NULL`,
						[id, today],
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
		 * Writes the records this series owes, up to the horizon. Safe to call on every load and
		 * from two places at once: the record of a day is named by the series and the day, so a
		 * second writer finds it there and writes nothing.
		 */
		async materialize(input: { spaceId: string; until?: CalendarDate }): Promise<number> {
			assertCan(context.actor(), input.spaceId, "recurrence.write");

			const timezone = await timezoneOf(input.spaceId);
			// The moment of the context and not of the machine, so the day is the one every
			// other reading of this request is about.
			const today = todayIn(timezone, new Date(context.now()));
			const until = input.until ?? addDays(today, DEFAULT_HORIZON_DAYS);

			const rows = await context.driver.all(
				`${SELECT} WHERE r."space_id" = ? AND r."deleted_at" IS NULL AND r."paused_at" IS NULL`,
				[input.spaceId],
			);
			const series = rows.map(toRecurrence);
			if (series.length === 0) return 0;

			let written = 0;

			for (const one of series) {
				// An account or the card of the series was deleted or put away. It has stopped,
				// and its screen says so: writing on an account that is gone made records nobody
				// could see or remove.
				if (one.stoppedBy !== null) continue;

				// Never earlier than the month the series was written down in.
				//
				// A household writing down a rent that has been paid since 2019 was handed six
				// years of promises nobody had made. What is behind that is history, and history
				// is written by saying what happened rather than by a rule inventing it.
				//
				// The first day was worked out from the moment the row was created, every time,
				// and a restore writes that moment again: a series restored in December wrote
				// from December. So it is worked out once, the first time the series writes, and
				// written on the series through the change log, where nothing undoes it.
				let from = one.writesFrom;
				if (from === null) {
					from = `${monthOf(todayIn(timezone, new Date(one.createdAt)))}-01` as CalendarDate;
					await updateRow(context.write(), {
						table: recurrenceTable,
						spaceId: one.spaceId,
						id: one.id,
						values: { writes_from: from },
					});
				}
				const start = compareCalendarDates(one.startsOn, from) > 0 ? one.startsOn : from;

				const days = occurrencesBetween(specOf(one), start, until);
				if (days.length === 0) continue;

				// Deleted days count as written, and so do the days somebody said did not happen.
				// A day this series wrote and somebody then deleted is a day they said no to, and
				// reading only the rows still there brought it back every time. A deleted row is
				// not in a backup, so the answer is also kept where a backup carries it.
				const already = await context.driver.all(
					`SELECT "happened_on" FROM "transactions" WHERE "recurrence_id" = ?`,
					[one.id],
				);
				const skipped = await context.driver.all(
					`SELECT "day" FROM "recurrence_skips" WHERE "recurrence_id" = ? AND "deleted_at" IS NULL`,
					[one.id],
				);
				const seen = new Set([
					...already.map((row) => String(row.happened_on)),
					...skipped.map((row) => String(row.day)),
				]);
				const taken = await periodsKeptBefore(one);
				const missing = days.filter(
					(day) => !seen.has(day) && !taken.has(seriesPeriodOf(one.frequency, day)),
				);
				if (missing.length === 0) continue;

				const amount = one.kind === "expense" ? -one.amount : one.amount;

				// A subscription charged to a credit card lands on an invoice, like every other
				// purchase on that card.
				const cycle = await cycleOfAccount(one.accountId);

				await context.driver.transaction(async (tx) => {
					const write = { ...context.write(), driver: tx };
					for (const day of missing) {
						const inserted = await insertRowIfAbsent(write, {
							table: transactions,
							spaceId: one.spaceId,
							id: occurrenceId(one.id, day),
							values: {
								kind: one.kind,
								// A fact, held back by its day until the day arrives, and then
								// counted by itself.
								status: "settled",
								amount,
								currency: one.currency,
								fx_rate: null,
								// The currency of a series is the currency of its space, so the
								// amount is already the one reports add up.
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
								invoice_month: cycle ? invoiceMonthOf(day, cycle) : null,
								category_id: one.categoryId,
								priority: one.priority,
								recurrence_id: one.id,
								// The card a series of purchases is charged to, on every one of
								// them, as on a purchase written by hand. It wrote none.
								card_id: one.cardId,
								created_by: context.actor().userId,
							},
						});
						if (inserted) written += 1;
					}
				});
			}

			return written;
		},
	};
}

export type RecurrencesRepository = ReturnType<typeof createRecurrencesRepository>;
