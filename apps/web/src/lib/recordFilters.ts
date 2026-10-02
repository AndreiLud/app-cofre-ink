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
	month: string;
};

/** The same question, as the address writes it. */
export type RecordsSearch = {
	mes?: string;
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

	return {
		mes: month === EVERY_MONTH || (month && /^\d{4}-\d{2}$/.test(month)) ? month : undefined,
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
		month: asked.mes === EVERY_MONTH ? "" : (asked.mes ?? thisMonth),
	};
}

/** The inverse, with every default left out so an unnarrowed list has a clean address. */
export function addressFromFilters(filters: Filters, thisMonth: string): RecordsSearch {
	return {
		mes:
			filters.month === "" ? EVERY_MONTH : filters.month === thisMonth ? undefined : filters.month,
		busca: filters.search || undefined,
		tipo: filters.kind || undefined,
		situacao: filters.status || undefined,
		conta: filters.accountId || undefined,
		cartao: filters.cardId || undefined,
		categoria: filters.categoryId === "none" ? UNSORTED : filters.categoryId || undefined,
	};
}

/** A saved filter is stored as it was written, so an old one may not have every key. */
export function filtersFromSaved(query: Record<string, unknown>, fallbackMonth: string): Filters {
	const text = (name: string) => (typeof query[name] === "string" ? (query[name] as string) : "");
	return {
		kind: text("kind") as TransactionKind | "",
		status: text("status") as TransactionStatus | "",
		accountId: text("accountId"),
		cardId: text("cardId"),
		categoryId: text("categoryId"),
		search: text("search"),
		month: "month" in query ? text("month") : fallbackMonth,
	};
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
