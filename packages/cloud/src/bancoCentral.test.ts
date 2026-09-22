import { describe, expect, it } from "vitest";
import { fetchSeries, SERIES_CODE, seriesUrl } from "./bancoCentral.ts";

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
