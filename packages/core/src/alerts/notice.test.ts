import { describe, expect, it } from "vitest";
import { noticesFor } from "./notice.ts";

describe("what the overview says before it is asked", () => {
	// Part 2, B.4.7 of the request for 2.0.0: the notice of an invoice about to close was never
	// shown, because nothing handed it the cards, and it had no plural, "fecha em 1 dias".
	it("says every card whose invoice closes within two days, with the count for the plural", () => {
		const notices = noticesFor({
			today: "2026-11-01",
			invoicesClosing: [
				{ name: "C6", closesOn: "2026-11-03", month: "novembro" },
				{ name: "Nubank", closesOn: "2026-11-02", month: "novembro" },
				{ name: "Itaú", closesOn: "2026-11-25", month: "novembro" },
				{ name: "Inter", closesOn: "2026-11-01", month: "novembro" },
			],
		});
		expect(
			notices
				.filter((notice) => notice.kind === "invoiceClosing")
				.map((notice) => [notice.values.name, notice.values.count, notice.values.month]),
		).toEqual([
			["C6", 2, "novembro"],
			["Nubank", 1, "novembro"],
			["Inter", 0, "novembro"],
		]);
	});
});
