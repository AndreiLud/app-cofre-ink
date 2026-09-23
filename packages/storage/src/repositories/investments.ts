// What is owned, and what it is worth today.
//
// The price is typed in by a person, so the only interesting question here is what to
// do when they type a new one. The answer is to keep the old one: a portfolio with a
// line is worth having, and a price corrected in place loses the month it was right
// for. So every price is written down, and the current one is the newest of them.

import { type CalendarDate, parseCalendarDate, uuidV7 } from "@cofre/core";
import { holdingPrices, holdings } from "@cofre/db";
import { assertCan } from "../actor.ts";
import { asNumber, type SqlValue } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import {
	type Holding,
	type HoldingKind,
	type HoldingPrice,
	toHolding,
	toHoldingPrice,
} from "../models.ts";
import { insertRow, softDeleteRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

const SELECT = `SELECT "id", "space_id", "account_id", "name", "kind", "ticker", "quantity",
	"unit_price", "currency", "cost", "bought_on", "priced_on", "notes", "created_by",
	"created_at", "updated_at"
	FROM "holdings"`;

/** Quantities are scaled by ten to the eighth, so a fund can have fractions of a unit. */
export const QUANTITY_SCALE = 100_000_000;

export type CreateHoldingInput = {
	spaceId: string;
	accountId: string;
	name: string;
	kind: HoldingKind;
	/** Scaled by ten to the eighth. One share is 100000000. */
	quantity: number;
	/** Minor units for one unit. */
	unitPrice: number;
	ticker?: string | null;
	currency?: string;
	/** What was paid in total, in minor units. Left out, it is what it is worth now. */
	cost?: number;
	boughtOn?: CalendarDate | null;
	notes?: string | null;
};

export type UpdateHoldingInput = {
	name?: string;
	ticker?: string | null;
	quantity?: number;
	cost?: number;
	notes?: string | null;
};

/** What a holding is worth, and how that compares with what it cost. */
export type HoldingValue = Holding & {
	/** Quantity times price, in minor units. */
	value: number;
	/** Value less cost. Negative is a loss, and is shown as one. */
	gain: number;
	/** Hundredths of a percent, so ten per cent is 1000. */
	gainPercent: number;
};

export function worthOf(holding: Holding): number {
	return Math.round((holding.quantity * holding.unitPrice) / QUANTITY_SCALE);
}

function withValue(holding: Holding): HoldingValue {
	const value = worthOf(holding);
	const gain = value - holding.cost;
	return {
		...holding,
		value,
		gain,
		gainPercent: holding.cost === 0 ? 0 : Math.round((gain / holding.cost) * 10_000),
	};
}

export function createInvestmentsRepository(context: RepositoryContext) {
	async function reachable(id: string): Promise<Holding> {
		const rows = await context.driver.all(`${SELECT} WHERE "id" = ? AND "deleted_at" IS NULL`, [
			id,
		]);
		const first = rows[0];
		if (!first) throw new NotFoundError("holding", id);
		return toHolding(first);
	}

	async function accountIn(spaceId: string, accountId: string): Promise<void> {
		const rows = await context.driver.all(
			`SELECT "id" FROM "accounts" WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL`,
			[accountId, spaceId],
		);
		if (rows.length === 0) throw new NotFoundError("account", accountId);
	}

	function assertAmounts(input: { quantity?: number; unitPrice?: number; cost?: number }): void {
		for (const [what, value] of Object.entries(input)) {
			if (value === undefined) continue;
			if (!Number.isSafeInteger(value) || value < 0) {
				throw new RuleError(
					"amountIsPositiveInteger",
					`${what} is a whole number of the smallest unit, and is never negative`,
				);
			}
		}
	}

	return {
		async list(spaceId: string): Promise<HoldingValue[]> {
			assertCan(context.actor(), spaceId, "investment.read");
			const rows = await context.driver.all(
				`${SELECT} WHERE "space_id" = ? AND "deleted_at" IS NULL ORDER BY "name"`,
				[spaceId],
			);
			return rows.map(toHolding).map(withValue);
		},

		async get(id: string): Promise<HoldingValue> {
			const holding = await reachable(id);
			assertCan(context.actor(), holding.spaceId, "investment.read");
			return withValue(holding);
		},

		async create(input: CreateHoldingInput): Promise<HoldingValue> {
			assertCan(context.actor(), input.spaceId, "investment.write");
			await accountIn(input.spaceId, input.accountId);

			if (input.name.trim() === "") {
				throw new RuleError("nameIsRequired", "a holding needs a name to be found later");
			}
			assertAmounts({
				quantity: input.quantity,
				unitPrice: input.unitPrice,
				cost: input.cost,
			});
			if (input.boughtOn) parseCalendarDate(input.boughtOn);

			const value = Math.round((input.quantity * input.unitPrice) / QUANTITY_SCALE);
			const today = new Date(context.now()).toISOString().slice(0, 10);

			const id = await insertRow(context.write(), {
				table: holdings,
				spaceId: input.spaceId,
				values: {
					account_id: input.accountId,
					name: input.name.trim(),
					kind: input.kind,
					ticker: input.ticker ?? null,
					quantity: input.quantity,
					unit_price: input.unitPrice,
					currency: input.currency ?? "BRL",
					// What it cost is what it is worth now, until somebody says otherwise.
					cost: input.cost ?? value,
					bought_on: input.boughtOn ?? null,
					priced_on: today,
					notes: input.notes ?? null,
					created_by: context.actor().userId,
				},
			});

			return withValue(await reachable(id));
		},

		async update(id: string, input: UpdateHoldingInput): Promise<HoldingValue> {
			const holding = await reachable(id);
			assertCan(context.actor(), holding.spaceId, "investment.write");
			assertAmounts({ quantity: input.quantity, cost: input.cost });

			const values: Record<string, SqlValue> = {};
			if (input.name !== undefined) values.name = input.name.trim();
			if (input.ticker !== undefined) values.ticker = input.ticker;
			if (input.quantity !== undefined) values.quantity = input.quantity;
			if (input.cost !== undefined) values.cost = input.cost;
			if (input.notes !== undefined) values.notes = input.notes;

			await updateRow(context.write(), {
				table: holdings,
				spaceId: holding.spaceId,
				id,
				values,
			});
			return withValue(await reachable(id));
		},

		/**
		 * A new price, on a day. The old one is kept, because a portfolio without a line
		 * is a number with no way of telling whether it is going anywhere.
		 */
		async price(input: {
			id: string;
			unitPrice: number;
			onDay?: CalendarDate;
		}): Promise<HoldingValue> {
			const holding = await reachable(input.id);
			assertCan(context.actor(), holding.spaceId, "investment.write");
			assertAmounts({ unitPrice: input.unitPrice });

			const day =
				input.onDay ?? (new Date(context.now()).toISOString().slice(0, 10) as CalendarDate);
			parseCalendarDate(day);

			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };

				await insertRow(write, {
					table: holdingPrices,
					spaceId: holding.spaceId,
					values: {
						holding_id: holding.id,
						on_day: day,
						unit_price: input.unitPrice,
						created_by: context.actor().userId,
					},
				});

				await updateRow(write, {
					table: holdings,
					spaceId: holding.spaceId,
					id: holding.id,
					values: { unit_price: input.unitPrice, priced_on: day },
				});
			});

			return withValue(await reachable(input.id));
		},

		/** Every price ever typed for one holding, oldest first. */
		async prices(id: string): Promise<HoldingPrice[]> {
			const holding = await reachable(id);
			assertCan(context.actor(), holding.spaceId, "investment.read");

			const rows = await context.driver.all(
				`SELECT "id", "space_id", "holding_id", "on_day", "unit_price", "created_by",
				        "created_at", "updated_at"
				 FROM "holding_prices" WHERE "holding_id" = ? AND "deleted_at" IS NULL
				 ORDER BY "on_day", "created_at"`,
				[id],
			);
			return rows.map(toHoldingPrice);
		},

		async remove(id: string): Promise<void> {
			const holding = await reachable(id);
			assertCan(context.actor(), holding.spaceId, "investment.write");
			await softDeleteRow(context.write(), {
				table: holdings,
				spaceId: holding.spaceId,
				id,
			});
		},

		/** What the whole portfolio is worth, and what it cost, for the headline. */
		async total(spaceId: string): Promise<{ value: number; cost: number; gain: number }> {
			assertCan(context.actor(), spaceId, "investment.read");
			const rows = await context.driver.all(
				`SELECT "quantity", "unit_price", "cost" FROM "holdings"
				 WHERE "space_id" = ? AND "deleted_at" IS NULL`,
				[spaceId],
			);

			let value = 0;
			let cost = 0;
			for (const row of rows) {
				value += Math.round((asNumber(row.quantity) * asNumber(row.unit_price)) / QUANTITY_SCALE);
				cost += asNumber(row.cost);
			}

			return { value, cost, gain: value - cost };
		},
	};
}

export type InvestmentsRepository = ReturnType<typeof createInvestmentsRepository>;

/** A generated identifier, for the callers that need one before they write. */
export const newHoldingId = uuidV7;
