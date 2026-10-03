// What the country did, kept here so that it still works offline.
//
// Three numbers matter to somebody in Brazil deciding whether money put aside is doing
// anything: the CDI, which is what a conservative investment is measured against, the
// Selic, which is the rate everything else follows, and the IPCA, which is how much of
// the money is being eaten.
//
// They are public, official and the same for everybody, so they are stored once per
// installation rather than once per space, and never replicated: a device that wants
// them can ask the source, and a device with no connection uses the last it was given.

import type { CalendarMonth } from "@cofre/core";
import type { Driver } from "../driver.ts";
import { type IndexRate, type IndexSeries, toIndexRate } from "../models.ts";
import { marks } from "../sql.ts";
import type { RepositoryContext } from "./context.ts";

export type IndexPoint = {
	month: CalendarMonth;
	/** Hundredths of a percent for that month, so one per cent is 100. */
	rate: number;
};

/**
 * Writes what was fetched, replacing what was there for the same months.
 *
 * It takes a driver rather than a session, because it belongs to nobody: the numbers
 * are the same for every person and every space in this installation.
 */
export async function saveIndexRates(
	driver: Driver,
	series: IndexSeries,
	points: readonly IndexPoint[],
	now: () => number = Date.now,
): Promise<number> {
	if (points.length === 0) return 0;

	await driver.transaction(async (tx) => {
		for (const point of points) {
			await tx.run(`DELETE FROM "index_rates" WHERE "series" = ? AND "month" = ?`, [
				series,
				point.month,
			]);
			await tx.run(
				`INSERT INTO "index_rates" ("id", "series", "month", "rate", "fetched_at")
				 VALUES (?, ?, ?, ?, ?)`,
				[`${series}:${point.month}`, series, point.month, Math.round(point.rate), now()],
			);
		}
	});

	return points.length;
}

/** A day of a daily series, in hundred millionths of a percentage point. */
export type IndexDayPoint = { day: string; rate: number };

/** Writes the days a fetch brought back, replacing what was there for the same days. */
export async function saveIndexDays(
	driver: Driver,
	series: "cdiDaily" | "selicDaily" | "savings",
	points: readonly IndexDayPoint[],
	now: () => number = Date.now,
): Promise<number> {
	if (points.length === 0) return 0;
	await driver.transaction(async (tx) => {
		for (const point of points) {
			await tx.run(`DELETE FROM "index_days" WHERE "series" = ? AND "day" = ?`, [
				series,
				point.day,
			]);
			await tx.run(
				`INSERT INTO "index_days" ("id", "series", "day", "rate", "fetched_at")
				 VALUES (?, ?, ?, ?, ?)`,
				[`${series}:${point.day}`, series, point.day, Math.round(point.rate), now()],
			);
		}
	});
	return points.length;
}

export function createIndicesRepository(context: RepositoryContext) {
	return {
		/**
		 * The months of one index, oldest first.
		 *
		 * No permission is asked for, because there is nothing here about anybody: it is
		 * the same table of public numbers whoever is reading it.
		 */
		async list(
			series: IndexSeries,
			range: { from?: string; to?: string } = {},
		): Promise<IndexRate[]> {
			const where = [`"series" = ?`];
			const params: string[] = [series];

			if (range.from) {
				where.push(`"month" >= ?`);
				params.push(range.from);
			}
			if (range.to) {
				where.push(`"month" <= ?`);
				params.push(range.to);
			}

			const rows = await context.driver.all(
				`SELECT "series", "month", "rate", "fetched_at" FROM "index_rates"
				 WHERE ${where.join(" AND ")} ORDER BY "month"`,
				params,
			);
			return rows.map(toIndexRate);
		},

		/** The newest month held for each series, so the screen can say how old it is. */
		async latest(): Promise<Record<string, IndexRate | null>> {
			const rows = await context.driver.all(
				`SELECT "series", "month", "rate", "fetched_at" FROM "index_rates" ORDER BY "month" DESC`,
			);

			const newest: Record<string, IndexRate | null> = { cdi: null, selic: null, ipca: null };
			for (const row of rows.map(toIndexRate)) {
				if (newest[row.series] === null) newest[row.series] = row;
			}
			return newest;
		},

		/** Writes what a fetch brought back. */
		save(series: IndexSeries, points: readonly IndexPoint[]): Promise<number> {
			return saveIndexRates(context.driver, series, points, context.now);
		},

		/** Writes the days of a daily series a fetch brought back. */
		saveDays(
			series: "cdiDaily" | "selicDaily" | "savings",
			points: readonly IndexDayPoint[],
		): Promise<number> {
			return saveIndexDays(context.driver, series, points, context.now);
		},

		/**
		 * The newest month and day held of every series, which is where the next fetch starts, and
		 * the newest day of the CDI, which is how far an estimate can go.
		 */
		async held(): Promise<{
			monthly: Record<"cdi" | "selic" | "ipca", string | null>;
			daily: Record<"cdiDaily" | "selicDaily" | "savings", string | null>;
		}> {
			const months = await context.driver.all(
				`SELECT "series", MAX("month") AS "newest" FROM "index_rates" GROUP BY "series"`,
			);
			const days = await context.driver.all(
				`SELECT "series", MAX("day") AS "newest" FROM "index_days" GROUP BY "series"`,
			);
			const of = (rows: typeof months, series: string) => {
				const found = rows.find((row) => String(row.series) === series)?.newest;
				return found === null || found === undefined ? null : String(found);
			};
			return {
				monthly: { cdi: of(months, "cdi"), selic: of(months, "selic"), ipca: of(months, "ipca") },
				daily: {
					cdiDaily: of(days, "cdiDaily"),
					selicDaily: of(days, "selicDaily"),
					savings: of(days, "savings"),
				},
			};
		},

		/** Everything held for a set of months, for comparing a portfolio against. */
		async forMonths(series: IndexSeries, months: readonly string[]): Promise<Map<string, number>> {
			if (months.length === 0) return new Map();

			const rows = await context.driver.all(
				`SELECT "month", "rate" FROM "index_rates"
				 WHERE "series" = ? AND "month" IN (${marks(months.length)})`,
				[series, ...months],
			);

			return new Map(rows.map((row) => [String(row.month), Number(row.rate)]));
		},
	};
}

export type IndicesRepository = ReturnType<typeof createIndicesRepository>;
