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
 * The series numbers, which are the whole of the knowledge here.
 *
 * All three are already a monthly percentage, which is what this application wants: a
 * daily series would have to be compounded, and compounding a daily series by hand is
 * how a comparison ends up a few per cent out and nobody can say why.
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
