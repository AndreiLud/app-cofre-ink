// What every screen that shows a holding needs to say about it the same way.
//
// The holdings were read under two keys, ["holdings", space] on Investments and
// ["investments", space] on the overview and on Accounts, so putting money into a caixinha
// refreshed one screen and left the other two on the old value. There is one key now, and a
// change to a holding refreshes it with every reading made from records, because a holding
// that moves money writes a record too.

import { type Product, productOfHolding } from "@cofre/core";
import type { HoldingValue } from "@cofre/storage";
import type { QueryClient } from "@tanstack/react-query";
import { afterRecordsChange } from "./afterRecords.ts";
import { readQuantity } from "./amounts.ts";

/** The first part of the key every reading of holdings is made under. */
export const HOLDINGS = "holdings";

/** After a holding, a price or a movement changed: the holdings and what records feed. */
export function afterHoldingsChange(queries: QueryClient): void {
	void queries.invalidateQueries({ queryKey: [HOLDINGS] });
	afterRecordsChange(queries);
}

type HoldingLike = Pick<HoldingValue, "product" | "kind" | "indexer">;

export function productOf(holding: HoldingLike): Product {
	return productOfHolding({ product: holding.product, kind: holding.kind });
}

/** Counted in units bought and sold at a price, rather than by a value put in and taken out. */
export function inUnits(holding: HoldingLike): boolean {
	return productOf(holding).valuation(holding.indexer as never) === "price";
}

/**
 * Whether a holding pays income of its own: a share, a property fund, a fund, a bond of the
 * Tesouro that pays a coupon, and anything from before 2.0.0, which could be any of these. A
 * caixinha or a CDB grows instead, and money left at a broker pays nothing.
 */
export function paysIncome(holding: HoldingLike): boolean {
	if (holding.product === null) return true;
	const product = productOf(holding);
	return (
		product.group === "exchange" ||
		product.group === "fund" ||
		product.id === "treasuryIpca" ||
		product.id === "treasuryFixed"
	);
}

/**
 * Units as typed, to as many places as the product counts, scaled by ten to the eighth like
 * every quantity: a share is whole, so "1,5" of one is not read as a share and a half.
 */
export function readUnits(text: string, places: number): number {
	return readQuantity(text, places) * 10 ** (8 - places);
}

/** A calendar day as the language on screen writes it, with its year. */
export function shortDay(day: string, language: string | undefined): string {
	return new Intl.DateTimeFormat(language === "en" ? "en" : "pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(`${day}T00:00:00Z`));
}

function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * The oldest day an estimate of these holdings stops at, when it stops more than three days
 * before today: the overview and Accounts say "calculado até" only then, because a figure that
 * is a weekend behind is the figure the bank shows too.
 */
export function estimateBehind(
	holdings: readonly Pick<HoldingValue, "estimated" | "estimatedThrough">[],
	today: string,
): string | null {
	const days = holdings
		.filter((one) => one.estimated && one.estimatedThrough !== null)
		.map((one) => one.estimatedThrough as string)
		.sort();
	const oldest = days[0];
	if (oldest === undefined) return null;
	return daysBetween(oldest, today) > 3 ? oldest : null;
}
