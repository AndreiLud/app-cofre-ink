import { type BenefitState, benefitState, type CalendarDate, periodOf, todayIn } from "@cofre/core";
import { accounts, cards } from "@cofre/db";
import { assertCan, readableSpaceIds, seesOwnRowsOnly } from "../actor.ts";
import { asNumber } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { type Account, type AccountKind, type BenefitKind, toAccount } from "../models.ts";
import { marks } from "../sql.ts";
import { insertRow, softDeleteRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

export type CreateAccountInput = {
	spaceId: string;
	kind: AccountKind;
	name: string;
	currency?: string;
	/** In minor units, as every amount in this project. */
	initialBalance?: number;
	institution?: string | null;
	/** A credit card needs all three, and nothing else uses them. */
	closingDay?: number | null;
	dueDay?: number | null;
	creditLimit?: number | null;
	/** Which pot a voucher is: VR, VA, VT and the rest. Only a voucher may say. */
	benefit?: BenefitKind | null;
	/** What lands on a voucher each month, the day it lands, and whether the leftover carries. */
	quotaAmount?: number | null;
	quotaDay?: number | null;
	quotaCarries?: boolean | null;
};

export type UpdateAccountInput = {
	name?: string;
	institution?: string | null;
	initialBalance?: number;
	benefit?: BenefitKind | null;
	quotaAmount?: number | null;
	quotaDay?: number | null;
	quotaCarries?: boolean | null;
	/**
	 * The cycle of a credit card, and what the bank allows on it.
	 *
	 * Correctable, because a bank changes them and because the day somebody typed when they
	 * added the card is the thing most likely to be a guess. Registry 0045 said all three
	 * could be corrected and only the name, the institution, the opening balance and the
	 * allowance could.
	 *
	 * Every invoice of the card is worked out from the closing day, so changing it moves
	 * purchases between invoices, and it does not move the ones somebody has already put
	 * where they wanted them.
	 */
	closingDay?: number | null;
	dueDay?: number | null;
	creditLimit?: number | null;
};

const SELECT = `SELECT "id", "space_id", "kind", "name", "currency", "initial_balance",
	"institution", "archived_at", "closing_day", "due_day", "credit_limit", "benefit",
	"quota_amount", "quota_day", "quota_carries",
	"created_by", "created_at", "updated_at"
	FROM "accounts"`;

/**
 * Stored as a number, because the two dialects disagree about booleans and this project
 * keeps flags as integers everywhere else for the same reason.
 */
function quotaCarriesValue(carries: boolean | null | undefined): number | null {
	if (carries === null || carries === undefined) return null;
	return carries ? 1 : 0;
}

/**
 * An allowance belongs to a voucher and to nothing else.
 *
 * A current account with a monthly allowance on it would show a figure nobody could
 * explain, and the amount is the one a person types, so it is checked here rather than
 * trusted. A voucher with no allowance is allowed: every voucher written before this
 * release is one, and the screen asks for it rather than the model refusing to open.
 */
function assertQuota(
	input: { quotaAmount?: number | null; quotaDay?: number | null; quotaCarries?: boolean | null },
	kind: AccountKind,
): void {
	const says = input.quotaAmount != null || input.quotaDay != null || input.quotaCarries != null;
	if (says && kind !== "voucher") {
		throw new RuleError(
			"quotaIsForVouchers",
			"only a benefit account is credited with an amount every month",
		);
	}
	if (
		input.quotaAmount != null &&
		(!Number.isSafeInteger(input.quotaAmount) || input.quotaAmount <= 0)
	) {
		throw new RuleError(
			"quotaIsPositive",
			"what lands on a benefit card each month is a whole amount, more than nothing",
		);
	}
	if (
		input.quotaDay != null &&
		(!Number.isInteger(input.quotaDay) || input.quotaDay < 1 || input.quotaDay > 31)
	) {
		throw new RuleError(
			"quotaDayIsADayOfTheMonth",
			"the day an allowance lands is a day of a month",
		);
	}
}

export function createAccountsRepository(context: RepositoryContext) {
	/** The timezone of a space, for turning the instant a row was written into a day. */
	async function timezoneOf(spaceId: string): Promise<string> {
		const rows = await context.driver.all(
			`SELECT "timezone" FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
			[spaceId],
		);
		return String(rows[0]?.timezone ?? "America/Sao_Paulo");
	}

	/**
	 * What went out of an account between two days, as a positive number.
	 *
	 * Only what has happened: a lunch written for next Tuesday has not been eaten, and a
	 * card that says otherwise is a card that will surprise somebody at the till.
	 */
	async function spentBetween(
		accountId: string,
		from: CalendarDate,
		to: CalendarDate,
	): Promise<number> {
		const rows = await context.driver.all(
			`SELECT COALESCE(SUM(-"amount"), 0) AS spent FROM "transactions"
			 WHERE "account_id" = ? AND "deleted_at" IS NULL AND "status" = 'settled'
			   AND "kind" = 'expense' AND "happened_on" >= ? AND "happened_on" <= ?`,
			[accountId, from, to],
		);
		return asNumber(rows[0]?.spent ?? 0);
	}

	/**
	 * Finds an account anywhere this person can read. Asking for an account in someone
	 * else's space gives the same answer as asking for one that does not exist, so the
	 * question itself reveals nothing.
	 */
	async function reachable(id: string): Promise<Account> {
		const spaceIds = readableSpaceIds(context.actor());
		if (spaceIds.length === 0) throw new NotFoundError("account", id);
		const rows = await context.driver.all(
			`${SELECT} WHERE "id" = ? AND "space_id" IN (${marks(spaceIds.length)}) AND "deleted_at" IS NULL`,
			[id, ...spaceIds],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("account", id);
		return toAccount(first);
	}

	return {
		async create(input: CreateAccountInput): Promise<Account> {
			assertCan(context.actor(), input.spaceId, "account.create");

			if (input.name.trim() === "") {
				throw new RuleError("nameIsRequired", "an account needs a name to be found later");
			}
			if (input.initialBalance !== undefined && !Number.isSafeInteger(input.initialBalance)) {
				throw new RuleError(
					"amountIsInteger",
					"the opening balance is an integer of minor units, never a fractional number",
				);
			}
			/**
			 * A card and a benefit card are written down with nothing on them.
			 *
			 * Neither holds a balance somebody can type. What is on a card is its invoice,
			 * which is made of purchases, and what is on a benefit card is the allowance less
			 * what was eaten, which is worked out from the quota. A number typed into either
			 * is a number that then sits in every total for ever with nothing to explain it,
			 * and the screen used to offer the field under the sentence "how much is in this
			 * account today", which is the wrong question for both.
			 *
			 * Only on a new one. The ones written down before this release keep their opening
			 * balance and keep counting: on a card it is the debt that was already there, and
			 * on a benefit card it is the starting point of what has carried, which is exactly
			 * what `benefitLeft` reads. Correcting one is still allowed for the same reason.
			 */
			if (
				input.initialBalance !== undefined &&
				input.initialBalance !== 0 &&
				(input.kind === "credit" || input.kind === "voucher")
			) {
				throw new RuleError(
					"noOpeningBalanceOnACard",
					"a card is written down empty: what is on it is the invoice, or the allowance",
				);
			}

			// A current account that claims to be a meal voucher would be filtered as one
			// everywhere, so the two have to agree from the start.
			if (input.benefit != null && input.kind !== "voucher") {
				throw new RuleError(
					"benefitIsForVouchers",
					"only a voucher account says which benefit it holds",
				);
			}
			assertQuota(input, input.kind);

			// The currency of the space, and not the currency of Brazil.
			//
			// An account was stamped BRL whatever the space said, so a household keeping
			// euros had every account labelled in reais and every total adding two
			// currencies as though they were one.
			const rows = await context.driver.all(
				`SELECT "base_currency" FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
				[input.spaceId],
			);
			const spaceCurrency = String(rows[0]?.base_currency ?? "BRL");

			const id = await insertRow(context.write(), {
				table: accounts,
				spaceId: input.spaceId,
				values: {
					kind: input.kind,
					name: input.name.trim(),
					currency: input.currency ?? spaceCurrency,
					initial_balance: input.initialBalance ?? 0,
					institution: input.institution ?? null,
					archived_at: null,
					closing_day: input.closingDay ?? null,
					due_day: input.dueDay ?? null,
					credit_limit: input.creditLimit ?? null,
					benefit: input.benefit ?? null,
					quota_amount: input.quotaAmount ?? null,
					quota_day: input.quotaDay ?? null,
					quota_carries: quotaCarriesValue(input.quotaCarries),
					created_by: context.actor().userId,
				},
			});

			return reachable(id);
		},

		async list(spaceId: string, options: { includeArchived?: boolean } = {}): Promise<Account[]> {
			assertCan(context.actor(), spaceId, "account.read");
			const archived = options.includeArchived === true ? "" : ` AND "archived_at" IS NULL`;
			const rows = await context.driver.all(
				`${SELECT} WHERE "space_id" = ? AND "deleted_at" IS NULL${archived} ORDER BY "name"`,
				[spaceId],
			);
			return rows.map(toAccount);
		},

		/** The consolidated view: everything this person can see, across their spaces. */
		async listEverywhere(options: { includeArchived?: boolean } = {}): Promise<Account[]> {
			const spaceIds = readableSpaceIds(context.actor()).filter((spaceId) =>
				context.can(spaceId, "account.read"),
			);
			if (spaceIds.length === 0) return [];
			const archived = options.includeArchived === true ? "" : ` AND "archived_at" IS NULL`;
			const rows = await context.driver.all(
				`${SELECT} WHERE "space_id" IN (${marks(spaceIds.length)}) AND "deleted_at" IS NULL${archived}
				 ORDER BY "name"`,
				spaceIds,
			);
			return rows.map(toAccount);
		},

		async get(id: string): Promise<Account> {
			const account = await reachable(id);
			assertCan(context.actor(), account.spaceId, "account.read");
			return account;
		},

		async update(id: string, input: UpdateAccountInput): Promise<Account> {
			const account = await reachable(id);
			assertCan(context.actor(), account.spaceId, "account.update");

			const values: Record<string, string | number | null> = {};
			if (input.name !== undefined) values.name = input.name.trim();
			if (input.institution !== undefined) values.institution = input.institution;
			if (input.initialBalance !== undefined) {
				if (!Number.isSafeInteger(input.initialBalance)) {
					throw new RuleError(
						"amountIsInteger",
						"the opening balance is an integer of minor units, never a fractional number",
					);
				}
				values.initial_balance = input.initialBalance;
			}
			if (input.benefit !== undefined) {
				if (input.benefit !== null && account.kind !== "voucher") {
					throw new RuleError(
						"benefitIsForVouchers",
						"only a voucher account says which benefit it holds",
					);
				}
				values.benefit = input.benefit;
			}
			assertQuota(input, account.kind);
			if (input.quotaAmount !== undefined) values.quota_amount = input.quotaAmount;
			if (input.quotaDay !== undefined) values.quota_day = input.quotaDay;
			if (input.quotaCarries !== undefined) {
				values.quota_carries = quotaCarriesValue(input.quotaCarries);
			}

			// Only a card has a cycle, and without both of its days it has no invoices at all.
			for (const [name, given] of [
				["closing_day", input.closingDay],
				["due_day", input.dueDay],
			] as const) {
				if (given === undefined) continue;
				if (given !== null && account.kind !== "credit") {
					throw new RuleError(
						"cycleIsForCards",
						"only a credit card has a day it closes and a day it falls due",
					);
				}
				if (given !== null && (!Number.isInteger(given) || given < 1 || given > 31)) {
					throw new RuleError(
						"dayIsADayOfTheMonth",
						"a closing day and a due day are days of the month, one to thirty one",
					);
				}
				values[name] = given;
			}
			if (input.creditLimit !== undefined) {
				if (input.creditLimit !== null && account.kind !== "credit") {
					throw new RuleError("limitIsForCards", "only a credit card has a limit");
				}
				if (input.creditLimit !== null && !Number.isSafeInteger(input.creditLimit)) {
					throw new RuleError(
						"amountIsInteger",
						"the opening balance is an integer of minor units, never a fractional number",
					);
				}
				values.credit_limit = input.creditLimit;
			}

			await updateRow(context.write(), {
				table: accounts,
				spaceId: account.spaceId,
				id,
				values,
			});
			return reachable(id);
		},

		/**
		 * What is left on a benefit card, for the period the day falls in.
		 *
		 * Nothing is written when an allowance lands, so this is worked out rather than
		 * read. What has carried, on a card that carries, is the opening balance plus every
		 * allowance since the account was written down, less everything spent before this
		 * period started. The opening balance is what somebody typed when they added the
		 * card, which is exactly the right starting point for that sum.
		 *
		 * Nothing comes back for an account with no allowance on it, which every voucher
		 * written before this release is. The screen asks for one rather than guessing.
		 */
		async benefitLeft(id: string, today: CalendarDate): Promise<BenefitState | null> {
			const account = await reachable(id);
			assertCan(context.actor(), account.spaceId, "account.read");
			// Nothing for somebody who only sees their own records. The allowance belongs to
			// the space and what is left of it is made of every purchase on the card whoever
			// made it, so this read the household's meal card to somebody who cannot see a
			// single one of the lunches it is made of, on a screen whose other lines were
			// already empty for them.
			if (seesOwnRowsOnly(context.actor(), account.spaceId)) return null;
			if (account.kind !== "voucher") return null;
			if (account.quotaAmount === null || account.quotaDay === null) return null;

			const quota = {
				amount: account.quotaAmount,
				day: account.quotaDay,
				carries: account.quotaCarries ?? true,
			};

			// A day rather than an instant, in the timezone of the space, because the
			// periods are counted in days and the row remembers a millisecond in UTC.
			const openedOn = todayIn(await timezoneOf(account.spaceId), new Date(account.createdAt));
			const period = periodOf(today, quota.day);

			const [spentSinceOpening, spentThisPeriod] = await Promise.all([
				spentBetween(account.id, openedOn, today),
				spentBetween(account.id, period.from, today),
			]);

			return benefitState({
				quota,
				today,
				openedOn,
				openingBalance: account.initialBalance,
				spentSinceOpening,
				spentThisPeriod,
			});
		},

		/**
		 * How many records are charged to an account, so a screen can say what goes with it.
		 *
		 * Deleting an account leaves its records where they are, pointing at something that
		 * no longer resolves, so their money stops being counted anywhere while the rows
		 * stay in every list. Somebody about to do that is owed the number.
		 *
		 * It counts what the asker can see, like every other count in this project. Only
		 * whoever runs a space can delete an account, so the dialog that reads this never
		 * shows it to anybody else, and a count of the household's rows was still one
		 * question about the household that the contract and the route answered to anybody
		 * signed in.
		 */
		async recordCount(id: string): Promise<number> {
			const account = await reachable(id);
			assertCan(context.actor(), account.spaceId, "account.read");
			const onlyMine = seesOwnRowsOnly(context.actor(), account.spaceId);
			const rows = await context.driver.all(
				`SELECT COUNT(*) AS how_many FROM "transactions"
				 WHERE "deleted_at" IS NULL AND ("account_id" = ? OR "counter_account_id" = ?)
				   ${onlyMine ? `AND "created_by" = ?` : ""}`,
				onlyMine ? [id, id, context.actor().userId] : [id, id],
			);
			return asNumber(rows[0]?.how_many ?? 0);
		},

		/** Archiving keeps the history and takes the account out of the way. */
		async archive(id: string): Promise<Account> {
			const account = await reachable(id);
			assertCan(context.actor(), account.spaceId, "account.archive");
			await updateRow(context.write(), {
				table: accounts,
				spaceId: account.spaceId,
				id,
				values: { archived_at: context.now() },
			});
			return reachable(id);
		},

		async unarchive(id: string): Promise<Account> {
			const account = await reachable(id);
			assertCan(context.actor(), account.spaceId, "account.archive");
			await updateRow(context.write(), {
				table: accounts,
				spaceId: account.spaceId,
				id,
				values: { archived_at: null },
			});
			return reachable(id);
		},

		/**
		 * Removing an account takes the cards that reached it with it.
		 *
		 * A card is a way to reach an account, so a card whose account is gone is not a
		 * card any more: a credit card with no invoice charges nothing, and a debit card
		 * with no balance spends nothing. Left behind, it would sit in the list naming an
		 * account that is not there, and would still be offered on a record it could
		 * never be saved with.
		 *
		 * A cartao multiplo goes too, even though one of its two sides may still exist.
		 * Half a multiple card is not a kind this project has, and a kind never changes
		 * under somebody, so the honest move is to let it go and let them add the card
		 * they actually have.
		 *
		 * The records are untouched, as they are when a card is removed on its own: what
		 * they were charged to is the account, and they keep saying so.
		 */
		async remove(id: string): Promise<void> {
			const account = await reachable(id);
			assertCan(context.actor(), account.spaceId, "account.delete");

			const reaching = await context.driver.all(
				`SELECT "id" FROM "cards"
				 WHERE "space_id" = ? AND "deleted_at" IS NULL
				   AND ("credit_account_id" = ? OR "debit_account_id" = ?)`,
				[account.spaceId, id, id],
			);
			for (const row of reaching) {
				await softDeleteRow(context.write(), {
					table: cards,
					spaceId: account.spaceId,
					id: String(row.id),
				});
			}

			await softDeleteRow(context.write(), {
				table: accounts,
				spaceId: account.spaceId,
				id,
			});
		},
	};
}

export type AccountsRepository = ReturnType<typeof createAccountsRepository>;
