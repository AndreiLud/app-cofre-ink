// Transactions: money coming in, money going out, and money moving between accounts.
//
// Three rules live here and nowhere else. The sign of the amount has to match what the
// person said they did. A transfer is one row, so it is never counted twice. And a
// credit card purchase is stamped with the invoice it will be charged on, at the time
// it is written, so changing the closing day later does not move what already closed.

import {
	addMonthsToMonth,
	type CalendarDate,
	type CalendarMonth,
	type CardCycle,
	compareCalendarDates,
	invoiceMonthOf,
	money,
	parseCalendarDate,
	pickRule,
	planInstallments,
	uuidV7,
} from "@cofre/core";
import { transactions } from "@cofre/db";
import { assertCan, readableSpaceIds, seesOwnRowsOnly } from "../actor.ts";
import { asNumber, type Row, type SqlValue } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { happenedBy, stillToComeOn } from "../happened.ts";
import {
	type Account,
	type AccountBalance,
	type SpendingPriority,
	type Transaction,
	type TransactionKind,
	type TransactionStatus,
	toAccount,
	toCategorizationRule,
	toTransaction,
} from "../models.ts";
import { marks } from "../sql.ts";
import { insertRow, softDeleteRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

const SELECT = `SELECT "id", "space_id", "kind", "status", "amount", "currency", "fx_rate",
	"amount_in_base", "happened_on", "description", "account_id", "counter_account_id", "notes",
	"reconciled_at", "installment_group", "installment_number", "installment_count",
	"invoice_month", "invoice_month_by_hand", "category_id", "priority", "recurrence_id",
	"paid_by", "external_id", "card_id", "created_by", "created_at", "updated_at"
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
	categoryId?: string | null;
	/** Only when this one record disagrees with the priority of its category. */
	priority?: SpendingPriority | null;
	/**
	 * What the bank called this entry, set by an import, and the mark the month screen
	 * puts on the three records it writes so that typing the same month again corrects
	 * them. Nothing else writes here, and a record written by hand carries nothing.
	 */
	externalId?: string | null;
	/**
	 * Which piece of plastic was used. It never chooses the account by itself: the
	 * account is what the money is charged to, and a card that does not reach that
	 * account is refused rather than quietly moving the record somewhere else.
	 */
	cardId?: string | null;
	/**
	 * The invoice this record belongs to, chosen rather than worked out.
	 *
	 * Only the payment of an invoice uses it: a payment leaves an account with no cycle,
	 * so nothing could work out which invoice it pays. Set here, it is also marked as
	 * chosen, and nothing recalculates it afterwards.
	 */
	invoiceMonth?: CalendarMonth | null;
};

export type UpdateTransactionInput = {
	amount?: number;
	happenedOn?: CalendarDate;
	description?: string;
	accountId?: string;
	counterAccountId?: string | null;
	status?: TransactionStatus;
	notes?: string | null;
	categoryId?: string | null;
	priority?: SpendingPriority | null;
	cardId?: string | null;
};

export type TransactionFilter = {
	spaceId?: string;
	accountId?: string;
	cardId?: string;
	kind?: TransactionKind;
	status?: TransactionStatus;
	/**
	 * Only what has happened by this day: a fact whose day has come.
	 *
	 * Not the same as asking for facts. A record dated ahead is written as a fact and its
	 * day holds it back, so asking for the status alone counts the rent of the twenty fifth
	 * on the second.
	 */
	happenedBy?: CalendarDate;
	/** Only what is still to come on this day: a promise from before 1.1.0, or a day ahead. */
	stillToComeOn?: CalendarDate;
	from?: CalendarDate;
	to?: CalendarDate;
	invoiceMonth?: string;
	/** Matches the description, case insensitive. */
	search?: string;
	/** Any of these categories. The screen expands a parent into its children. */
	categoryIds?: string[];
	/** Records with no category at all, which is what "not sorted yet" means. */
	withoutCategory?: boolean;
	/**
	 * Exactly these marks, for a caller that wrote a record and wants that record back.
	 *
	 * Asking by a range of days and reading the page that comes back is not the same
	 * question: a busy month fills the page, the record falls off the end, and the caller
	 * is told it does not exist and writes it again.
	 */
	externalIds?: string[];
	installmentGroup?: string;
	/**
	 * Which end of the range the page is taken from.
	 *
	 * Newest first is what a list of records wants, and it is the default. Oldest first is
	 * what anything asking "what falls due next" wants, and asking for it matters rather
	 * than sorting afterwards: the limit is applied by the database, so a caller that
	 * fetched the newest twenty and then sorted them the other way round was showing the
	 * twenty furthest away and dropping the bills due tomorrow.
	 */
	order?: "newestFirst" | "oldestFirst";
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
	/**
	 * A category has to live in the same space as the record that points at it. Without
	 * this check a mistake, or somebody calling the API by hand, would tie a record in
	 * one space to a category in another and quietly carry a name across spaces.
	 */
	async function categoryIn(spaceId: string, categoryId: string): Promise<string> {
		const rows = await context.driver.all(
			`SELECT "id" FROM "categories" WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL`,
			[categoryId, spaceId],
		);
		if (rows.length === 0) throw new NotFoundError("category", categoryId);
		return categoryId;
	}

	/**
	 * What the rules of the space would do with a record that arrives with no category.
	 * A transfer is never sorted, because moving your own money between your own
	 * accounts is not spending.
	 */
	async function suggestFor(
		spaceId: string,
		record: { description: string; accountId: string; kind: TransactionKind },
	): Promise<{ categoryId: string | null; priority: SpendingPriority | null }> {
		if (record.kind === "transfer") return { categoryId: null, priority: null };

		const rows = await context.driver.all(
			`SELECT "id", "space_id", "match_text", "account_id", "kind", "category_id", "priority",
			 "position", "disabled_at", "created_by", "created_at", "updated_at"
			 FROM "categorization_rules"
			 WHERE "space_id" = ? AND "deleted_at" IS NULL AND "disabled_at" IS NULL
			 ORDER BY "position", "created_at"`,
			[spaceId],
		);
		if (rows.length === 0) return { categoryId: null, priority: null };

		const found = pickRule(rows.map(toCategorizationRule), record);
		return { categoryId: found?.categoryId ?? null, priority: found?.priority ?? null };
	}

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

	/**
	 * A card may only be named on a record that is charged to an account it reaches.
	 *
	 * Without this, a purchase could say it was made with the meal voucher while landing
	 * on the credit card invoice, and every screen that adds up a card would be adding up
	 * a story. It is also the check that stops a card of another space being named here.
	 */
	async function cardRow(spaceId: string, cardId: string): Promise<Row | null> {
		const rows = await context.driver.all(
			`SELECT "id", "credit_account_id", "debit_account_id", "archived_at"
			 FROM "cards" WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL`,
			[cardId, spaceId],
		);
		return rows[0] ?? null;
	}

	function reaches(card: Row, accountId: string): boolean {
		return card.credit_account_id === accountId || card.debit_account_id === accountId;
	}

	async function cardIn(spaceId: string, cardId: string, accountId: string): Promise<string> {
		const card = await cardRow(spaceId, cardId);
		if (!card) throw new NotFoundError("card", cardId);
		if (card.archived_at !== null) {
			throw new RuleError("cardIsArchived", "this card is archived, bring it back before using it");
		}
		if (!reaches(card, accountId)) {
			throw new RuleError(
				"cardDoesNotReachAccount",
				"this card does not spend from the account the record is charged to",
			);
		}
		return cardId;
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

	/**
	 * Every part of one purchase, whatever the filters in play, in one space.
	 *
	 * The space is named rather than left to the list of spaces this person can read. The
	 * mark of a group is not renamed when a backup is restored into a second space, because
	 * it is not an identifier of a row and it points at no table, so two spaces can hold two
	 * plans under one mark. A caller that then asks the permission once, on the first part
	 * it found, was asking it about one space and writing both: an editor in one space and a
	 * viewer in the other could correct the plan in the space where they may only read.
	 */
	async function listGroup(groupId: string, spaceId?: string): Promise<Transaction[]> {
		const spaceIds = spaceId === undefined ? readableSpaceIds(context.actor()) : [spaceId];
		if (spaceIds.length === 0) return [];
		const rows = await context.driver.all(
			`${SELECT} WHERE "installment_group" = ? AND "space_id" IN (${marks(spaceIds.length)})
			 AND "deleted_at" IS NULL ORDER BY "installment_number"`,
			[groupId, ...spaceIds],
		);
		return rows.map(toTransaction);
	}

	/**
	 * A record that was ticked off against the bank does not change under anyone, and a
	 * logger never reaches a row somebody else wrote.
	 */
	function assertChangeable(found: Transaction, verb: "changing" | "removing"): void {
		if (found.reconciledAt !== null) {
			throw new RuleError(
				"reconciledIsFrozen",
				verb === "changing"
					? "this record was reconciled against the bank, undo that before changing it"
					: "this record was reconciled against the bank, undo that before removing it",
			);
		}
		if (
			seesOwnRowsOnly(context.actor(), found.spaceId) &&
			found.createdBy !== context.actor().userId
		) {
			throw new NotFoundError("transaction", found.id);
		}
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
	 * The invoice a record lands on, worked out again after its day or its account moved.
	 *
	 * A part of a purchase in instalments lands on the invoice of the first part plus its own
	 * number, which is how the plan was written. Worked out from its own day instead, the
	 * twenty eighth of February that the thirty first of January becomes a month later fell
	 * before a closing day of the twenty eighth, and two parts landed on one invoice. An
	 * invoice somebody chose stays chosen, which the callers ask before they get here.
	 */
	async function invoiceFor(
		found: Transaction,
		day: CalendarDate,
		accountId: string,
	): Promise<CalendarMonth | null> {
		const cycle = cycleOf(await accountIn(found.spaceId, accountId));
		if (!cycle) return null;
		if (found.installmentGroup === null || found.installmentNumber === null) {
			return invoiceMonthOf(day, cycle);
		}

		// The earliest part still there, which is the first one unless it was removed. The one
		// being changed reads with its new day.
		const parts = await listGroup(found.installmentGroup, found.spaceId);
		const earliest = parts
			.map((part) => (part.id === found.id ? { ...part, happenedOn: day } : part))
			.filter((part) => part.installmentNumber !== null)
			.sort((one, other) => (one.installmentNumber ?? 0) - (other.installmentNumber ?? 0))[0];
		if (!earliest || earliest.installmentNumber === null) return invoiceMonthOf(day, cycle);
		return addMonthsToMonth(
			invoiceMonthOf(earliest.happenedOn, cycle),
			found.installmentNumber - earliest.installmentNumber,
		);
	}

	/**
	 * What saying a record happened writes: a fact, on today when its day was still ahead.
	 * A purchase whose day moves lands on the invoice of its new day, unless somebody chose
	 * the invoice, and it stayed on the invoice of the old day before.
	 */
	async function settledValues(
		found: Transaction,
		today: CalendarDate,
	): Promise<Record<string, SqlValue>> {
		if (compareCalendarDates(found.happenedOn, today) <= 0) return { status: "settled" };
		const values: Record<string, SqlValue> = { status: "settled", happened_on: today };
		if (!found.invoiceMonthByHand) {
			values.invoice_month = await invoiceFor(found, today, found.accountId);
		}
		return values;
	}

	/** What a change turns into, once the rules have had their say. */
	async function valuesFor(
		found: Transaction,
		input: UpdateTransactionInput,
	): Promise<Record<string, SqlValue>> {
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
		// An invoice somebody chose stays chosen. A purchase the bank closed a day either
		// side of the day this app expected was moved by hand, and working it out again
		// from the closing day would put it straight back where it was wrong.
		const chosen = found.invoiceMonthByHand;

		if (input.happenedOn !== undefined) {
			parseCalendarDate(input.happenedOn);
			values.happened_on = input.happenedOn;
		}
		if (input.description !== undefined) values.description = input.description.trim();
		if (input.accountId !== undefined) {
			await accountIn(found.spaceId, input.accountId);
			values.account_id = input.accountId;
		}

		// The invoice follows the day and the card, and only when one of them really moved.
		// The form sends both on every save, so this used to work the invoice out again on
		// any change at all: after the closing day was corrected under Accounts, giving an old
		// purchase another category moved it to another invoice, one already paid included.
		const day = input.happenedOn ?? found.happenedOn;
		const accountId = input.accountId ?? found.accountId;
		if (!chosen && (day !== found.happenedOn || accountId !== found.accountId)) {
			values.invoice_month = await invoiceFor(found, day, accountId);
		}
		if (input.counterAccountId !== undefined) {
			if (input.counterAccountId) await accountIn(found.spaceId, input.counterAccountId);
			values.counter_account_id = input.counterAccountId;
		}
		if (input.status !== undefined) values.status = input.status;
		if (input.notes !== undefined) values.notes = input.notes;
		if (input.categoryId !== undefined) {
			values.category_id = input.categoryId
				? await categoryIn(found.spaceId, input.categoryId)
				: null;
		}
		if (input.priority !== undefined) values.priority = input.priority;
		// The account and the card have to keep agreeing, so a record moved to another
		// account loses a card that does not reach it rather than lying about it.
		if (input.cardId !== undefined) {
			values.card_id = input.cardId
				? await cardIn(found.spaceId, input.cardId, input.accountId ?? found.accountId)
				: null;
		} else if (input.accountId !== undefined && found.cardId !== null) {
			// A cartao multiplo reaches both of its accounts, so moving a purchase from
			// the balance to the invoice keeps the card. Anything else loses it.
			const card = await cardRow(found.spaceId, found.cardId);
			if (!card || !reaches(card, input.accountId)) values.card_id = null;
		}

		return values;
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

			// A benefit card is an allowance, not an account. The money on it was put there
			// by an employer and it does not come back out: it buys lunch or a fare and
			// that is the whole of what it does. Putting money in is real, because cards
			// like Caju and Flash take a top up, so only the other direction is refused.
			if (input.kind === "income" && account.kind === "voucher") {
				throw new RuleError(
					"benefitIsNotIncome",
					"a benefit card is credited by whoever gives it, and that credit is not a record",
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
				if (account.kind === "voucher") {
					throw new RuleError(
						"benefitDoesNotLeave",
						"money on a benefit card is spent on the card and does not move out of it",
					);
				}
				await accountIn(input.spaceId, input.counterAccountId);
			} else if (input.counterAccountId) {
				throw new RuleError(
					"onlyTransfersHaveDestination",
					"only a transfer moves money into another account",
				);
			}

			const cardId = input.cardId
				? await cardIn(input.spaceId, input.cardId, input.accountId)
				: null;

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
			// A category chosen by hand wins. When there is none, the rules of the space
			// get their say, which is the whole point of writing a rule.
			const sorted = input.categoryId
				? { categoryId: await categoryIn(input.spaceId, input.categoryId), priority: null }
				: await suggestFor(input.spaceId, {
						description: input.description,
						accountId: input.accountId,
						kind: input.kind,
					});
			const categoryId = sorted.categoryId;

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
							// Chosen by the caller only where nothing could work it out, which is
							// the payment of an invoice, and then marked as chosen so that
							// editing the record later does not move it.
							invoice_month: input.invoiceMonth ?? part.invoiceMonth ?? null,
							invoice_month_by_hand: input.invoiceMonth ? 1 : null,
							category_id: categoryId,
							priority: input.priority ?? sorted.priority,
							// One entry from the bank becomes one record, so only a purchase
							// that was not split carries the identifier it came with.
							external_id: count > 1 ? null : (input.externalId ?? null),
							card_id: cardId,
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
			if (filter.cardId) {
				where.push(`"card_id" = ?`);
				params.push(filter.cardId);
			}
			if (filter.kind) {
				where.push(`"kind" = ?`);
				params.push(filter.kind);
			}
			if (filter.status) {
				where.push(`"status" = ?`);
				params.push(filter.status);
			}
			if (filter.happenedBy) {
				where.push(happenedBy(null));
				params.push(filter.happenedBy);
			}
			if (filter.stillToComeOn) {
				where.push(stillToComeOn(null));
				params.push(filter.stillToComeOn);
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
			if (filter.categoryIds && filter.categoryIds.length > 0) {
				where.push(`"category_id" IN (${marks(filter.categoryIds.length)})`);
				params.push(...filter.categoryIds);
			}
			if (filter.withoutCategory) {
				where.push(`"category_id" IS NULL`);
			}
			if (filter.externalIds && filter.externalIds.length > 0) {
				where.push(`"external_id" IN (${marks(filter.externalIds.length)})`);
				params.push(...filter.externalIds);
			}

			const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
			const offset = Math.max(filter.offset ?? 0, 0);
			// The order belongs in the query and not after it, because the limit is applied
			// here: a caller that took the newest twenty and sorted them the other way round
			// was showing the twenty furthest away and dropping what falls due tomorrow.
			const direction = filter.order === "oldestFirst" ? "ASC" : "DESC";

			const rows = await context.driver.all(
				`${SELECT} WHERE ${where.join(" AND ")}
				 ORDER BY "happened_on" ${direction}, "created_at" ${direction}
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
			assertChangeable(found, "changing");

			await updateRow(context.write(), {
				table: transactions,
				spaceId: found.spaceId,
				id,
				values: await valuesFor(found, input),
			});
			return reachable(id);
		},

		/**
		 * The same change over a handful of records, written in one database transaction.
		 * Every row is checked before any row is written, so a selection that includes
		 * something frozen changes nothing at all rather than half of what was asked.
		 */
		async updateMany(ids: string[], input: UpdateTransactionInput): Promise<number> {
			if (ids.length === 0) return 0;

			const planned: { found: Transaction; values: Record<string, SqlValue> }[] = [];
			for (const id of ids) {
				const found = await reachable(id);
				assertCan(context.actor(), found.spaceId, "transaction.update");
				assertChangeable(found, "changing");
				planned.push({ found, values: await valuesFor(found, input) });
			}

			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				for (const { found, values } of planned) {
					await updateRow(write, {
						table: transactions,
						spaceId: found.spaceId,
						id: found.id,
						values,
					});
				}
			});
			return planned.length;
		},

		/**
		 * The same change on this part of a purchase and on every part after it.
		 *
		 * A purchase in twelve parts is twelve rows, and until now a correction to one of
		 * them was a correction to one of them. So a subscription that was filed under the
		 * wrong category, or whose price went up in March, had to be opened eleven times, and
		 * somebody who opened it once left ten rows disagreeing with the first.
		 *
		 * Forward only, never backwards. What already happened happened at the price and
		 * under the name it happened under, and rewriting a part that is behind would change
		 * a month that has already been read, a limit already measured and an invoice already
		 * paid. The interface offers this part or this part and the ones after it, and those
		 * are the only two answers the model has.
		 *
		 * The day is not one of the things this changes. Each part falls on its own day, a
		 * month apart, so one day written over all of them would pile the whole purchase onto
		 * one afternoon.
		 */
		async updateFrom(id: string, input: UpdateTransactionInput): Promise<number> {
			if (input.happenedOn !== undefined) {
				throw new RuleError(
					"installmentDaysAreTheirOwn",
					"each part of a purchase falls on its own day, so the day is changed one part at a time",
				);
			}

			const first = await reachable(id);
			assertCan(context.actor(), first.spaceId, "transaction.update");

			// The parts of this plan in this space, and not every plan anywhere that happens
			// to carry the same mark, because the permission above was asked about this space.
			const group = first.installmentGroup;
			const rows =
				group === null
					? [first]
					: (await listGroup(group, first.spaceId)).filter(
							(row) => (row.installmentNumber ?? 0) >= (first.installmentNumber ?? 0),
						);

			// A name written over a whole plan keeps each part's number.
			//
			// Every row of a purchase in parts is named "the thing" followed by its own three
			// of twelve, and the form hands back whatever is in the field, number and all. So
			// the number is taken off what was given once and put back on per row: without
			// that, renaming a plan left twelve rows with the same name and nothing saying
			// which part each was, or eleven of them carrying the third part's number.
			const renamed = input.description?.trim().replace(/\s+\d+\/\d+$/, "");

			// Every row checked before any row is written, the way a selection is, so a plan
			// with one reconciled part in it changes nothing rather than most of itself.
			const planned: { found: Transaction; values: Record<string, SqlValue> }[] = [];
			for (const row of rows) {
				assertChangeable(row, "changing");
				const forThisRow =
					renamed !== undefined && row.installmentNumber !== null && row.installmentCount !== null
						? {
								...input,
								description: `${renamed} ${row.installmentNumber}/${row.installmentCount}`,
							}
						: input;
				planned.push({ found: row, values: await valuesFor(row, forThisRow) });
			}

			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				for (const { found, values } of planned) {
					await updateRow(write, {
						table: transactions,
						spaceId: found.spaceId,
						id: found.id,
						values,
					});
				}
			});
			return planned.length;
		},

		/** Removes a selection, all of it or none of it, for the same reason. */
		async removeMany(ids: string[]): Promise<number> {
			if (ids.length === 0) return 0;

			const found: Transaction[] = [];
			for (const id of ids) {
				const row = await reachable(id);
				assertCan(context.actor(), row.spaceId, "transaction.delete");
				assertChangeable(row, "removing");
				found.push(row);
			}

			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				for (const row of found) {
					await softDeleteRow(write, {
						table: transactions,
						spaceId: row.spaceId,
						id: row.id,
					});
				}
			});
			return found.length;
		},

		/**
		 * Marks a planned record as having actually happened, on the day it happened.
		 *
		 * A record dated ahead and called a fact is a contradiction: the balance counts by
		 * the day now, so saying it happened while its day is still to come would change
		 * nothing anybody could see. So the day comes back to today, which is when the
		 * person saying it is saying it.
		 *
		 * A day already past is left alone. A bill that fell due on the twenty fifth and is
		 * confirmed on the twenty ninth happened on the twenty fifth as far as anybody
		 * knows, and moving it forward would take it out of the month it belongs to and out
		 * of the limit it was spent against.
		 */
		async settle(id: string, today: CalendarDate): Promise<Transaction> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "transaction.update");
			await updateRow(context.write(), {
				table: transactions,
				spaceId: found.spaceId,
				id,
				values: await settledValues(found, today),
			});
			return reachable(id);
		},

		/**
		 * The same, over several records, all of them or none of them.
		 *
		 * A household coming back from a week away has a week of promises nobody has answered,
		 * and answering them one at a time is seven presses, seven stamps and, on a server,
		 * seven requests. Every row is read and checked before any row is written, so a refusal
		 * on the fifth leaves neither rows nor log entries from the first four.
		 *
		 * The day rule is applied per record, exactly as the one above applies it, and never as
		 * one date over the selection: a bill promised for the fifth stays on the fifth. And
		 * like the one above, and unlike updateMany and removeMany beside it, this does not
		 * refuse a record already ticked off against the bank. The batch is the same button
		 * pressed several times and nothing stricter.
		 */
		async settleMany(ids: string[], today: CalendarDate): Promise<number> {
			if (ids.length === 0) return 0;

			const planned: { found: Transaction; values: Record<string, SqlValue> }[] = [];
			for (const id of ids) {
				const found = await reachable(id);
				assertCan(context.actor(), found.spaceId, "transaction.update");
				planned.push({ found, values: await settledValues(found, today) });
			}

			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				for (const { found, values } of planned) {
					await updateRow(write, {
						table: transactions,
						spaceId: found.spaceId,
						id: found.id,
						values,
					});
				}
			});
			return planned.length;
		},

		/**
		 * Putting a record on an invoice by hand, and leaving it there.
		 *
		 * The bank closes a day either side of the day this application expected, so a
		 * purchase lands on the wrong invoice and somebody has to say so. Once said, it is
		 * marked as chosen, and correcting the closing day of the account afterwards does
		 * not drag the purchase back.
		 *
		 * A record already ticked off against the bank is frozen, like every other change
		 * to one: the line on the statement said which day it was, not which invoice, and
		 * unfreezing it is the person's decision to make on the record itself.
		 */
		async setInvoiceMonth(id: string, month: CalendarMonth): Promise<Transaction> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "transaction.update");
			assertChangeable(found, "changing");
			await updateRow(context.write(), {
				table: transactions,
				spaceId: found.spaceId,
				id,
				values: { invoice_month: month, invoice_month_by_hand: 1 },
			});
			return reachable(id);
		},

		/**
		 * The same, over several records, all of them or none of them.
		 *
		 * Moving a purchase between invoices is rarely one purchase: an instalment plan is
		 * every part of it, and saying which day a card really closed is every purchase in
		 * the days between. Both of those used to call the one above in a loop, so a plan
		 * with one reconciled part in it, or a card with one in the window, moved the rows
		 * before it and then refused, leaving a card split across two invoices with nothing
		 * saying how far it got.
		 */
		async setInvoiceMonths(changes: { id: string; month: CalendarMonth }[]): Promise<number> {
			if (changes.length === 0) return 0;

			const planned: { found: Transaction; month: CalendarMonth }[] = [];
			for (const change of changes) {
				const found = await reachable(change.id);
				assertCan(context.actor(), found.spaceId, "transaction.update");
				assertChangeable(found, "changing");
				planned.push({ found, month: change.month });
			}

			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				for (const { found, month } of planned) {
					await updateRow(write, {
						table: transactions,
						spaceId: found.spaceId,
						id: found.id,
						values: { invoice_month: month, invoice_month_by_hand: 1 },
					});
				}
			});
			return planned.length;
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
			assertChangeable(found, "removing");
			await softDeleteRow(context.write(), {
				table: transactions,
				spaceId: found.spaceId,
				id,
			});
		},

		/** Removes every installment of one purchase at once. */
		async removeGroup(groupId: string): Promise<number> {
			// The space of the first part it finds, and then only that space. The mark of a
			// group survives a backup being restored into a second space, so two spaces can
			// hold two plans under one mark, and asking the permission once on the first part
			// was asking it about one space and deleting both.
			const anywhere = await listGroup(groupId);
			const first = anywhere[0];
			if (!first) throw new NotFoundError("installments", groupId);
			assertCan(context.actor(), first.spaceId, "transaction.delete");
			const rows = anywhere.filter((row) => row.spaceId === first.spaceId);

			// The one delete path that asked the permission and then skipped both of the
			// other two questions. So a logger, who holds transaction.delete, could take
			// away somebody else's whole instalment plan, and anybody could take away one
			// that had been ticked off against the bank, which the other delete paths
			// refuse.
			//
			// Whose it is first, and only then whether it is frozen. The other way round
			// tells somebody a plan they may not see exists and was ticked off against a
			// bank, which is two facts about another person's money.
			const mineOnly = seesOwnRowsOnly(context.actor(), rows[0]?.spaceId ?? "");
			for (const row of rows) {
				if (mineOnly && row.createdBy !== context.actor().userId) {
					throw new NotFoundError("installments", groupId);
				}
			}
			for (const row of rows) assertChangeable(row, "removing");

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
		 *
		 * Happened means two things and it used to mean one. A record counts in the settled
		 * balance when somebody has said it is a fact and its day has arrived, and before
		 * this both halves of that sentence were the first half. A purchase in six parts is
		 * six rows written as facts, five of them dated in months to come, and all six were
		 * leaving the balance on the afternoon of the purchase, while the same five were
		 * also counted as still to come by the instalments reading next door. The day is the
		 * other half and it always was: the comment on that reading says so in as many
		 * words, that a part dated in February is money that will leave in February however
		 * it is marked today.
		 *
		 * The day is passed in rather than read from a clock here, the way the budget, the
		 * goals and the check up already take it, because a repository that reads the wall
		 * clock is a repository whose tests pass until midnight in some timezone.
		 */
		async balances(spaceId: string, today: CalendarDate): Promise<AccountBalance[]> {
			assertCan(context.actor(), spaceId, "account.read");

			/**
			 * A balance is made of records, so it follows the rule records follow.
			 *
			 * This asked for the permission to read accounts, which every role has, and
			 * then summed every row in the space, which is how a logger came to read the
			 * household's real balances on the overview while the limits on the same screen
			 * counted only their own. For them the opening balance starts at nothing too:
			 * it belongs to the space and not to a person, and counting it and then only
			 * their rows would be the worst of both. What they read is what they themselves
			 * have put through each account.
			 */
			const onlyMine = seesOwnRowsOnly(context.actor(), spaceId);
			const only = onlyMine ? `AND t."created_by" = ?` : "";
			const who = onlyMine ? [context.actor().userId] : [];

			const rows = await context.driver.all(
				`SELECT a."id" AS account_id, a."currency" AS currency,
				  ${onlyMine ? "0" : `a."initial_balance"`} AS initial,
				  COALESCE((SELECT SUM(CASE WHEN t."kind" = 'transfer' THEN -t."amount" ELSE t."amount" END)
				            FROM "transactions" t
				            WHERE t."account_id" = a."id" AND t."deleted_at" IS NULL
				              ${only} AND ${happenedBy("t")}), 0) AS out_settled,
				  COALESCE((SELECT SUM(t."amount") FROM "transactions" t
				            WHERE t."counter_account_id" = a."id" AND t."deleted_at" IS NULL
				              ${only} AND ${happenedBy("t")}), 0) AS in_settled,
				  COALESCE((SELECT SUM(CASE WHEN t."kind" = 'transfer' THEN -t."amount" ELSE t."amount" END)
				            FROM "transactions" t
				            WHERE t."account_id" = a."id" AND t."deleted_at" IS NULL ${only}), 0) AS out_all,
				  COALESCE((SELECT SUM(t."amount") FROM "transactions" t
				            WHERE t."counter_account_id" = a."id" AND t."deleted_at" IS NULL ${only}), 0) AS in_all
				 FROM "accounts" a
				 WHERE a."space_id" = ? AND a."deleted_at" IS NULL
				 ORDER BY a."name"`,
				[...who, today, ...who, today, ...who, ...who, spaceId],
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
