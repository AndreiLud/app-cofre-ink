// What a holding can be, said once.
//
// The kinds of holding were written four times, none of them here: in the table, in the
// model, on the server and on the screen, and the four drifted. A product is what a person
// recognises on a statement, a caixinha, a CDB, a share, and each one says here which of the
// seven kinds the table keeps it under, how its value is known, what the form asks for, how
// finely it is counted and how its income is taxed. The seven kinds stay where they are, in
// the table, because widening the check of a column in SQLite rebuilds the table.
//
// A house is not here. A home is not money (registry 0042), and "Imóvel" left the menu; a
// holding written down as one before 2.0.0 is read as the generic product of its kind.

/** The seven kinds the table keeps, which every product falls into. */
export type HoldingKindOfProduct =
	| "fixedIncome"
	| "fund"
	| "stock"
	| "realEstate"
	| "crypto"
	| "pension"
	| "other";

/** The groups the form opens with, in its order. */
export type ProductGroup =
	| "daily"
	| "fixedIncome"
	| "exchange"
	| "fund"
	| "crypto"
	| "pension"
	| "other";

export const PRODUCT_GROUPS: readonly ProductGroup[] = [
	"daily",
	"fixedIncome",
	"exchange",
	"fund",
	"crypto",
	"pension",
	"other",
];

/** What a product's income follows, when it follows anything. */
export type Indexer = "cdi" | "prefixed" | "ipca" | "selic" | "savings";

/**
 * How the value of a holding is known.
 *
 * Estimated from an index the Banco Central publishes, from the last value typed; the quantity
 * times a price somebody types; or a value typed as it is, from the statement.
 */
export type Valuation = "index" | "price" | "typed";

/** How finely a quantity is counted: whole units, two places, or eight. */
export type QuantityPlaces = 0 | 2 | 8;

/** How the income is taxed when it is taken out, as far as this product says. */
export type Taxation = "regressive" | "exempt" | "notComputed";

/** The fields a product's form asks for, besides the account it is in. */
export type ProductField =
	| "name"
	| "issuer"
	| "indexer"
	| "rate"
	| "maturesOn"
	| "liquidity"
	| "ticker"
	| "quantity"
	| "unitPrice"
	| "amount"
	| "since"
	| "anniversaryDay";

export type ProductId =
	| "box"
	| "brokerCash"
	| "savingsAccount"
	| "cdb"
	| "lci"
	| "lca"
	| "treasurySelic"
	| "treasuryIpca"
	| "treasuryFixed"
	| "stock"
	| "realEstateFund"
	| "etf"
	| "bdr"
	| "fund"
	| "crypto"
	| "pension"
	| "other";

export type Product = {
	id: ProductId;
	group: ProductGroup;
	kind: HoldingKindOfProduct;
	/** The indexers it may follow, the first being the one it starts with. Empty: none. */
	indexers: readonly Indexer[];
	/** How its value is known, by the indexer it follows. */
	valuation: (indexer: Indexer | null) => Valuation;
	/** What the form asks for, in order. */
	fields: readonly ProductField[];
	/** What the form refuses to save without. */
	required: readonly ProductField[];
	quantityPlaces: QuantityPlaces;
	tax: Taxation;
};

const byIndex = (indexer: Indexer | null): Valuation =>
	indexer === "ipca" || indexer === null ? "typed" : "index";

const BANK_PAPER: Omit<Product, "id" | "tax"> = {
	group: "fixedIncome",
	kind: "fixedIncome",
	indexers: ["cdi", "prefixed", "ipca"],
	valuation: byIndex,
	fields: ["issuer", "indexer", "rate", "amount", "since", "maturesOn", "liquidity"],
	required: ["issuer", "indexer", "rate", "amount", "since"],
	quantityPlaces: 2,
};

const ON_THE_EXCHANGE: Omit<Product, "id"> = {
	group: "exchange",
	kind: "stock",
	indexers: [],
	valuation: () => "price",
	// The code of the B3 in capitals, without the F of the fractional market.
	fields: ["ticker", "quantity", "unitPrice", "since"],
	required: ["ticker", "quantity", "unitPrice"],
	quantityPlaces: 0,
	tax: "notComputed",
};

