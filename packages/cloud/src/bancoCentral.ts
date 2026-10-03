// The three numbers the country publishes.
//
// The Banco Central puts its series on a public address that needs no key, no account
// and no agreement: a series number, a range of dates, and JSON comes back. That is why
// these three are the one thing in this application that is fetched rather than typed.
//
// Nothing of the person goes with the request. It asks for a public table, the same
// table for everybody, and what comes back is kept so that the comparison still works
// with no connection at all. The request is made when somebody presses a button, never
// on a schedule, because a request made on a schedule is a schedule somebody else can
// read.

import { call, type Fetcher } from "./http.ts";

export type Series = "cdi" | "selic" | "ipca";

/**
 * The series numbers of the months, which are the whole of the knowledge here.
 *
 * The monthly ones are what a comparison and the inflation of a year read, already a monthly
 * percentage. The estimate of what a caixinha, a CDB or a poupança is worth reads the daily
 * ones below, day by day, because that is how a bank credits them: compounding a monthly
 * number into days would put an estimate a few cents out and nobody could say why.
 */
export const SERIES_CODE: Record<Series, number> = {
	// CDI acumulada no mes.
	cdi: 4391,
	// Taxa Selic acumulada no mes.
	selic: 4390,
	// IPCA, variacao mensal.
	ipca: 433,
};

export type SeriesPoint = {
	/** The month it is about. */
	month: string;
	/** Hundredths of a percent for that month, so one per cent is 100. */
	rate: number;
};

type Published = { data?: string; valor?: string };

function monthOf(brazilianDate: string): string | null {
	// The api writes a day as 01/09/2026, and every point of a monthly series is the
	// first of its month.
	const found = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(brazilianDate.trim());
	if (!found) return null;
	return `${found[3]}-${found[2]}`;
}

function rateOf(value: string): number | null {
	const parsed = Number.parseFloat(value.replace(",", "."));
	return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

export type FetchSeriesOptions = {
	/** The first month wanted, as a calendar month. */
	from: string;
	/** The last month wanted. Left out, it is everything up to today. */
	to?: string;
	fetcher?: Fetcher;
};

function asBrazilianDate(month: string, lastDay: boolean): string {
	const [year, index] = month.split("-");
	if (!lastDay) return `01/${index}/${year}`;
	const last = new Date(Date.UTC(Number(year), Number(index), 0)).getUTCDate();
	return `${String(last).padStart(2, "0")}/${index}/${year}`;
}

export function seriesUrl(series: Series, options: FetchSeriesOptions): string {
	const query = new URLSearchParams({
		formato: "json",
		dataInicial: asBrazilianDate(options.from, false),
	});
	if (options.to) query.set("dataFinal", asBrazilianDate(options.to, true));

	return `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${SERIES_CODE[series]}/dados?${query.toString()}`;
}

/**
 * The months of one series.
 *
 * A point that cannot be read is left out rather than guessed at: a month missing from
 * a comparison is visible on the screen, and a month with a made up number is not.
 */
export async function fetchSeries(
	series: Series,
	options: FetchSeriesOptions,
): Promise<SeriesPoint[]> {
	const response = await call(seriesUrl(series, options), {
		where: "Banco Central",
		fetcher: options.fetcher,
		headers: { Accept: "application/json" },
	});

	const published = (await response.json()) as Published[];
	if (!Array.isArray(published)) return [];

	const points: SeriesPoint[] = [];
	for (const point of published) {
		const month = monthOf(point.data ?? "");
		const rate = rateOf(point.valor ?? "");
		if (month === null || rate === null) continue;
		points.push({ month, rate });
	}

	return points;
}

/** The daily series: the CDI (12), the Selic (11) and the poupança (195). */
export type DailySeries = "cdiDaily" | "selicDaily" | "savings";

export const DAILY_CODE: Record<DailySeries, number> = {
	// CDI diário.
	cdiDaily: 12,
	// Selic diária.
	selicDaily: 11,
	// Poupança: rentabilidade de cada período mensal, pelo dia em que começa.
	savings: 195,
};

export type DayPoint = {
	/** The day it is for; for the poupança, the first day of the month the rate is for. */
	day: string;
	/** Hundred millionths of a percentage point: 0,050788% is 5078800. */
	rate: number;
};

/** A day as the api writes it, 01/09/2026, as the calendar writes it. */
function dayOf(brazilianDate: string): string | null {
	const found = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(brazilianDate.trim());
	return found ? `${found[3]}-${found[2]}-${found[1]}` : null;
}

function dailyRateOf(value: string): number | null {
	const parsed = Number.parseFloat(value.replace(",", "."));
	return Number.isFinite(parsed) ? Math.round(parsed * 100_000_000) : null;
}

const brazilian = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

export function dailyUrl(series: DailySeries, from: string, to: string): string {
	const query = new URLSearchParams({
		formato: "json",
		dataInicial: brazilian(from),
		dataFinal: brazilian(to),
	});
	return `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${DAILY_CODE[series]}/dados?${query.toString()}`;
}

/** The years one request of a daily series may cover: series 12 since 2010 with no end came back 406. */
const WINDOW_YEARS = 10;

/** A stretch of days cut in windows of at most ten years, oldest first. */
export function windowsOf(from: string, to: string): { from: string; to: string }[] {
	const windows: { from: string; to: string }[] = [];
	let start = from;
	while (start <= to) {
		const year = Number(start.slice(0, 4)) + WINDOW_YEARS;
		const end = new Date(
			Date.UTC(year, Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)) - 1),
		)
			.toISOString()
			.slice(0, 10);
		const last = end < to ? end : to;
		windows.push({ from: start, to: last });
		const next = new Date(`${last}T00:00:00Z`);
		next.setUTCDate(next.getUTCDate() + 1);
		start = next.toISOString().slice(0, 10);
	}
	return windows;
}

