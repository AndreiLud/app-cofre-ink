// What is owned, what it is worth today, and the money that moved with it.
//
// A holding is a product of the catalog in packages/core: what it is decides how its value is
// known, from a price typed, a value typed, or an index the Banco Central publishes, and what it
// is worth is always worked out there, by valueOfHolding, and never here. What is kept here is
// what it was opened with, every price or value typed, with the old ones kept so a portfolio has
// a line, and every movement after the opening: money put in, money taken out, income paid.
//
// A movement that came from an account, or went to one, writes the record that moved the money
// in the same write, and that record is changed and removed with the movement and nowhere else.

import {
	type CalendarDate,
	QUANTITY_SCALE as CORE_QUANTITY_SCALE,
	type DailySeries,
	estimateByIndex,
	type HoldingFacts,
	type HoldingMoveFact,
	type IndexDay,
	movementsOf,
	netIfTakenOut,
	parseCalendarDate,
	productOf,
	productOfHolding,
	type TypedPrice,
	todayIn,
	uuidV7,
	valueOfHolding,
} from "@cofre/core";
import { holdingMoves, holdingPrices, holdings, transactions } from "@cofre/db";
import { assertCan, seesOwnRowsOnly } from "../actor.ts";
import { asNumber, type SqlValue } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import {
	type Holding,
	type HoldingKind,
	type HoldingMove,
	type HoldingMoveKind,
	type HoldingPrice,
	toHolding,
	toHoldingMove,
	toHoldingPrice,
} from "../models.ts";
import { insertRow, softDeleteRow, updateRow, type WriteContext } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

const SELECT = `SELECT "id", "space_id", "account_id", "name", "kind", "ticker", "quantity",
	"unit_price", "currency", "cost", "bought_on", "priced_on", "notes", "product", "issuer",
	"matures_on", "liquid_from", "anniversary_day", "indexer", "liquidity", "rate", "created_by",
	"created_at", "updated_at"
	FROM "holdings"`;

const MOVE_SELECT = `SELECT "id", "space_id", "holding_id", "on_day", "kind", "amount", "quantity",
	"transaction_id", "created_by", "created_at", "updated_at"
	FROM "holding_moves"`;

/** Quantities are scaled by ten to the eighth, so a fund can have fractions of a unit. */
export const QUANTITY_SCALE = CORE_QUANTITY_SCALE;

/** The fields of a product a holding may carry. */
export type HoldingProductInput = {
	/** The product of the catalog in packages/core. */
	product?: string | null;
	issuer?: string | null;
	maturesOn?: CalendarDate | null;
	liquidFrom?: CalendarDate | null;
	anniversaryDay?: number | null;
	indexer?: string | null;
	liquidity?: string | null;
	/** Hundredths of a percentage point: 100% of the CDI is 10000, 12% a year is 1200. */
	rate?: number | null;
};

export type CreateHoldingInput = HoldingProductInput & {
	spaceId: string;
	accountId: string;
	name: string;
	/** Read from the product when there is one. */
	kind?: HoldingKind;
	/**
	 * Scaled by ten to the eighth. One share is 100000000. A product counted by value is one
	 * unit whose price is the whole of it.
	 */
	quantity: number;
	/** Minor units for one unit. */
	unitPrice: number;
	ticker?: string | null;
	currency?: string;
	/** What was paid in total, in minor units. Left out, it is what it is worth now. */
	cost?: number;
	boughtOn?: CalendarDate | null;
	notes?: string | null;
	/**
	 * The account the money came from. The opening is then a movement in, with the record that
	 * moved the money from that account, written in the same write. Without it, the holding was
	 * already somebody's, and nothing moved.
	 */
	fromAccountId?: string | null;
	/**
	 * The first holding of an account that has a balance: that balance is kept as the product
	 * "Saldo na conta", which earns nothing, so the account goes on being worth it. The screen
	 * asks, with this ticked.
	 */
	keepBalanceAsCash?: boolean;
};

export type UpdateHoldingInput = HoldingProductInput & {
	name?: string;
	ticker?: string | null;
	/** What it was opened with. Movements are changed by themselves. */
	quantity?: number;
	cost?: number;
	notes?: string | null;
	/** Another investment account of the same space. */
	accountId?: string;
};

