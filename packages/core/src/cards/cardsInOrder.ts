// Several cards, in the order somebody has to deal with them, and added up.
//
// Every screen opened on the first card the database happened to sort by name, without a
// collation, so SQLite and PostgreSQL with a language collation put "Carteira" and "Cartão de
// crédito" the other way round and the two modes opened different cards. A card that is late
// is the one to look at whatever it is called, so the order is the urgency, and the name only
// breaks a tie, compared the way the language of the screen compares words.

import type { CalendarDate } from "../time/calendar.ts";
import { compareCalendarDates } from "../time/calendar.ts";
import type { InvoiceState } from "./invoiceState.ts";

/** What the order and the sums need of a card: its name, its currency and its invoices. */
export type CardInvoices = {
	name: string;
	currency: string;
	/** The invoice still taking purchases. */
	open: InvoiceState;
	/** Every invoice that closed and is still owed, oldest first. */
	owing: readonly InvoiceState[];
};

/** What an invoice still asks for, never less than nothing: credit is not a debt. */
function owed(state: InvoiceState): number {
	return Math.max(0, state.left);
}

/** Closed, its due day gone, and still owed. Due today is not late yet. */
function overdue(state: InvoiceState, today: CalendarDate): boolean {
	return compareCalendarDates(today, state.dueOn) > 0 && owed(state) > 0;
}

/** Closed, its due day still ahead or today, and still owed. */
function closedAndOwed(state: InvoiceState, today: CalendarDate): boolean {
	return (
		compareCalendarDates(today, state.closesOn) >= 0 &&
		compareCalendarDates(today, state.dueOn) <= 0 &&
		owed(state) > 0
	);
}

/**
 * Where one card stands in the order, as a tier and the day that orders it inside the tier.
 *
 * First a card with an invoice whose due day has gone and that is still owed, the oldest of
 * those first. Then one with an invoice that closed and is owed and not due yet. Then one
 * with something on the open invoice. In those two, the nearest due day first. Then a card
 * with nothing on it.
 */
function placeOf(card: CardInvoices, today: CalendarDate): { tier: number; day: CalendarDate } {
	const late = card.owing.filter((state) => overdue(state, today));
	if (late.length > 0) {
		return {
			tier: 0,
			day: [...late].sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0]?.dueOn ?? today,
		};
	}
	const closed = card.owing.filter((state) => closedAndOwed(state, today));
	if (closed.length > 0) {
		return {
			tier: 1,
			day: [...closed].sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0]?.dueOn ?? today,
		};
	}
	if (owed(card.open) > 0) return { tier: 2, day: card.open.dueOn };
	return { tier: 3, day: card.open.dueOn };
}

/** The cards in the order somebody has to deal with them. The list given is not changed. */
export function cardsByUrgency<T extends CardInvoices>(
	cards: readonly T[],
	today: CalendarDate,
	language?: string,
): T[] {
	const places = new Map(cards.map((card) => [card, placeOf(card, today)]));
	return [...cards].sort((left, right) => {
		const one = places.get(left);
		const other = places.get(right);
		if (one && other) {
			if (one.tier !== other.tier) return one.tier - other.tier;
			// The nearest due day first, and the oldest debt first among the late ones, which
			// is the same comparison of days.
			if (one.tier < 3 && one.day !== other.day) return one.day.localeCompare(other.day);
		}
		return left.name.localeCompare(right.name, language);
	});
}

export type CardsTogether = {
	/** How many cards were added. */
	count: number;
	/** What the open invoices still ask for. */
	open: number;
	/** What the invoices that closed and are not due yet still ask for. */
	closed: number;
	/** The earliest due day among those, for a sentence that says when. */
	closedDueOn: CalendarDate | null;
	/** What the invoices whose due day has gone still ask for. */
	overdue: number;
	/**
	 * The currency every figure is in, or nothing when the cards are in more than one, which
	 * happens in "Todos" across spaces. Then the sums are not said: adding reais to dollars
	 * prints a number that is neither.
	 */
	currency: string | null;
};

/** Every card added together, for the top of the overview, the total of a list and the PDF. */
export function cardsTogether(cards: readonly CardInvoices[], today: CalendarDate): CardsTogether {
	const currencies = new Set(cards.map((card) => card.currency));
	let open = 0;
	let closed = 0;
	let late = 0;
	let closedDueOn: CalendarDate | null = null;
	for (const card of cards) {
		open += owed(card.open);
		for (const state of card.owing) {
			if (overdue(state, today)) late += owed(state);
			else if (closedAndOwed(state, today)) {
				closed += owed(state);
				if (closedDueOn === null || compareCalendarDates(state.dueOn, closedDueOn) < 0) {
					closedDueOn = state.dueOn;
				}
			}
		}
	}
	return {
		count: cards.length,
		open,
		closed,
		closedDueOn,
		overdue: late,
		currency: currencies.size === 1 ? ([...currencies][0] ?? null) : null,
	};
}
