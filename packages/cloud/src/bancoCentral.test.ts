import { describe, expect, it } from "vitest";
import {
	fetchDailySeries,
	fetchEveryIndex,
	fetchSeries,
	SERIES_CODE,
	seriesUrl,
	windowsOf,
} from "./bancoCentral.ts";

function fakeService(body: unknown, status = 200) {
	const calls: string[] = [];
	const fetcher = (async (url: string | URL | Request) => {
		calls.push(String(url));
		return new Response(JSON.stringify(body), { status });
	}) as typeof globalThis.fetch;
	return { fetcher, calls };
}

describe("asking the Banco Central", () => {
	it("builds the address of a series, with the dates the way it wants them", () => {
		const url = seriesUrl("cdi", { from: "2026-01", to: "2026-09" });

		expect(url).toContain(`bcdata.sgs.${SERIES_CODE.cdi}`);
		expect(url).toContain("dataInicial=01%2F01%2F2026");
		// The end of the range is the last day of the month, which September has thirty of.
		expect(url).toContain("dataFinal=30%2F09%2F2026");
	});

	it("turns what is published into months and hundredths of a percent", async () => {
		const service = fakeService([
			{ data: "01/07/2026", valor: "0.90" },
			{ data: "01/08/2026", valor: "0.88" },
			{ data: "01/09/2026", valor: "1" },
		]);

		const points = await fetchSeries("cdi", { from: "2026-07", fetcher: service.fetcher });

		expect(points).toEqual([
			{ month: "2026-07", rate: 90 },
			{ month: "2026-08", rate: 88 },
			{ month: "2026-09", rate: 100 },
		]);
	});

	it("leaves out a point it cannot read rather than guessing at it", async () => {
		const service = fakeService([
			{ data: "01/07/2026", valor: "0.90" },
			{ data: "vazio", valor: "0.50" },
			{ data: "01/09/2026", valor: "" },
		]);

		expect(await fetchSeries("ipca", { from: "2026-07", fetcher: service.fetcher })).toEqual([
			{ month: "2026-07", rate: 90 },
		]);
	});

	it("says when the service answered with something else", async () => {
		const service = fakeService({ erro: "muitos pedidos" }, 429);
		await expect(
			fetchSeries("selic", { from: "2026-07", fetcher: service.fetcher }),
		).rejects.toThrow(/Banco Central/);
	});

	it("gives back nothing for an answer that is not a list", async () => {
		const service = fakeService({ nada: true });
		expect(await fetchSeries("selic", { from: "2026-07", fetcher: service.fetcher })).toEqual([]);
	});
});

// Part 2, H.6 of the request for 2.0.0.
describe("the daily series", () => {
	it("asks for eleven years in two requests, each with both dates", async () => {
		expect(windowsOf("2016-01-01", "2026-10-28")).toEqual([
			{ from: "2016-01-01", to: "2025-12-31" },
			{ from: "2026-01-01", to: "2026-10-28" },
		]);
		const service = fakeService([{ data: "28/10/2026", valor: "0.050788" }]);
		const points = await fetchDailySeries("cdiDaily", {
			from: "2016-01-01",
			to: "2026-10-28",
			fetcher: service.fetcher,
		});
		expect(service.calls).toHaveLength(2);
		expect(
			service.calls.every((url) => url.includes("dataInicial") && url.includes("dataFinal")),
		).toBe(true);
		expect(points[0]).toEqual({ day: "2026-10-28", rate: 5_078_800 });
	});

	it("always asks for the same six series, whatever anybody holds", async () => {
		const service = fakeService([]);
		const none = {
			monthly: { cdi: null, selic: null, ipca: null },
			daily: { cdiDaily: null, selicDaily: null, savings: null },
		};
		await fetchEveryIndex({ held: none, today: "2026-10-28", fetcher: service.fetcher });
		const codes = service.calls.map((url) => /bcdata\.sgs\.(\d+)/.exec(url)?.[1]);
		expect([...new Set(codes)].sort()).toEqual(["11", "12", "195", "433", "4390", "4391"]);
		// The first time, from January of ten years before.
		for (const code of ["11", "12", "195", "433", "4390", "4391"]) {
			const first = service.calls.find((url) => url.includes(`sgs.${code}/`));
			expect(first, code).toContain("dataInicial=01%2F01%2F2016");
		}

		// After that, only the days that are new, and at least thirteen months of the monthly ones.
		const later = fakeService([]);
		await fetchEveryIndex({
			held: {
				monthly: { cdi: "2026-09", selic: "2026-09", ipca: "2026-09" },
				daily: { cdiDaily: "2026-10-27", selicDaily: "2026-10-27", savings: "2026-10-01" },
			},
			today: "2026-10-28",
			fetcher: later.fetcher,
		});
		expect(later.calls.filter((url) => url.includes("sgs.4391"))[0]).toContain(
			"dataInicial=01%2F09%2F2025",
		);
		expect(later.calls.filter((url) => url.includes("sgs.12/"))[0]).toContain(
			"dataInicial=28%2F10%2F2026",
		);
	});
});
