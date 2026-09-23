// Cards: the plastic, and the one or two accounts it reaches.
//
// The rule this file exists to hold is that a card of a given kind reaches exactly the
// accounts that kind implies. A credit card that reaches no invoice cannot charge
// anything, and a debit card that points at a credit line is a credit card somebody
// mislabelled. Those two mistakes are silent everywhere else in the application: the
// purchase lands somewhere, the invoice is wrong, and nobody finds out until the bill
// arrives. So they are refused here, at the only door.
//
// Permission uses the account words rather than words of its own. A card is furniture
// of the accounts screen, it holds no money and it grants no sight of anything a person
// could not already see, so a second set of five roles would be five more things to
// keep in step with nothing to show for it.

import { cards } from "@cofre/db";
import { assertCan, readableSpaceIds } from "../actor.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { type Account, type Card, type CardKind, toAccount, toCard } from "../models.ts";
import { marks } from "../sql.ts";
import { insertRow, softDeleteRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

export type CreateCardInput = {
	spaceId: string;
	kind: CardKind;
	name: string;
	lastFour?: string | null;
	/** The invoice it charges. Required for credit and multiple, refused otherwise. */
	creditAccountId?: string | null;
	/** The balance it spends. Required for everything except a pure credit card. */
	debitAccountId?: string | null;
};

export type UpdateCardInput = {
	name?: string;
	lastFour?: string | null;
	creditAccountId?: string | null;
	debitAccountId?: string | null;
};

const SELECT = `SELECT "id", "space_id", "kind", "name", "last_four", "credit_account_id",
	"debit_account_id", "archived_at", "created_by", "created_at", "updated_at"
	FROM "cards"`;

/** What each kind reaches. True means required, false means it has to be empty. */
const SHAPE: Record<CardKind, { credit: boolean; debit: boolean }> = {
	credit: { credit: true, debit: false },
	debit: { credit: false, debit: true },
	multiple: { credit: true, debit: true },
	benefit: { credit: false, debit: true },
	prepaid: { credit: false, debit: true },
};

const FOUR_DIGITS = /^[0-9]{4}$/;

export function createCardsRepository(context: RepositoryContext) {
	async function reachable(id: string): Promise<Card> {
		const spaceIds = readableSpaceIds(context.actor());
		if (spaceIds.length === 0) throw new NotFoundError("card", id);
		const rows = await context.driver.all(
			`${SELECT} WHERE "id" = ? AND "space_id" IN (${marks(spaceIds.length)}) AND "deleted_at" IS NULL`,
			[id, ...spaceIds],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("card", id);
		return toCard(first);
	}

	/**
	 * An account of this space, or nothing at all. Naming an account of another space is
	 * how a card would become a way to write into a space somebody was never in, so the
	 * space is part of the question and not something checked afterwards.
	 */
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

	function cleanFour(value: string | null | undefined): string | null {
		if (value === undefined || value === null) return null;
		const digits = value.trim();
		if (digits === "") return null;
		if (!FOUR_DIGITS.test(digits)) {
			throw new RuleError(
				"lastFourIsFourDigits",
				"a card is named by the four digits printed on it",
			);
		}
		return digits;
	}

	/**
	 * The two links, checked against what the kind promises and against what the
	 * accounts actually are. An invoice only exists on a credit account, and a balance
	 * only exists on an account that is not one.
	 */
	async function links(
		spaceId: string,
		kind: CardKind,
		input: { creditAccountId?: string | null; debitAccountId?: string | null },
	): Promise<{ credit: string | null; debit: string | null }> {
		const shape = SHAPE[kind];
		const credit = input.creditAccountId ?? null;
		const debit = input.debitAccountId ?? null;

		if (shape.credit && credit === null) {
			throw new RuleError(
				"cardNeedsCreditAccount",
				"a card that charges an invoice has to say which invoice",
			);
		}
		if (!shape.credit && credit !== null) {
			throw new RuleError(
				"cardHasNoCredit",
				"this kind of card does not charge an invoice, so it cannot name one",
			);
		}
		if (shape.debit && debit === null) {
			throw new RuleError(
				"cardNeedsDebitAccount",
				"a card that spends a balance has to say which balance",
			);
		}
		if (!shape.debit && debit !== null) {
			throw new RuleError(
				"cardHasNoDebit",
				"this kind of card does not spend a balance, so it cannot name one",
			);
		}

		if (credit !== null) {
			const account = await accountIn(spaceId, credit);
			if (account.kind !== "credit") {
				throw new RuleError(
					"creditAccountIsNotACard",
					"an invoice lives on a credit account, and this one is not",
				);
			}
		}
		if (debit !== null) {
			const account = await accountIn(spaceId, debit);
			if (account.kind === "credit") {
				throw new RuleError(
					"debitAccountIsACard",
					"a credit account is an invoice, not a balance a card can spend",
				);
			}
		}

		return { credit, debit };
	}

	return {
		async create(input: CreateCardInput): Promise<Card> {
			assertCan(context.actor(), input.spaceId, "account.create");

			if (input.name.trim() === "") {
				throw new RuleError("nameIsRequired", "a card needs a name to be picked later");
			}
			const lastFour = cleanFour(input.lastFour);
			const reaches = await links(input.spaceId, input.kind, input);

			const id = await insertRow(context.write(), {
				table: cards,
				spaceId: input.spaceId,
				values: {
					kind: input.kind,
					name: input.name.trim(),
					last_four: lastFour,
					credit_account_id: reaches.credit,
					debit_account_id: reaches.debit,
					archived_at: null,
					created_by: context.actor().userId,
				},
			});

			return reachable(id);
		},

		async list(spaceId: string, options: { includeArchived?: boolean } = {}): Promise<Card[]> {
			assertCan(context.actor(), spaceId, "account.read");
			const archived = options.includeArchived === true ? "" : ` AND "archived_at" IS NULL`;
			const rows = await context.driver.all(
				`${SELECT} WHERE "space_id" = ? AND "deleted_at" IS NULL${archived} ORDER BY "name"`,
				[spaceId],
			);
			return rows.map(toCard);
		},

		async get(id: string): Promise<Card> {
			const card = await reachable(id);
			assertCan(context.actor(), card.spaceId, "account.read");
			return card;
		},

		/**
		 * The kind never changes. A card that became another kind would leave every
		 * record it already wrote pointing at an invoice it no longer charges, so the
		 * honest move is to archive it and add the card that actually exists.
		 */
		async update(id: string, input: UpdateCardInput): Promise<Card> {
			const card = await reachable(id);
			assertCan(context.actor(), card.spaceId, "account.update");

			const values: Record<string, string | number | null> = {};
			if (input.name !== undefined) {
				if (input.name.trim() === "") {
					throw new RuleError("nameIsRequired", "a card needs a name to be picked later");
				}
				values.name = input.name.trim();
			}
			if (input.lastFour !== undefined) values.last_four = cleanFour(input.lastFour);

			if (input.creditAccountId !== undefined || input.debitAccountId !== undefined) {
				const reaches = await links(card.spaceId, card.kind, {
					creditAccountId:
						input.creditAccountId === undefined ? card.creditAccountId : input.creditAccountId,
					debitAccountId:
						input.debitAccountId === undefined ? card.debitAccountId : input.debitAccountId,
				});
				values.credit_account_id = reaches.credit;
				values.debit_account_id = reaches.debit;
			}

			await updateRow(context.write(), {
				table: cards,
				spaceId: card.spaceId,
				id,
				values,
			});
			return reachable(id);
		},

		async archive(id: string): Promise<Card> {
			const card = await reachable(id);
			assertCan(context.actor(), card.spaceId, "account.archive");
			await updateRow(context.write(), {
				table: cards,
				spaceId: card.spaceId,
				id,
				values: { archived_at: context.now() },
			});
			return reachable(id);
		},

		async unarchive(id: string): Promise<Card> {
			const card = await reachable(id);
			assertCan(context.actor(), card.spaceId, "account.archive");
			await updateRow(context.write(), {
				table: cards,
				spaceId: card.spaceId,
				id,
				values: { archived_at: null },
			});
			return reachable(id);
		},

		async remove(id: string): Promise<void> {
			const card = await reachable(id);
			assertCan(context.actor(), card.spaceId, "account.delete");
			// The records that named it are left alone. What they were charged to is the
			// account, which is still there, and the card is read through a join that
			// skips a removed row, so they simply stop saying which plastic was used.
			// Rewriting them here would be a write nobody asked for and, worse, one that
			// would have to travel to every other device to mean anything.
			await softDeleteRow(context.write(), {
				table: cards,
				spaceId: card.spaceId,
				id,
			});
		},
	};
}

export type CardsRepository = ReturnType<typeof createCardsRepository>;
