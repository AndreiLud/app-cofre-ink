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
	isUntouchedOccurrence,
	monthOf,
	occurrenceId,
	occurrencesBetween,
	parseCalendarDate,
	type RecurrenceSpec,
	type SeriesRecord,
	type SpendingPriority,
	seriesPeriodOf,
	todayIn,
	type WrittenRecord,
} from "@cofre/core";
import { recurrences as recurrenceTable, transactions } from "@cofre/db";
import { assertCan, readableSpaceIds } from "../actor.ts";
import { asNumber, type SqlValue } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import {
	type Recurrence,
	type RecurrenceFrequency,
	type TransactionKind,
	toRecurrence,
} from "../models.ts";
import { marks } from "../sql.ts";
import {
	insertRow,
	insertRowIfAbsent,
	softDeleteRow,
	updateRow,
	type WriteContext,
} from "../writer.ts";
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
	/**
	 * Writes nothing before today. A series that starts on a day already gone writes the days
	 * between, and they count in the balance; the person is asked first, and this is the box
	 * that says to leave them out.
	 */
	leavePastOut?: boolean;
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

	/** What a series writes on each of its days, for asking whether a record is still that. */
	function writtenBy(one: Recurrence): SeriesRecord {
		return {
			...specOf(one),
			kind: one.kind,
			amount: one.amount,
			accountId: one.accountId,
			counterAccountId: one.counterAccountId,
			cardId: one.cardId,
			categoryId: one.categoryId,
			description: one.description,
		};
	}

	/** The records of a series dated after a day that nobody touched, oldest first. */
	async function untouchedAfter(
		one: Recurrence,
		day: CalendarDate,
		driver = context.driver,
	): Promise<(WrittenRecord & { id: string })[]> {
		const rows = await driver.all(
			`SELECT "id", "amount", "account_id", "counter_account_id", "card_id", "category_id",
			        "description", "happened_on", "reconciled_at"
			 FROM "transactions"
			 WHERE "recurrence_id" = ? AND "deleted_at" IS NULL AND "happened_on" > ?
			 ORDER BY "happened_on"`,
			[one.id, day],
		);
		const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
		return rows
			.map((row) => ({
				id: String(row.id),
				amount: asNumber(row.amount),
				accountId: String(row.account_id),
				counterAccountId: text(row.counter_account_id),
				cardId: text(row.card_id),
				categoryId: text(row.category_id),
				description: String(row.description),
				happenedOn: String(row.happened_on),
				reconciledAt: row.reconciled_at === null ? null : asNumber(row.reconciled_at),
			}))
			.filter((row) => isUntouchedOccurrence(row, writtenBy(one)));
	}

	/**
	 * Takes back what a series wrote after a day and nobody touched. A record somebody changed is
	 * theirs now and stays: what they said about that day is not the series' to take.
	 */
	async function dropUntouchedAfter(
		write: WriteContext,
		one: Recurrence,
		day: CalendarDate,
	): Promise<number> {
		const rows = await untouchedAfter(one, day, write.driver);
		for (const row of rows) {
			await softDeleteRow(write, { table: transactions, spaceId: one.spaceId, id: row.id });
		}
		return rows.length;
	}

	/** Every series of a chain, the one given and the ones before and after it. */
	async function wholeChain(one: Recurrence): Promise<Recurrence[]> {
		const found = new Map<string, Recurrence>([[one.id, one]]);
		for (const id of await chainBefore(one)) {
			const rows = await context.driver.all(
				`${SELECT} WHERE r."id" = ? AND r."deleted_at" IS NULL`,
				[id],
			);
			if (rows[0]) found.set(id, toRecurrence(rows[0]));
		}
		let edge = [one.id];
		while (edge.length > 0 && found.size < 500) {
			const rows = await context.driver.all(
				`${SELECT} WHERE r."follows_id" IN (${marks(edge.length)}) AND r."deleted_at" IS NULL`,
				edge,
			);
			edge = [];
			for (const row of rows.map(toRecurrence)) {
				if (found.has(row.id)) continue;
				found.set(row.id, row);
				edge.push(row.id);
			}
		}
		return [...found.values()];
	}

	/**
	 * The day a continuation starts on: its first day on or after a day, in a period where the
	 * series it follows wrote nothing that stays. The rent of October was paid on the fifth, so
	 * a rent moved on the twenty eighth to the thirtieth starts in November, not on the thirtieth
	 * of October as well.
	 */
	async function continuationStart(
		before: Recurrence,
		rule: SeriesRecord,
		from: CalendarDate,
	): Promise<CalendarDate | null> {
		const rows = await context.driver.all(
			`SELECT "happened_on" FROM "transactions"
			 WHERE "recurrence_id" = ? AND "deleted_at" IS NULL AND "happened_on" < ?`,
			[before.id, from],
		);
		const taken = new Set(
			rows.map((row) => seriesPeriodOf(rule.frequency, String(row.happened_on))),
		);
		const candidates = occurrencesBetween(rule, from, addDays(from, 366 * 3));
		return candidates.find((day) => !taken.has(seriesPeriodOf(rule.frequency, day))) ?? null;
	}

	/** The columns of a series, the day of the month and the month spelled out. */
	function columnsOf(one: Recurrence): Record<string, SqlValue> {
		const start = parseCalendarDate(one.startsOn);
		return {
			description: one.description,
			kind: one.kind,
			amount: one.amount,
			currency: one.currency,
			account_id: one.accountId,
			counter_account_id: one.counterAccountId,
			card_id: one.cardId,
			category_id: one.categoryId,
			priority: one.priority,
			frequency: one.frequency,
			interval_count: one.intervalCount,
			// Written out, because the continuation starts on another day and a day of the
			// month read from its start would be that day.
			day_of_month: one.frequency === "weekly" ? null : (one.dayOfMonth ?? start.day),
			weekday: null,
			month_of_year: one.frequency === "yearly" ? (one.monthOfYear ?? start.month) : null,
			starts_on: one.startsOn,
			ends_on: one.endsOn,
			notes: one.notes,
		};
	}

	/** A series as it would be with these columns, for working out its days. */
	function asSeries(one: Recurrence, columns: Record<string, SqlValue>): Recurrence {
		const text = (name: string, fallback: string | null) =>
			name in columns ? (columns[name] === null ? null : String(columns[name])) : fallback;
		const count = (name: string, fallback: number | null) =>
			name in columns ? (columns[name] === null ? null : Number(columns[name])) : fallback;
		return {
			...one,
			description: text("description", one.description) ?? one.description,
			amount: count("amount", one.amount) ?? one.amount,
			accountId: text("account_id", one.accountId) ?? one.accountId,
			counterAccountId: text("counter_account_id", one.counterAccountId),
			cardId: text("card_id", one.cardId),
			categoryId: text("category_id", one.categoryId),
			frequency: (text("frequency", one.frequency) ?? one.frequency) as Recurrence["frequency"],
			intervalCount: count("interval_count", one.intervalCount) ?? one.intervalCount,
			dayOfMonth: count("day_of_month", one.dayOfMonth),
			monthOfYear: count("month_of_year", one.monthOfYear),
			startsOn: text("starts_on", one.startsOn) ?? one.startsOn,
			endsOn: text("ends_on", one.endsOn),
		};
	}

	/**
	 * Ends a series the day before a day and starts the one that continues it, with these
	 * changes, on its first day from then on in a period the old one left empty. What the old
	 * one wrote after its end and nobody touched goes; what somebody touched stays.
	 */
	async function continueFrom(
		found: Recurrence,
		values: Record<string, SqlValue>,
		from: CalendarDate,
		resuming: boolean,
	): Promise<Recurrence> {
		const columns = { ...columnsOf(found), ...values };
		const startsOn = await continuationStart(found, writtenBy(asSeries(found, columns)), from);
		const lastDay = addDays(from, -1);

		const id = await context.driver.transaction(async (tx) => {
			const write = { ...context.write(), driver: tx };
			if (found.endsOn === null || compareCalendarDates(found.endsOn, lastDay) > 0) {
				await updateRow(write, {
					table: recurrenceTable,
					spaceId: found.spaceId,
					id: found.id,
					values: { ends_on: lastDay },
				});
			}
			await dropUntouchedAfter(write, found, lastDay);
			if (startsOn === null) {
				// Nothing left to write: an ended series somebody brings back simply stops being
				// on hold.
				if (resuming) {
					await updateRow(write, {
						table: recurrenceTable,
						spaceId: found.spaceId,
						id: found.id,
						values: { paused_at: null },
					});
				}
				return found.id;
			}
			return insertRow(write, {
				table: recurrenceTable,
				spaceId: found.spaceId,
				values: {
					...columns,
					starts_on: startsOn,
					writes_from: startsOn,
					follows_id: found.id,
					paused_at: null,
					created_by: context.actor().userId,
				},
			});
		});
		return reachable(id);
	}

	return {
		async list(spaceId: string): Promise<Recurrence[]> {
			assertCan(context.actor(), spaceId, "recurrence.read");
			const rows = await context.driver.all(
				// One line per chain: a series continued by another is the past of that one.
				`${SELECT} WHERE r."space_id" = ? AND r."deleted_at" IS NULL
				   AND NOT EXISTS (
				     SELECT 1 FROM "recurrences" n WHERE n."follows_id" = r."id" AND n."deleted_at" IS NULL
				   )
				 ORDER BY r."description"`,
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
			const writesFrom = input.leavePastOut
				? todayIn(await timezoneOf(input.spaceId), new Date(context.now()))
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
					writes_from: writesFrom,
					created_by: context.actor().userId,
				},
			});
			return reachable(id);
		},

		/**
		 * A change to a series, from its next occurrence on.
		 *
		 * The series ends today and a new one follows it, so what already happened keeps saying
		 * what it said, and the records ahead that nobody touched are written again by the new
		 * one. A record somebody changed by hand stays, and the new series writes nothing in its
		 * period. Deleting the records ahead and writing them again was not an answer: a day
		 * deleted counts as written, so the series never wrote them back.
		 *
		 * A series that has not started yet changes where it is. Pausing takes back what it wrote
		 * ahead, and coming back ends the paused one the day before and starts its continuation
		 * on the day of the return, so the months of the pause are not written.
		 */
		async update(id: string, input: UpdateRecurrenceInput): Promise<Recurrence> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "recurrence.write");
			const today = todayIn(await timezoneOf(found.spaceId), new Date(context.now()));

			if (input.paused === true && found.pausedAt === null) {
				await context.driver.transaction(async (tx) => {
					const write = { ...context.write(), driver: tx };
					await updateRow(write, {
						table: recurrenceTable,
						spaceId: found.spaceId,
						id,
						values: { paused_at: context.now() },
					});
					await dropUntouchedAfter(write, found, today);
				});
				return reachable(id);
			}
			if (input.paused === false && found.pausedAt !== null) {
				return continueFrom(found, {}, today, true);
			}

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
			if (input.startsOn !== undefined) {
				parseCalendarDate(input.startsOn);
				values.starts_on = input.startsOn;
				// A start moved is a day of the month moved, when nothing else says which.
				const start = parseCalendarDate(input.startsOn);
				if (input.dayOfMonth === undefined) values.day_of_month = start.day;
				if (input.monthOfYear === undefined) values.month_of_year = start.month;
			}
			if (input.dayOfMonth !== undefined) values.day_of_month = input.dayOfMonth;
			if (input.monthOfYear !== undefined) values.month_of_year = input.monthOfYear;
			if (input.endsOn !== undefined) {
				if (input.endsOn) parseCalendarDate(input.endsOn);
				values.ends_on = input.endsOn;
			}
			if (input.notes !== undefined) values.notes = input.notes;
			if (Object.keys(values).length === 0) return found;

			// A series that has not started is continued too, from its own first day: changing it
			// where it is would leave the days it wrote ahead deleted under its name, and a day
			// deleted is a day written, so it would never write them again.
			return continueFrom(found, values, addDays(today, 1), false);
		},

		/**
		 * The records a series and the ones it continues would take back if it were deleted: the
		 * ones after today that nobody touched. What the question before deleting lists.
		 */
		async removalPreview(id: string): Promise<{ day: CalendarDate; amount: number }[]> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "recurrence.write");
			const today = todayIn(await timezoneOf(found.spaceId), new Date(context.now()));
			const going: { day: CalendarDate; amount: number }[] = [];
			for (const one of await wholeChain(found)) {
				for (const row of await untouchedAfter(one, today)) {
					going.push({ day: row.happenedOn, amount: row.amount });
				}
			}
			return going.sort((left, right) => compareCalendarDates(left.day, right.day));
		},

		/**
		 * Deletes a series and the ones it continues. What happened stays, and so does every
		 * record somebody touched; only the records after today that nobody touched go.
		 *
		 * This took every record still to come, touched or not, and it found none at all once a
		 * series wrote facts held back by their day instead of promises.
		 */
		async remove(id: string, options: { keepPlanned?: boolean } = {}): Promise<number> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "recurrence.write");
			const today = todayIn(await timezoneOf(found.spaceId), new Date(context.now()));
			const chain = await wholeChain(found);

			let removed = 0;
			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				for (const one of chain) {
					if (options.keepPlanned !== true) removed += await dropUntouchedAfter(write, one, today);
					await softDeleteRow(write, { table: recurrenceTable, spaceId: one.spaceId, id: one.id });
				}
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