export type HoldingMoveInput = {
	holdingId: string;
	kind: HoldingMoveKind;
	onDay: CalendarDate;
	/** What went into the holding or left it, or what it paid, in minor units. */
	amount: number;
	/** Units bought or sold, scaled, for a holding counted in units. */
	quantity?: number | null;
	/** The price of one unit on the day of a purchase or a sale, which is kept as that day's. */
	unitPrice?: number | null;
	/** The account the money came from, or went to, in the same space. */
	accountId?: string | null;
	/**
	 * What reached the account when money came out, after the tax the bank took: the movement
	 * keeps what left, the record what arrived, and the difference is the tax.
	 */
	arrived?: number | null;
};

/** What a holding is worth, and how that compares with what went into it. */
export type HoldingValue = Holding & {
	/** Gross, in minor units, on the day it was read for. */
	value: number;
	/** Value less what went in, net of what came out. Negative is a loss. */
	gain: number;
	/** Hundredths of a percent, so ten per cent is 1000. */
	gainPercent: number;
	/** The units held, the opening and every movement, scaled. */
	quantityNow: number;
	/** What went in, less what came out. */
	invested: number;
	/** Whether the value is an estimate from an index. */
	estimated: boolean;
	/** For an estimate, the last day whose rate is in it. */
	estimatedThrough: string | null;
	/**
	 * What would be left if it were all taken out on the day: the income tax and the IOF. Null
	 * when the product's tax is not worked out, or when the days of the deposits are not known.
	 */
	net: { net: number; incomeTax: number; iof: number } | null;
	/** The product does not pay income tax on what it earns. */
	exempt: boolean;
	/**
	 * What the same money would be worth at 100% of the CDI, each deposit from its own day and
	 * each withdrawal on its own. Null when the day of the opening is not known, as for every
	 * holding written down before 2.0.0, which the comparison lists apart.
	 */
	atTheCdi: number | null;
};

/** What deleting a movement or a holding gives back to each account, said before it is deleted. */
export type GoingBack = { accountId: string; amount: number }[];

