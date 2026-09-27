// A month written as three numbers, for somebody who is never going to write down the
// pieces.
//
// The three are ordinary records. Nothing downstream is told they were typed together:
// the balances add them up, the reports sort them, the invoice screen shows the card
// one, the projection reads that month like any other. That is the whole design. A
// second kind of row, one that meant "a month, summarised", would have to be taught to
// every screen that already knows how to read a record, and every screen that was not
// taught would quietly be wrong.
//
// What the three carry is a mark, so that typing the same month again corrects what is
// there instead of writing it twice.

import { type CardCycle, invoicePeriod } from "../cards/invoice.ts";
import {
	type CalendarDate,
	type CalendarMonth,
	dateInMonth,
	parseCalendarMonth,
} from "../time/calendar.ts";

/** The three questions a month is reduced to. */
export type MonthPart = "income" | "spending" | "invoice";

export const MONTH_PARTS: readonly MonthPart[] = ["income", "spending", "invoice"];

const MARK = "mes";

/**
 * The mark a record written this way carries.
 *
 * It goes in the field that holds what the bank called an entry, because that field
 * exists for exactly this question: whether a row already here and a row about to be
 * written are the same thing. A bank identifier never looks like `mes:2026-09:income`,
 * so the two cannot be taken for each other, and a record written by hand carries
 * nothing there at all and is never touched by this screen.
 */
export function monthMark(month: CalendarMonth, part: MonthPart): string {
	parseCalendarMonth(month);
	return `${MARK}:${month}:${part}`;
}

/** The other direction, for deciding whether a record on screen came from there. */
export function readMonthMark(
	externalId: string | null | undefined,
): { month: CalendarMonth; part: MonthPart } | null {
	if (!externalId) return null;

	const parts = externalId.split(":");
	if (parts.length !== 3) return null;
	const [prefix, month, part] = parts;
	if (prefix !== MARK || month === undefined || part === undefined) return null;
	if (!MONTH_PARTS.includes(part as MonthPart)) return null;

	try {
		parseCalendarMonth(month as CalendarMonth);
	} catch {
		return null;
	}
	return { month: month as CalendarMonth, part: part as MonthPart };
}

/**
 * The day one of the three is written on.
 *
 * The last day of the month, because the number covers the whole month rather than a
 * moment in it, and because every report that asks about a month asks from its first
 * day to its last one. Putting it in the middle would claim the money had all gone by
 * the fifteenth.
 *
 * The card is the exception. Its record has to land on the invoice of that month, and
 * which days do that is the card's business rather than the calendar's, so it is written
 * on the last day that invoice still takes. A card with no closing day has no invoices
 * to land on, and falls back to the last day like the other two.
 */
export function monthPartDay(
	month: CalendarMonth,
	part: MonthPart,
	cycle?: CardCycle | null,
): CalendarDate {
	if (part === "invoice" && cycle) return invoicePeriod(month, cycle).to;
	// Clamped, so this is the last day of whatever length the month is.
	return dateInMonth(month, 31);
}