export const PRODUCTS: readonly Product[] = [
	{
		id: "box",
		group: "daily",
		kind: "fixedIncome",
		indexers: ["cdi"],
		valuation: () => "index",
		fields: ["name", "rate", "amount", "since"],
		required: ["name", "rate", "amount"],
		quantityPlaces: 2,
		tax: "regressive",
	},
	{
		// Money left at the broker, which earns nothing and receives what a sale or an income
		// leaves there.
		id: "brokerCash",
		group: "daily",
		kind: "other",
		indexers: [],
		valuation: () => "typed",
		fields: ["amount", "since"],
		required: ["amount"],
		quantityPlaces: 2,
		tax: "notComputed",
	},
	{
		id: "savingsAccount",
		group: "daily",
		kind: "fixedIncome",
		indexers: ["savings"],
		valuation: () => "index",
		fields: ["name", "amount", "since", "anniversaryDay"],
		required: ["amount", "anniversaryDay"],
		quantityPlaces: 2,
		tax: "exempt",
	},
	{ id: "cdb", ...BANK_PAPER, tax: "regressive" },
	{ id: "lci", ...BANK_PAPER, tax: "exempt" },
	{ id: "lca", ...BANK_PAPER, tax: "exempt" },
	{
		id: "treasurySelic",
		group: "fixedIncome",
		kind: "fixedIncome",
		indexers: ["selic"],
		valuation: () => "index",
		fields: ["quantity", "unitPrice", "since", "maturesOn"],
		required: ["quantity", "unitPrice"],
		quantityPlaces: 2,
		tax: "regressive",
	},
	{
		id: "treasuryIpca",
		group: "fixedIncome",
		kind: "fixedIncome",
		indexers: [],
		valuation: () => "price",
		fields: ["quantity", "unitPrice", "since", "maturesOn"],
		required: ["quantity", "unitPrice"],
		quantityPlaces: 2,
		tax: "regressive",
	},
	{
		id: "treasuryFixed",
		group: "fixedIncome",
		kind: "fixedIncome",
		indexers: [],
		valuation: () => "price",
		fields: ["quantity", "unitPrice", "since", "maturesOn"],
		required: ["quantity", "unitPrice"],
		quantityPlaces: 2,
		tax: "regressive",
	},
	{ id: "stock", ...ON_THE_EXCHANGE },
	{ id: "realEstateFund", ...ON_THE_EXCHANGE },
	{ id: "etf", ...ON_THE_EXCHANGE },
	{ id: "bdr", ...ON_THE_EXCHANGE },
	{
		id: "fund",
		group: "fund",
		kind: "fund",
		indexers: [],
		valuation: () => "price",
		fields: ["name", "quantity", "unitPrice", "since"],
		required: ["name", "quantity", "unitPrice"],
		quantityPlaces: 8,
		tax: "notComputed",
	},
	{
		id: "crypto",
		group: "crypto",
		kind: "crypto",
		indexers: [],
		valuation: () => "price",
		fields: ["ticker", "quantity", "unitPrice", "since"],
		required: ["ticker", "quantity", "unitPrice"],
		quantityPlaces: 8,
		tax: "notComputed",
	},
	{
		id: "pension",
		group: "pension",
		kind: "pension",
		indexers: [],
		valuation: () => "typed",
		fields: ["name", "amount", "since"],
		required: ["name", "amount"],
		quantityPlaces: 2,
		tax: "notComputed",
	},
	{
		id: "other",
		group: "other",
		kind: "other",
		indexers: [],
		valuation: () => "typed",
		fields: ["name", "amount", "since"],
		required: ["name", "amount"],
		quantityPlaces: 2,
		tax: "notComputed",
	},
];

export function productOf(id: string): Product | null {
	return PRODUCTS.find((product) => product.id === id) ?? null;
}

/**
 * The product a holding from before 2.0.0 is read as: the generic one of its kind, which values
 * it the way it was valued then, quantity times the price typed.
 */
export function genericProductOf(kind: HoldingKindOfProduct): Product {
	const id: ProductId =
		kind === "fund"
			? "fund"
			: kind === "stock"
				? "stock"
				: kind === "crypto"
					? "crypto"
					: kind === "pension"
						? "pension"
						: "other";
	const product = productOf(id) as Product;
	// Valued as it always was: by the price typed, whatever the generic product does now.
	return { ...product, kind, valuation: () => "price" };
}

/** The product of a holding, what it was written down as, or the generic one of its kind. */
export function productOfHolding(holding: {
	product: string | null;
	kind: HoldingKindOfProduct;
}): Product {
	return (holding.product ? productOf(holding.product) : null) ?? genericProductOf(holding.kind);
}
