// What the records screen is showing, and the two ways of writing it down.
//
// A filtered list is a question somebody asks, and a question nobody can link to, reload
// or send to the other person in the space is a question they have to ask again every
// time. So the filters live in the address, and this module owns the names it uses so
// that they exist in one place instead of being spelled out at every call site.
//
// There are two encodings and one shape. The address is Portuguese, like every other
// address in this application, and it leaves out whatever is at its default so a list
// nobody narrowed has a clean address. A saved filter is a row in the database, written
// in the shape the screen has always written it, and it is not touched here: an old row
// may be missing a key, which is why the month falls back rather than being assumed.
//
// The address is the only source of truth for what the list shows. A saved filter is a
// starting point, applied by navigating, because a saved filter that only set state would
// leave the address pointing at the previous list and a reload would quietly undo it.

import type { TransactionKind, TransactionStatus } from "@cofre/storage";

export type Filters = {
	kind: TransactionKind | "";
	status: TransactionStatus | "";
	accountId: string;
	/** One piece of plastic, which is narrower than an account when a card is multiple. */
	cardId: string;
	/** A category, the word "none" for what was never sorted, or empty for everything. */
	categoryId: string;
	search: string;
	/** The period: "" for every month, "AAAA" for a year, "AAAA-MM" for a month. */
	month: string;
};

/** The same question, as the address writes it. */
export type RecordsSearch = {
	mes?: string;
	/**
	 * A whole year. With a month as well, the month wins.
	 *
	 * A number, because the router reads ano=2026 as one and writes a string of digits with
	 * quotes around it, which no person types.
	 */
	ano?: number;
	busca?: string;
	tipo?: TransactionKind;
	situacao?: TransactionStatus;
	conta?: string;
	cartao?: string;
	categoria?: string;
};

/**
 * The month cleared, which means every month.
 *
 * An empty month is every month, and an address cannot say "empty" by leaving a name out,
 * because leaving it out is how it says "this month". So the two have to be told apart by
 * a word, and the word is the one somebody would guess.
 */
export const EVERY_MONTH = "tudo";

/** What was never sorted into a category. The screen calls it "none" inside. */
export const UNSORTED = "sem";

/** The word a saved filter keeps for the year it is, so it follows the calendar. */
export const THIS_YEAR = "thisYear";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR = /^\d{4}$/;

const KINDS = new Set(["income", "expense", "transfer"]);
const STATUSES = new Set(["planned", "settled"]);

const word = (value: unknown): string | undefined =>
	typeof value === "string" && value !== "" ? value : undefined;

/**
 * The route's own reading of an address.
 *
 * Nothing is refused. An address is typed by people and pasted by them, so anything that
 * is not one of the words this screen knows is dropped and the screen opens on its
 * default, which is a narrower answer than a blank page with an error on it.
 */
export function readRecordsSearch(search: Record<string, unknown>): RecordsSearch {
	const kind = word(search.tipo);
	const status = word(search.situacao);
	const month = word(search.mes);
	const year = Number(search.ano);

	return {
		mes: month === EVERY_MONTH || (month && MONTH.test(month)) ? month : undefined,
		ano: Number.isInteger(year) && year >= 1000 && year <= 9999 ? year : undefined,
		busca: word(search.busca),
		tipo: kind && KINDS.has(kind) ? (kind as TransactionKind) : undefined,
		situacao: status && STATUSES.has(status) ? (status as TransactionStatus) : undefined,
		conta: word(search.conta),
		cartao: word(search.cartao),
		categoria: word(search.categoria),
	};
}

/** What the screen should show, given what the address says and which month it is. */
export function filtersFromAddress(asked: RecordsSearch, thisMonth: string): Filters {
	return {
		kind: asked.tipo ?? "",
		status: asked.situacao ?? "",
		accountId: asked.conta ?? "",
		cardId: asked.cartao ?? "",
		categoryId: asked.categoria === UNSORTED ? "none" : (asked.categoria ?? ""),
		search: asked.busca ?? "",
		month:
			asked.mes === EVERY_MONTH
				? ""
				: (asked.mes ?? (asked.ano === undefined ? thisMonth : String(asked.ano))),
	};
}

/** The inverse, with every default left out so an unnarrowed list has a clean address. */
export function addressFromFilters(filters: Filters, thisMonth: string): RecordsSearch {
	const year = YEAR.test(filters.month);
	return {
		mes:
			filters.month === ""
				? EVERY_MONTH
				: filters.month === thisMonth || year
					? undefined
					: filters.month,
		ano: year ? Number(filters.month) : undefined,
		busca: filters.search || undefined,
		tipo: filters.kind || undefined,
		situacao: filters.status || undefined,
		conta: filters.accountId || undefined,
		cartao: filters.cardId || undefined,
		categoria: filters.categoryId === "none" ? UNSORTED : filters.categoryId || undefined,
	};
}

/**
 * A saved filter is stored as it was written, so an old one may not have every key.
 *
 * No month is the month it is when the filter is opened, which is also what a row from before
 * 2.0.0 without the key means, and the word for the year it is follows the calendar the same
 * way. Anything else is a fixed period. Rows from before 2.0.0 hold the month they were saved
 * in, and stay there: saving them again is what moves them.
 */
export function filtersFromSaved(query: Record<string, unknown>, thisMonth: string): Filters {
	const text = (name: string) => (typeof query[name] === "string" ? (query[name] as string) : "");
	return {
		kind: text("kind") as TransactionKind | "",
		status: text("status") as TransactionStatus | "",
		accountId: text("accountId"),
		cardId: text("cardId"),
		categoryId: text("categoryId"),
		search: text("search"),
		month: !("month" in query)
			? thisMonth
			: text("month") === THIS_YEAR
				? thisMonth.slice(0, 4)
				: text("month"),
	};
}

/**
 * The inverse, which is what a saved filter keeps and what the mark of the active one compares.
 *
 * It kept the month it was saved in, so "Lazer" saved in October opened October in November,
 * and the mark said it was not the list on screen. The month it is and the year it is are kept
 * as no month and as a word, and every other period as it is written. What is not narrowed is
 * left out.
 */
export function savedFromFilters(filters: Filters, thisMonth: string): Record<string, string> {
	const query: Record<string, string> = {};
	for (const [name, value] of [
		["kind", filters.kind],
		["status", filters.status],
		["accountId", filters.accountId],
		["cardId", filters.cardId],
		["categoryId", filters.categoryId],
		["search", filters.search],
	] as const) {
		if (value !== "") query[name] = value;
	}
	if (filters.month !== thisMonth) {
		query.month = filters.month === thisMonth.slice(0, 4) ? THIS_YEAR : filters.month;
	}
	return query;
}

/** Whether the period is one month, one year or every month. */
export function kindOfPeriod(month: string): "month" | "year" | "all" {
	return month === "" ? "all" : YEAR.test(month) ? "year" : "month";
}

/** The first and the last day of a period, or nothing for every month. */
export function daysOfPeriod(month: string): { from?: string; to?: string } {
	if (month === "") return {};
	if (YEAR.test(month)) return { from: `${month}-01-01`, to: `${month}-12-31` };
	const [year, number] = month.split("-").map(Number);
	const lastDay = new Date(Date.UTC(year ?? 2026, number ?? 1, 0)).getUTCDate();
	return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** How many of the filters behind the button are doing something. */
export function narrowedIn(filters: Filters): number {
	return [
		filters.kind,
		filters.status,
		filters.accountId,
		filters.cardId,
		filters.categoryId,
	].filter((value) => value !== "").length;
}
