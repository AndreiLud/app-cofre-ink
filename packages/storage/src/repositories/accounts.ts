import { accounts, cards } from "@cofre/db";
import { assertCan, readableSpaceIds } from "../actor.ts";
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
};

export type UpdateAccountInput = {
	name?: string;
	institution?: string | null;
	initialBalance?: number;
	benefit?: BenefitKind | null;
};

const SELECT = `SELECT "id", "space_id", "kind", "name", "currency", "initial_balance",
	"institution", "archived_at", "closing_day", "due_day", "credit_limit", "benefit",
	"created_by", "created_at", "updated_at"
	FROM "accounts"`;

export function createAccountsRepository(context: RepositoryContext) {
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
			// A current account that claims to be a meal voucher would be filtered as one
			// everywhere, so the two have to agree from the start.
			if (input.benefit != null && input.kind !== "voucher") {
				throw new RuleError(
					"benefitIsForVouchers",
					"only a voucher account says which benefit it holds",
				);
			}

			const id = await insertRow(context.write(), {
				table: accounts,
				spaceId: input.spaceId,
				values: {
					kind: input.kind,
					name: input.name.trim(),
					currency: input.currency ?? "BRL",
					initial_balance: input.initialBalance ?? 0,
					institution: input.institution ?? null,
					archived_at: null,
					closing_day: input.closingDay ?? null,
					due_day: input.dueDay ?? null,
					credit_limit: input.creditLimit ?? null,
					benefit: input.benefit ?? null,
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

			await updateRow(context.write(), {
				table: accounts,
				spaceId: account.spaceId,
				id,
				values,
			});
			return reachable(id);
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
