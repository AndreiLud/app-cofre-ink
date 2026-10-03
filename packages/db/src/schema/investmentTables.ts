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
 * What 2.0.0 added to a holding: the product it is, who issued it, when it matures and from
 * when it can be taken out, the day a poupança is credited, the index it follows, how quickly it
 * can be had, and its rate in hundredths of a percentage point (100% of the CDI is 10000, 12% a
 * year is 1200). None of them has a check: the products live in packages/core, and a check here
 * would have to be widened, which in SQLite rebuilds the table.
 */
export const HOLDING_PRODUCT_COLUMNS = [
	{ name: "product", type: "text" as const },
	{ name: "issuer", type: "text" as const },
	{ name: "matures_on", type: "text" as const },
	{ name: "liquid_from", type: "text" as const },
	{ name: "anniversary_day", type: "integer" as const },
	{ name: "indexer", type: "text" as const },
	{ name: "liquidity", type: "text" as const },
	{ name: "rate", type: "bigint" as const },
];

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
		...HOLDING_PRODUCT_COLUMNS,
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

export const HOLDING_MOVE_KINDS = ["in", "out", "income"] as const;

/**
 * Money put into a holding, taken out of it, or paid by it.
 *
 * The quantity and the cost on the holding are what it was opened with, which only Editar
 * changes; everything after is a movement, so two devices that each put money in on the same day
 * add up instead of one writing over the other. A movement that came from an account or went to
 * one names the record that moved the money.
 */
export const holdingMoves = defineTable({
	name: "holding_moves",
	scope: "space",
	columns: [
		{
			name: "holding_id",
			type: "text",
			notNull: true,
			references: { table: "holdings", column: "id", onDelete: "cascade" },
		},
		{ name: "on_day", type: "text", notNull: true },
		{ name: "kind", type: "text", notNull: true, check: inList("kind", HOLDING_MOVE_KINDS) },
		/** Minor units, always positive: the kind says which way. */
		{ name: "amount", type: "bigint", notNull: true },
		/** Units bought or sold, scaled by ten to the eighth, when the holding is counted in units. */
		{ name: "quantity", type: "bigint" },
		{
			name: "transaction_id",
			type: "text",
			references: { table: "transactions", column: "id", onDelete: "setNull" },
		},
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
	indexes: [{ name: "holding_moves_by_holding", columns: ["holding_id", "on_day"] }],
});

/** The daily series: the CDI (12), the Selic (11) and the poupança (195). */
export const INDEX_DAY_SERIES = ["cdiDaily", "selicDaily", "savings"] as const;

/**
 * What a daily index did on a day, as published.
 *
 * The second table with no space, beside the monthly one, and for the same reason: it is the
 * same for everybody, and a device that wants it asks the source. It is not replicated and it is
 * not in a backup, so two members may see different estimates until each has fetched.
 */
export const indexDays = defineTable({
	name: "index_days",
	scope: "global",
	replicated: false,
	columns: [
		{ name: "series", type: "text", notNull: true, check: inList("series", INDEX_DAY_SERIES) },
		/** The day it is for; for the poupança, the first day of the month its rate is for. */
		{ name: "day", type: "text", notNull: true },
		/** Hundred millionths of a percentage point: 0,050788% is 5078800. */
		{ name: "rate", type: "bigint", notNull: true },
		{ name: "fetched_at", type: "bigint", notNull: true },
	],
	indexes: [{ name: "index_days_by_series", columns: ["series", "day"] }],
	uniqueTogether: [["series", "day"]],
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

export const INVESTMENT_TABLES = [
	holdings,
	holdingPrices,
	holdingMoves,
	indexRates,
	indexDays,
	scenarios,
] as const;
