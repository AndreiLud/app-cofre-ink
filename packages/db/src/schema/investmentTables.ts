// What somebody owns, what it was worth, and what the country did meanwhile.
//
// Prices are typed in by hand, as decision seven of the project says. A quote service
// would mean a key, a bill, a rate limit and a dependency on somebody else staying in
// business, and the person who wants a portfolio that updates itself already has one at
// their broker. What this is for is knowing whether the money put aside is keeping up.
//
// The indices are the exception, and only because they are public, official, small and
// the same for everybody: the CDI, the Selic and the IPCA, as published by the Banco
// Central, kept here so that the comparison works with the aeroplane mode on.

import { defineTable } from "./types.ts";

export const HOLDING_KINDS = [
	"fixedIncome",
	"fund",
	"stock",
	"realEstate",
	"crypto",
	"pension",
	"other",
] as const;

function inList(column: string, values: readonly string[]): string {
	return `${column} in (${values.map((value) => `'${value}'`).join(", ")})`;
}

/**
 * One thing that is owned, inside an account.
 *
 * The quantity and the price are kept apart, because a share is a quantity and a bond
 * is one unit whose price is the whole of it, and both have to fit. What a holding is
 * worth is always the two multiplied, and never a number typed on its own, so that a
 * price corrected once corrects the history with it.
 */
export const holdings = defineTable({
	name: "holdings",
	scope: "space",
	columns: [
		{
			name: "account_id",
			type: "text",
			notNull: true,
			references: { table: "accounts", column: "id", onDelete: "cascade" },
		},
		{ name: "name", type: "text", notNull: true },
		{ name: "kind", type: "text", notNull: true, check: inList("kind", HOLDING_KINDS) },
		/** What it is called where it is traded, when it has such a name. */
		{ name: "ticker", type: "text" },
		/** Scaled by ten to the eighth, because a fund has fractional quantities. */
		{ name: "quantity", type: "bigint", notNull: true },
		/** Minor units for one unit of it. */
		{ name: "unit_price", type: "bigint", notNull: true },
		{ name: "currency", type: "text", notNull: true, defaultTo: "'BRL'" },
		/** What was paid, in total, which is what a gain is measured against. */
		{ name: "cost", type: "bigint", notNull: true, defaultTo: 0 },
		{ name: "bought_on", type: "text" },
		/** The day the price was last typed in, so the screen can say how old it is. */
		{ name: "priced_on", type: "text" },
		{ name: "notes", type: "text" },
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
	indexes: [{ name: "holdings_by_account", columns: ["account_id"] }],
});

/**
 * A price on a day, kept when one is typed in, so that a portfolio has a line and not
 * just a number. The current price of a holding is the newest of these.
 */
export const holdingPrices = defineTable({
	name: "holding_prices",
	scope: "space",
	columns: [
		{
			name: "holding_id",
			type: "text",
			notNull: true,
			references: { table: "holdings", column: "id", onDelete: "cascade" },
		},
		{ name: "on_day", type: "text", notNull: true },
		{ name: "unit_price", type: "bigint", notNull: true },
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
	indexes: [{ name: "holding_prices_by_holding", columns: ["holding_id", "on_day"] }],
});

export const INDEX_SERIES = ["cdi", "selic", "ipca"] as const;

/**
 * What an index did in a month, as published.
 *
 * It belongs to no space: it is the same number for everybody in the country, and
 * copying it per space would mean fetching it again per space. It is also the one table
 * here that is not replicated, because a device that wants it can ask the source.
 */
export const indexRates = defineTable({
	name: "index_rates",
	scope: "global",
	replicated: false,
	columns: [
		{ name: "series", type: "text", notNull: true, check: inList("series", INDEX_SERIES) },
		/** The month it is about, as a calendar month. */
		{ name: "month", type: "text", notNull: true },
		/** Hundredths of a percent for that month, so one per cent is 100. */
		{ name: "rate", type: "bigint", notNull: true },
		{ name: "fetched_at", type: "bigint", notNull: true },
	],
	indexes: [{ name: "index_rates_by_series", columns: ["series", "month"] }],
	uniqueTogether: [["series", "month"]],
});

/**
 * A question somebody asked about the future and wants to ask again.
 *
 * The adjustments are whatever the screen puts there, for the same reason a saved
 * filter is: the shape of a question belongs to the screen that asks it, and a new kind
 * of adjustment should not cost a migration.
 */
export const scenarios = defineTable({
	name: "scenarios",
	scope: "space",
	columns: [
		{ name: "name", type: "text", notNull: true },
		{ name: "adjustments", type: "json", notNull: true },
		{ name: "position", type: "integer", notNull: true, defaultTo: 0 },
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
	indexes: [{ name: "scenarios_by_space", columns: ["space_id", "position"] }],
});

export const INVESTMENT_TABLES = [holdings, holdingPrices, indexRates, scenarios] as const;