export function createInvestmentsRepository(context: RepositoryContext) {
	async function reachable(id: string): Promise<Holding> {
		const rows = await context.driver.all(`${SELECT} WHERE "id" = ? AND "deleted_at" IS NULL`, [
			id,
		]);
		const first = rows[0];
		if (!first) throw new NotFoundError("holding", id);
		return toHolding(first);
	}

	async function accountOf(spaceId: string, accountId: string): Promise<{ kind: string }> {
		const rows = await context.driver.all(
			`SELECT "kind" FROM "accounts" WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL`,
			[accountId, spaceId],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("account", accountId);
		return { kind: String(first.kind) };
	}

	/** A new holding lives in an investment account, which is what it is worth. */
	async function investmentAccount(spaceId: string, accountId: string): Promise<void> {
		if ((await accountOf(spaceId, accountId)).kind !== "investment") {
			throw new RuleError(
				"holdingNeedsAnInvestmentAccount",
				"a holding lives in an investment account, so pick one or create one",
			);
		}
	}

	/** Money moves to or from an account that holds money, and never a card or an allowance. */
	async function moneyAccount(spaceId: string, accountId: string): Promise<void> {
		const { kind } = await accountOf(spaceId, accountId);
		if (kind === "credit" || kind === "voucher" || kind === "investment") {
			throw new RuleError(
				"holdingMovesWithMoney",
				"money goes into a holding from an account that holds money, and comes back to one",
			);
		}
	}

	/**
	 * Every amount is a whole number of the smallest unit and more than nothing, except the ones
	 * that may be nothing: the cost, which is optional, and what a movement carries instead.
	 */
	function assertAmounts(
		input: Record<string, number | undefined>,
		mayBeNothing: readonly string[] = ["cost"],
	): void {
		for (const [what, value] of Object.entries(input)) {
			if (value === undefined) continue;
			if (
				!Number.isSafeInteger(value) ||
				value < 0 ||
				(value === 0 && !mayBeNothing.includes(what))
			) {
				throw new RuleError(
					"amountIsPositiveInteger",
					`${what} is a whole number of the smallest unit, and is more than nothing`,
				);
			}
		}
	}

	async function timezoneOf(spaceId: string): Promise<string> {
		const rows = await context.driver.all(
			`SELECT "timezone" FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
			[spaceId],
		);
		return String(rows[0]?.timezone ?? "America/Sao_Paulo");
	}

	async function todayOf(spaceId: string): Promise<CalendarDate> {
		return todayIn(await timezoneOf(spaceId), new Date(context.now()));
	}

	async function spaceCurrencyOf(spaceId: string, driver = context.driver): Promise<string> {
		const rows = await driver.all(
			`SELECT "base_currency" FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
			[spaceId],
		);
		return String(rows[0]?.base_currency ?? "BRL");
	}

	/** The daily series, from the table every space shares. */
	async function dailySeries(): Promise<DailySeries> {
		const rows = await context.driver.all(
			`SELECT "series", "day", "rate" FROM "index_days" ORDER BY "day"`,
		);
		const of = (series: string): IndexDay[] =>
			rows
				.filter((row) => String(row.series) === series)
				.map((row) => ({ day: String(row.day), rate: asNumber(row.rate) }));
		return { cdiDaily: of("cdiDaily"), selicDaily: of("selicDaily"), savings: of("savings") };
	}

	async function pricesBySpace(spaceId: string): Promise<Map<string, TypedPrice[]>> {
		const rows = await context.driver.all(
			`SELECT "holding_id", "on_day", "unit_price", "created_at" FROM "holding_prices"
			 WHERE "space_id" = ? AND "deleted_at" IS NULL
			 ORDER BY "on_day", "created_at"`,
			[spaceId],
		);
		const found = new Map<string, TypedPrice[]>();
		for (const row of rows) {
			const id = String(row.holding_id);
			found.set(id, [
				...(found.get(id) ?? []),
				{
					day: String(row.on_day),
					unitPrice: asNumber(row.unit_price),
					writtenAt: asNumber(row.created_at),
				},
			]);
		}
		return found;
	}

	async function movesBySpace(spaceId: string): Promise<Map<string, HoldingMoveFact[]>> {
		const rows = await context.driver.all(
			`SELECT "holding_id", "on_day", "kind", "amount", "quantity", "created_at" FROM "holding_moves"
			 WHERE "space_id" = ? AND "deleted_at" IS NULL
			 ORDER BY "on_day", "created_at"`,
			[spaceId],
		);
		const found = new Map<string, HoldingMoveFact[]>();
		for (const row of rows) {
			const id = String(row.holding_id);
			found.set(id, [
				...(found.get(id) ?? []),
				{
					day: String(row.on_day),
					kind: String(row.kind) as HoldingMoveFact["kind"],
					amount: asNumber(row.amount),
					quantity: row.quantity === null ? null : asNumber(row.quantity),
					writtenAt: asNumber(row.created_at),
				},
			]);
		}
		return found;
	}

	/**
	 * What one holding is worth on a day, through the one reading in packages/core.
	 *
	 * Read for a day that has gone, a holding counted in units with no price that early takes
	 * the earliest it has, and its `pricedOn`, later than the day, is how a reader tells.
	 */
	function withValue(
		holding: Holding,
		line: readonly TypedPrice[],
		moves: readonly HoldingMoveFact[],
		series: DailySeries,
		on: CalendarDate,
		writtenOn: CalendarDate,
	): HoldingValue {
		const product = productOfHolding({ product: holding.product, kind: holding.kind });
		const upTo = line.filter((price) => price.day <= on);
		const shown = upTo.at(-1) ?? line[0] ?? null;
		const countedInUnits = product.valuation(holding.indexer as never) === "price";
		const facts: HoldingFacts = {
			product,
			indexer: (holding.indexer as HoldingFacts["indexer"]) ?? null,
			rate: holding.rate,
			quantity: holding.quantity,
			unitPrice: countedInUnits && shown ? shown.unitPrice : holding.unitPrice,
			cost: holding.cost,
			boughtOn: holding.boughtOn,
			writtenOn,
			maturesOn: holding.maturesOn,
			anniversaryDay: holding.anniversaryDay,
		};
		const worth = valueOfHolding({ facts, prices: upTo, moves, series, on });
		const gain = worth.value - worth.invested;

		// The deposits with their days, for the tax on taking it out: the opening, when its day is
		// known, and every movement. Without a day for the opening there is nothing to work from.
		const deposits = movementsOf(moves, on);
		const openingKnown = holding.cost === 0 || holding.boughtOn !== null;
		if (holding.boughtOn !== null && holding.cost > 0) {
			deposits.push({ day: holding.boughtOn, amount: holding.cost });
		}
		const net =
			product.tax === "regressive" && !openingKnown
				? null
				: netIfTakenOut({ taxation: product.tax, moves: deposits, value: worth.value, on });

		const atTheCdi = openingKnown
			? estimateByIndex({
					indexer: "cdi",
					rate: 10_000,
					from: null,
					moves: deposits,
					until: on,
					days: series.cdiDaily,
				}).value
			: null;

		return {
			...holding,
			unitPrice: shown?.unitPrice ?? holding.unitPrice,
			pricedOn: shown?.day ?? holding.pricedOn,
			atTheCdi,
			value: worth.value,
			gain,
			gainPercent: worth.invested <= 0 ? 0 : Math.round((gain / worth.invested) * 10_000),
			quantityNow: worth.quantity,
			invested: worth.invested,
			estimated: worth.estimated,
			estimatedThrough: worth.estimatedThrough,
			net,
			exempt: product.tax === "exempt",
		};
	}

	async function valued(
		spaceId: string,
		chosen: readonly Holding[],
		on: CalendarDate,
	): Promise<HoldingValue[]> {
		const [prices, moves, series, zone] = await Promise.all([
			pricesBySpace(spaceId),
			movesBySpace(spaceId),
			dailySeries(),
			timezoneOf(spaceId),
		]);
		return chosen.map((holding) =>
			withValue(
				holding,
				prices.get(holding.id) ?? [],
				moves.get(holding.id) ?? [],
				series,
				on,
				todayIn(zone, new Date(holding.createdAt)),
			),
		);
	}

	/** Writes the record of money moving between an account and the account of a holding. */
	async function moveMoney(
		write: WriteContext,
		holding: Holding,
		input: { from: string; to: string; amount: number; onDay: CalendarDate },
	): Promise<string> {
		// Through the write: inside a transaction every read goes through it.
		const currency = await spaceCurrencyOf(holding.spaceId, write.driver);
		return insertRow(write, {
			table: transactions,
			spaceId: holding.spaceId,
			values: {
				kind: "transfer",
				// A fact, held back by its day when the day is ahead.
				status: "settled",
				amount: input.amount,
				currency,
				fx_rate: null,
				amount_in_base: input.amount,
				happened_on: input.onDay,
				description: holding.name,
				account_id: input.from,
				counter_account_id: input.to,
				notes: null,
				reconciled_at: null,
				installment_group: null,
				installment_number: null,
				installment_count: null,
				invoice_month: null,
				category_id: null,
				priority: null,
				card_id: null,
				created_by: context.actor().userId,
			},
		});
	}

	/** The income a holding paid, as money in on an account, under the category of income. */
	async function incomeRecord(
		write: WriteContext,
		holding: Holding,
		input: { accountId: string; amount: number; onDay: CalendarDate },
	): Promise<string> {
		const currency = await spaceCurrencyOf(holding.spaceId, write.driver);
		const category = await write.driver.all(
			`SELECT "id" FROM "categories"
			 WHERE "space_id" = ? AND "kind" = 'income' AND "deleted_at" IS NULL
			   AND "name" IN ('Rendimentos', 'Investment income')
			 LIMIT 1`,
			[holding.spaceId],
		);
		return insertRow(write, {
			table: transactions,
			spaceId: holding.spaceId,
			values: {
				kind: "income",
				status: "settled",
				amount: input.amount,
				currency,
				fx_rate: null,
				amount_in_base: input.amount,
				happened_on: input.onDay,
				description: holding.name,
				account_id: input.accountId,
				counter_account_id: null,
				notes: null,
				reconciled_at: null,
				installment_group: null,
				installment_number: null,
				installment_count: null,
				invoice_month: null,
				category_id: category[0] ? String(category[0].id) : null,
				priority: null,
				card_id: null,
				created_by: context.actor().userId,
			},
		});
	}

	async function writeMove(
		write: WriteContext,
		holding: Holding,
		input: {
			kind: HoldingMoveKind;
			onDay: CalendarDate;
			amount: number;
			quantity: number | null;
			transactionId: string | null;
		},
	): Promise<string> {
		return insertRow(write, {
			table: holdingMoves,
			spaceId: holding.spaceId,
			values: {
				holding_id: holding.id,
				on_day: input.onDay,
				kind: input.kind,
				amount: input.amount,
				quantity: input.quantity,
				transaction_id: input.transactionId,
				created_by: context.actor().userId,
			},
		});
	}

	async function writePrice(
		write: WriteContext,
		holding: Holding,
		day: CalendarDate,
		unitPrice: number,
	): Promise<void> {
		await insertRow(write, {
			table: holdingPrices,
			spaceId: holding.spaceId,
			values: {
				holding_id: holding.id,
				on_day: day,
				unit_price: unitPrice,
				created_by: context.actor().userId,
			},
		});
		// The price of the holding is the newest one. A day older than the one it carries goes
		// into the line and does not replace it (part 2, H.9.2 of 2.0.0).
		if (holding.pricedOn === null || holding.pricedOn <= day) {
			await updateRow(write, {
				table: holdings,
				spaceId: holding.spaceId,
				id: holding.id,
				values: { unit_price: unitPrice, priced_on: day },
			});
		}
	}

	/** The movements of a holding, or one movement, each with the record it wrote. */
	async function movesOf(where: { holdingId?: string; moveId?: string }): Promise<HoldingMove[]> {
		const rows = await context.driver.all(
			where.moveId
				? `${MOVE_SELECT} WHERE "id" = ? AND "deleted_at" IS NULL`
				: `${MOVE_SELECT} WHERE "holding_id" = ? AND "deleted_at" IS NULL ORDER BY "on_day", "created_at"`,
			[where.moveId ?? where.holdingId ?? ""],
		);
		return rows.map(toHoldingMove);
	}

	/** What the records of these movements gave or took from each account, to give back. */
	async function goingBackFrom(moves: readonly HoldingMove[]): Promise<GoingBack> {
		const linked = moves.map((move) => move.transactionId).filter((id): id is string => !!id);
		if (linked.length === 0) return [];
		const rows = await context.driver.all(
			`SELECT "kind", "amount", "account_id", "counter_account_id" FROM "transactions"
			 WHERE "id" IN (${linked.map(() => "?").join(", ")}) AND "deleted_at" IS NULL`,
			linked,
		);
		const by = new Map<string, number>();
		const add = (accountId: string, amount: number) =>
			by.set(accountId, (by.get(accountId) ?? 0) + amount);
		for (const row of rows) {
			const amount = asNumber(row.amount);
			if (String(row.kind) === "income") {
				// The income leaves the account it landed in.
				add(String(row.account_id), -amount);
				continue;
			}
			// A move: what left one account goes back to it, and leaves the other.
			add(String(row.account_id), amount);
			if (row.counter_account_id !== null) add(String(row.counter_account_id), -amount);
		}
		return [...by.entries()].map(([accountId, amount]) => ({ accountId, amount }));
	}

	async function dropMoves(write: WriteContext, holding: Holding, moves: readonly HoldingMove[]) {
		for (const move of moves) {
			if (move.transactionId) {
				await softDeleteRow(write, {
					table: transactions,
					spaceId: holding.spaceId,
					id: move.transactionId,
				});
			}
			await softDeleteRow(write, { table: holdingMoves, spaceId: holding.spaceId, id: move.id });
		}
	}

	async function getValued(id: string): Promise<HoldingValue> {
		const holding = await reachable(id);
		assertCan(context.actor(), holding.spaceId, "investment.read");
		const [one] = await valued(holding.spaceId, [holding], await todayOf(holding.spaceId));
		return one as HoldingValue;
	}

	return {
		/**
		 * What is owned, worth what it is worth today, or with `onDay` as it stood on a day that
		 * has gone: what was owned by then, at the prices and the indices of that day.
		 */
		async list(spaceId: string, options: { onDay?: CalendarDate } = {}): Promise<HoldingValue[]> {
			assertCan(context.actor(), spaceId, "investment.read");
			const rows = await context.driver.all(
				`${SELECT} WHERE "space_id" = ? AND "deleted_at" IS NULL ORDER BY "name"`,
				[spaceId],
			);
			const all = rows.map(toHolding);
			if (options.onDay === undefined) return valued(spaceId, all, await todayOf(spaceId));
			parseCalendarDate(options.onDay);
			const zone = await timezoneOf(spaceId);
			const day = options.onDay;
			const owned = all.filter((holding) =>
				holding.boughtOn !== null
					? holding.boughtOn <= day
					: todayIn(zone, new Date(holding.createdAt)) <= day,
			);
			return valued(spaceId, owned, day);
		},

		get: getValued,

		async create(input: CreateHoldingInput): Promise<HoldingValue> {
			assertCan(context.actor(), input.spaceId, "investment.write");
			await investmentAccount(input.spaceId, input.accountId);
			if (input.fromAccountId) {
				assertCan(context.actor(), input.spaceId, "transaction.create");
				await moneyAccount(input.spaceId, input.fromAccountId);
			}

			const product = input.product ? productOf(input.product) : null;
			if (input.product && !product) {
				throw new RuleError("unknownProduct", "that is not a product this application knows");
			}
			const kind = product?.kind ?? input.kind;
			if (!kind) throw new RuleError("unknownProduct", "a holding is one product or one kind");
			const name = (input.name ?? "").trim() || (input.ticker ?? "").trim();
			if (name === "") {
				throw new RuleError("nameIsRequired", "a holding needs a name to be found later");
			}
			assertAmounts({ quantity: input.quantity, unitPrice: input.unitPrice, cost: input.cost });
			if (input.boughtOn) parseCalendarDate(input.boughtOn);
			if (input.maturesOn) parseCalendarDate(input.maturesOn);

			const today = await todayOf(input.spaceId);
			const value = Math.round((input.quantity * input.unitPrice) / QUANTITY_SCALE);
			const spaceCurrency = await spaceCurrencyOf(input.spaceId);
			const indexer = input.indexer ?? product?.indexers[0] ?? null;
			const valuation = product?.valuation(indexer as never) ?? "price";
			// Put in on a day that is known, for a product that follows an index: the estimate
			// grows it from that day. Otherwise the value written down today is where it starts.
			const deposited = valuation === "index" && !!input.boughtOn;
			const moved = !!input.fromAccountId;
			const inUnits = valuation === "price";

			const id = await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };

				// The balance of an investment account with no holding yet, kept as what it is: money
				// left at the broker. The account goes on being worth it once it has holdings.
				if (input.keepBalanceAsCash) {
					const existing = await tx.all(
						`SELECT "id" FROM "holdings" WHERE "account_id" = ? AND "deleted_at" IS NULL LIMIT 1`,
						[input.accountId],
					);
					const balance = await tx.all(
						`SELECT a."initial_balance" + COALESCE((
						   SELECT SUM(CASE
						            WHEN t."kind" = 'transfer' AND t."account_id" = a."id" THEN -t."amount"
						            WHEN t."kind" = 'transfer' THEN t."amount"
						            ELSE t."amount" END)
						   FROM "transactions" t
						   WHERE (t."account_id" = a."id" OR t."counter_account_id" = a."id")
						     AND t."deleted_at" IS NULL AND t."happened_on" <= ?), 0) AS "balance"
						 FROM "accounts" a WHERE a."id" = ?`,
						[today, input.accountId],
					);
					const cash = asNumber(balance[0]?.balance ?? 0);
					if (existing.length === 0 && cash > 0) {
						const kept = await insertRow(write, {
							table: holdings,
							spaceId: input.spaceId,
							values: {
								account_id: input.accountId,
								name: "Saldo na conta",
								kind: "other",
								product: "brokerCash",
								ticker: null,
								quantity: QUANTITY_SCALE,
								unit_price: cash,
								currency: spaceCurrency,
								cost: cash,
								bought_on: null,
								priced_on: today,
								notes: null,
								created_by: context.actor().userId,
							},
						});
						await insertRow(write, {
							table: holdingPrices,
							spaceId: input.spaceId,
							values: {
								holding_id: kept,
								on_day: today,
								unit_price: cash,
								created_by: context.actor().userId,
							},
						});
					}
				}

				const made = await insertRow(write, {
					table: holdings,
					spaceId: input.spaceId,
					values: {
						account_id: input.accountId,
						name,
						kind,
						ticker: input.ticker ?? null,
						// When the money came from an account, the movement carries it and the
						// opening is nothing: no units for a holding counted in units, and no value
						// for one counted by value.
						quantity: moved && inUnits ? 0 : input.quantity,
						unit_price: moved && !inUnits ? 0 : input.unitPrice,
						currency: input.currency ?? spaceCurrency,
						cost: moved ? 0 : (input.cost ?? value),
						bought_on: input.boughtOn ?? null,
						priced_on: deposited || (moved && !inUnits) ? null : (input.boughtOn ?? today),
						notes: input.notes ?? null,
						product: product?.id ?? null,
						issuer: input.issuer ?? null,
						matures_on: input.maturesOn ?? null,
						liquid_from: input.liquidFrom ?? null,
						anniversary_day: input.anniversaryDay ?? null,
						indexer,
						liquidity: input.liquidity ?? null,
						rate: input.rate ?? null,
						created_by: context.actor().userId,
					},
				});
				const holding = toHolding((await tx.all(`${SELECT} WHERE "id" = ?`, [made]))[0] ?? {});

				if (moved && input.fromAccountId) {
					const day = input.boughtOn ?? today;
					const transactionId = await moveMoney(write, holding, {
						from: input.fromAccountId,
						to: input.accountId,
						amount: value,
						onDay: day,
					});
					await writeMove(write, holding, {
						kind: "in",
						onDay: day,
						amount: value,
						quantity: inUnits ? input.quantity : null,
						transactionId,
					});
					if (inUnits) {
						await insertRow(write, {
							table: holdingPrices,
							spaceId: input.spaceId,
							values: {
								holding_id: made,
								on_day: day,
								unit_price: input.unitPrice,
								created_by: context.actor().userId,
							},
						});
					}
				} else if (!deposited) {
					// The price it is written down with is the first of its line, kept like every other.
					await insertRow(write, {
						table: holdingPrices,
						spaceId: input.spaceId,
						values: {
							holding_id: made,
							on_day: today,
							unit_price: input.unitPrice,
							created_by: context.actor().userId,
						},
					});
				}
				return made;
			});

			return getValued(id);
		},

		async update(id: string, input: UpdateHoldingInput): Promise<HoldingValue> {
			const holding = await reachable(id);
			assertCan(context.actor(), holding.spaceId, "investment.write");
			assertAmounts({ quantity: input.quantity, cost: input.cost }, ["cost", "quantity"]);
			if (input.accountId !== undefined) await investmentAccount(holding.spaceId, input.accountId);
			if (input.product !== undefined && input.product !== null && !productOf(input.product)) {
				throw new RuleError("unknownProduct", "that is not a product this application knows");
			}
			if (input.maturesOn) parseCalendarDate(input.maturesOn);

			const values: Record<string, SqlValue> = {};
			if (input.name !== undefined) values.name = input.name.trim();
			if (input.ticker !== undefined) values.ticker = input.ticker;
			if (input.quantity !== undefined) values.quantity = input.quantity;
			if (input.cost !== undefined) values.cost = input.cost;
			if (input.notes !== undefined) values.notes = input.notes;
			if (input.accountId !== undefined) values.account_id = input.accountId;
			if (input.product !== undefined) {
				values.product = input.product;
				const product = input.product ? productOf(input.product) : null;
				if (product) values.kind = product.kind;
			}
			if (input.issuer !== undefined) values.issuer = input.issuer;
			if (input.maturesOn !== undefined) values.matures_on = input.maturesOn;
			if (input.liquidFrom !== undefined) values.liquid_from = input.liquidFrom;
			if (input.anniversaryDay !== undefined) values.anniversary_day = input.anniversaryDay;
			if (input.indexer !== undefined) values.indexer = input.indexer;
			if (input.liquidity !== undefined) values.liquidity = input.liquidity;
			if (input.rate !== undefined) values.rate = input.rate;

			await updateRow(context.write(), { table: holdings, spaceId: holding.spaceId, id, values });
			return getValued(id);
		},

		/**
		 * A price, or a value, on a day. The old one is kept, because a portfolio without a line
		 * is a number with no way of telling whether it is going anywhere, and a day older than
		 * the newest one goes into the line without replacing it.
		 */
		async price(input: {
			id: string;
			unitPrice: number;
			onDay?: CalendarDate;
		}): Promise<HoldingValue> {
			const holding = await reachable(input.id);
			assertCan(context.actor(), holding.spaceId, "investment.write");
			assertAmounts({ unitPrice: input.unitPrice });
			const day = input.onDay ?? (await todayOf(holding.spaceId));
			parseCalendarDate(day);
			await context.driver.transaction(async (tx) => {
				await writePrice({ ...context.write(), driver: tx }, holding, day, input.unitPrice);
			});
			return getValued(input.id);
		},

		/** Every price or value ever typed for one holding, oldest first. */
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

		/**
		 * Money put in, taken out or paid by a holding, with the record that moved it from or to an
		 * account in the same write. A purchase or a sale keeps the price of its day.
		 */
		async move(input: HoldingMoveInput): Promise<HoldingMove> {
			const holding = await reachable(input.holdingId);
			assertCan(context.actor(), holding.spaceId, "investment.write");
			parseCalendarDate(input.onDay);
			assertAmounts({ amount: input.amount }, []);
			if (input.quantity !== undefined && input.quantity !== null) {
				assertAmounts({ quantity: input.quantity }, []);
			}
			if (input.unitPrice !== undefined && input.unitPrice !== null) {
				assertAmounts({ unitPrice: input.unitPrice }, []);
			}
			if (input.accountId) {
				assertCan(context.actor(), holding.spaceId, "transaction.create");
				await moneyAccount(holding.spaceId, input.accountId);
			}
			const arrived = input.arrived ?? input.amount;
			assertAmounts({ arrived }, []);

			const id = await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				let transactionId: string | null = null;
				if (input.accountId && input.kind === "in") {
					transactionId = await moveMoney(write, holding, {
						from: input.accountId,
						to: holding.accountId,
						amount: input.amount,
						onDay: input.onDay,
					});
				}
				if (input.accountId && input.kind === "out") {
					transactionId = await moveMoney(write, holding, {
						from: holding.accountId,
						to: input.accountId,
						amount: arrived,
						onDay: input.onDay,
					});
				}
				if (input.accountId && input.kind === "income") {
					transactionId = await incomeRecord(write, holding, {
						accountId: input.accountId,
						amount: input.amount,
						onDay: input.onDay,
					});
				}
				const made = await writeMove(write, holding, {
					kind: input.kind,
					onDay: input.onDay,
					amount: input.amount,
					quantity: input.quantity ?? null,
					transactionId,
				});
				if (input.unitPrice) await writePrice(write, holding, input.onDay, input.unitPrice);
				return made;
			});
			const [made] = await movesOf({ moveId: id });
			return made as HoldingMove;
		},

		/** The movements of a holding, oldest first; a logger's own only, as with records. */
		async moves(holdingId: string): Promise<HoldingMove[]> {
			const holding = await reachable(holdingId);
			assertCan(context.actor(), holding.spaceId, "investment.read");
			const all = await movesOf({ holdingId });
			if (!seesOwnRowsOnly(context.actor(), holding.spaceId)) return all;
			return all.filter((move) => move.createdBy === context.actor().userId);
		},

		/** What deleting a movement, or a whole holding, gives back to each account. */
		async goingBack(input: { holdingId?: string; moveId?: string }): Promise<GoingBack> {
			const move = input.moveId ? (await movesOf({ moveId: input.moveId }))[0] : null;
			if (input.moveId && !move) throw new NotFoundError("holdingMove", input.moveId);
			const holding = await reachable(move?.holdingId ?? input.holdingId ?? "");
			assertCan(context.actor(), holding.spaceId, "investment.write");
			return goingBackFrom(move ? [move] : await movesOf({ holdingId: holding.id }));
		},

		/** Deletes a movement and the record that moved its money. */
		async removeMove(id: string): Promise<void> {
			const [move] = await movesOf({ moveId: id });
			if (!move) throw new NotFoundError("holdingMove", id);
			const holding = await reachable(move.holdingId);
			assertCan(context.actor(), holding.spaceId, "investment.write");
			await context.driver.transaction(async (tx) => {
				await dropMoves({ ...context.write(), driver: tx }, holding, [move]);
			});
		},

		/** Deletes a holding, its movements and the records that moved their money. */
		async remove(id: string): Promise<void> {
			const holding = await reachable(id);
			assertCan(context.actor(), holding.spaceId, "investment.write");
			const moves = await movesOf({ holdingId: id });
			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				await dropMoves(write, holding, moves);
				await softDeleteRow(write, { table: holdings, spaceId: holding.spaceId, id });
			});
		},
	};
}

export type InvestmentsRepository = ReturnType<typeof createInvestmentsRepository>;

/** A generated identifier, for the callers that need one before they write. */
export const newHoldingId = uuidV7;
