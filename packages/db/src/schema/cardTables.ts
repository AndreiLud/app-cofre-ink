// The plastic, which is not the same thing as the money.
//
// An account is where money sits. A card is a way to reach it, and the two are not one
// to one. A cartao multiplo is one card that reaches a current account when it is used
// as debit and a credit line when it is used as credit. A benefit card reaches a pot
// that only certain shops accept. A credit card, on its own, is the only case where the
// card and the account look like the same thing, and even there they are not: the
// account is the invoice, the card is the number that was typed into a shop.
//
// So a card points at up to two accounts: one it charges as credit, one it takes from
// as debit. Which of the two are filled is what the kind means, and the repository
// refuses any other combination.

import { defineTable } from "./types.ts";

/**
 * credit: only a credit line, the purchase lands on an invoice.
 * debit: only a balance, the purchase leaves it the same day.
 * multiple: both, on one piece of plastic, chosen at the till.
 * benefit: a balance somebody else put there, VR, VA, VT and the rest.
 * prepaid: a balance the person loaded themselves, including a gift card.
 */
export const CARD_KINDS = ["credit", "debit", "multiple", "benefit", "prepaid"] as const;

function inList(column: string, values: readonly string[]): string {
	return `${column} in (${values.map((value) => `'${value}'`).join(", ")})`;
}

export const cards = defineTable({
	name: "cards",
	scope: "space",
	columns: [
		{ name: "kind", type: "text", notNull: true, check: inList("kind", CARD_KINDS) },
		{ name: "name", type: "text", notNull: true },
		/**
		 * The four digits printed on it, which is how a statement names a card and how
		 * an import knows which one it is reading. Four characters or nothing.
		 */
		{ name: "last_four", type: "text" },
		/** The invoice it charges. Filled for credit and multiple, empty otherwise. */
		{
			name: "credit_account_id",
			type: "text",
			references: { table: "accounts", column: "id", onDelete: "cascade" },
		},
		/** The balance it spends. Empty for a card that only works as credit. */
		{
			name: "debit_account_id",
			type: "text",
			references: { table: "accounts", column: "id", onDelete: "cascade" },
		},
		{ name: "archived_at", type: "bigint" },
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
	indexes: [
		{ name: "cards_by_space_and_kind", columns: ["space_id", "kind"] },
		{ name: "cards_by_credit_account", columns: ["credit_account_id"] },
		{ name: "cards_by_debit_account", columns: ["debit_account_id"] },
	],
});

export const CARD_TABLES = [cards] as const;