/**
 * The days of one daily series between two days, always with both dates, in windows of at most
 * ten years, one request at a time.
 */
export async function fetchDailySeries(
	series: DailySeries,
	options: { from: string; to: string; fetcher?: Fetcher },
): Promise<DayPoint[]> {
	const points: DayPoint[] = [];
	for (const window of windowsOf(options.from, options.to)) {
		const response = await call(dailyUrl(series, window.from, window.to), {
			where: "Banco Central",
			fetcher: options.fetcher,
			headers: { Accept: "application/json" },
		});
		const published = (await response.json()) as Published[];
		if (!Array.isArray(published)) continue;
		for (const point of published) {
			const day = dayOf(point.data ?? "");
			const rate = dailyRateOf(point.valor ?? "");
			if (day === null || rate === null) continue;
			points.push({ day, rate });
		}
	}
	return points;
}

/** The newest month and day this installation already holds, by series. */
export type HeldIndices = {
	monthly: Record<Series, string | null>;
	daily: Record<DailySeries, string | null>;
};

export type FetchedIndices = {
	monthly: Record<Series, SeriesPoint[]>;
	daily: Record<DailySeries, DayPoint[]>;
};

/**
 * Everything the button asks for, always the same set whatever somebody holds: the three
 * monthly series and the three daily ones. Asking for the poupança only when somebody has one
 * would tell the Banco Central that they have one.
 *
 * The first time, from January of ten years before; after that, only the days that are new.
 * The monthly series always reach at least thirteen months back, which the inflation of a year
 * needs. One request at a time.
 */
export async function fetchEveryIndex(input: {
	held: HeldIndices;
	today: string;
	fetcher?: Fetcher;
}): Promise<FetchedIndices> {
	const firstDay = `${Number(input.today.slice(0, 4)) - 10}-01-01`;
	const thisMonth = input.today.slice(0, 7);
	const monthsBack = (month: string, count: number) => {
		const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 - count;
		return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
	};
	const thirteenBack = monthsBack(thisMonth, 13);

	const monthly = { cdi: [], selic: [], ipca: [] } as Record<Series, SeriesPoint[]>;
	for (const series of ["cdi", "selic", "ipca"] as const) {
		const held = input.held.monthly[series];
		const from =
			held === null
				? firstDay.slice(0, 7)
				: monthsBack(held, -1) < thirteenBack
					? monthsBack(held, -1)
					: thirteenBack;
		monthly[series] = await fetchSeries(series, { from, fetcher: input.fetcher });
	}

	const daily = { cdiDaily: [], selicDaily: [], savings: [] } as Record<DailySeries, DayPoint[]>;
	for (const series of ["cdiDaily", "selicDaily", "savings"] as const) {
		const held = input.held.daily[series];
		let from = firstDay;
		if (held !== null) {
			const next = new Date(`${held}T00:00:00Z`);
			next.setUTCDate(next.getUTCDate() + 1);
			from = next.toISOString().slice(0, 10);
		}
		if (from > input.today) continue;
		daily[series] = await fetchDailySeries(series, {
			from,
			to: input.today,
			fetcher: input.fetcher,
		});
	}
	return { monthly, daily };
}
