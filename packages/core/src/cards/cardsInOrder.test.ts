import { describe, expect, it } from "vitest";
import { type CardInvoices, cardsByUrgency, cardsTogether } from "./cardsInOrder.ts";
import { invoiceStateOf } from "./invoiceState.ts";

const TODAY = "2026-10-28";

/** One card with the cycle given, an open invoice and the closed ones still owed. */
function card(
	name: string,
	cycle: { closingDay: number; dueDay: number },
	open: { month: string; charged: number },
	owing: { month: string; charged: number }[] = [],
	currency = "BRL",
): CardInvoices {
	const state = (one: { month: string; charged: number }) =>
		invoiceStateOf({ month: one.month, cycle, charged: one.charged, paid: 0, today: TODAY });
	return { name, currency, open: state(open), owing: owing.map(state) };
}

// Part 2, B.2.3 of the request for 2.0.0, on the twenty eighth of October.
const nubank = card(
	"Nubank",
	{ closingDay: 15, dueDay: 22 },
	{ month: "2026-11", charged: 120_000 },
	[{ month: "2026-10", charged: 30_000 }],
);
const itau = card("Itaú", { closingDay: 25, dueDay: 5 }, { month: "2026-11", charged: 15_000 }, [
	{ month: "2026-10", charged: 90_000 },
]);
const c6 = card("C6", { closingDay: 3, dueDay: 10 }, { month: "2026-11", charged: 50_000 });
const inter = card("Inter", { closingDay: 10, dueDay: 17 }, { month: "2026-11", charged: 0 });

describe("several cards", () => {
	it("puts the late one first, then the closed one, then the open one, then the empty one", () => {
		// Given in an order that is none of the answers, and alphabetically wrong as well.
		const ordered = cardsByUrgency([inter, c6, itau, nubank], TODAY, "pt-BR");
		expect(ordered.map((one) => one.name)).toEqual(["Nubank", "Itaú", "C6", "Inter"]);
	});

	it("adds them up, the open invoices, the closed ones not due and the late ones apart", () => {
		expect(cardsTogether([nubank, itau, c6, inter], TODAY)).toEqual({
			count: 4,
			open: 185_000,
			closed: 90_000,
			closedDueOn: "2026-11-05",
			overdue: 30_000,
			currency: "BRL",
		});
	});

	it("puts the nearest due day first inside a tier, and the name only breaks a tie", () => {
		const later = card("Aaa", { closingDay: 20, dueDay: 27 }, { month: "2026-11", charged: 100 });
		const sooner = card("Zzz", { closingDay: 3, dueDay: 10 }, { month: "2026-11", charged: 100 });
		const twin = card("Ccc", { closingDay: 3, dueDay: 10 }, { month: "2026-11", charged: 100 });
		expect(cardsByUrgency([later, sooner, twin], TODAY, "pt-BR").map((one) => one.name)).toEqual([
			"Ccc",
			"Zzz",
			"Aaa",
		]);
	});

	it("does not add cards in two currencies, and says so", () => {
		const dollars = card(
			"Wise",
			{ closingDay: 3, dueDay: 10 },
			{ month: "2026-11", charged: 100 },
			[],
			"USD",
		);
		expect(cardsTogether([c6, dollars], TODAY).currency).toBeNull();
	});

	it("orders the empty ones by name the way the language sorts words", () => {
		const accented = card("Ágil", { closingDay: 3, dueDay: 10 }, { month: "2026-11", charged: 0 });
		const plain = card("Banco", { closingDay: 3, dueDay: 10 }, { month: "2026-11", charged: 0 });
		expect(cardsByUrgency([plain, accented], TODAY, "pt-BR").map((one) => one.name)).toEqual([
			"Ágil",
			"Banco",
		]);
	});
});
