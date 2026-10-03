// Which invoice of a card a record touches, and how.
//
// A record has one `invoice_month`, and a transfer out of a card touches two invoices: the
// one it pays at the other end, and one of the card it leaves, where it is a purchase. Since
// 2.0.0 the second is written in `origin_invoice_month`, by the only two things allowed to
// write a transfer out of a card: paying an invoice with another card, and splitting one.
// This is the rule in one place. The sums in `packages/storage` are its twin in SQL, and the
// conformance suite holds the two to the same answer.

import type { CalendarMonth } from "../time/calendar.ts";

export type RowOnACard = {
	kind: "income" | "expense" | "transfer";
	accountId: string;
	counterAccountId: string | null;
	invoiceMonth: CalendarMonth | null;
	originInvoiceMonth: CalendarMonth | null;
	/** Signed as it is kept: money out negative, money in and a transfer positive. */
	amountInBase: number;
	/** Whether the account the record leaves is a credit card. */
	leavesACard: boolean;
};

/**
 * One way a record touches a card.
 *
 * A charge is on the invoice it names, positive for a purchase and negative for a refund. A
 * payment names the invoice it pays, and is paid in money, rolled into parts by the card
 * itself, or paid by another card. An unmarked payment names none, and pays the oldest invoice
 * still owed, as a bank does with money it was not told about.
 */
export type CardTouch =
	| { as: "charge"; month: CalendarMonth | null; amount: number }
	| { as: "paid" | "rolled" | "byCard"; month: CalendarMonth; amount: number }
	| { as: "unmarked"; amount: number };

/**
 * What one record does to the invoices of one card.
 *
 * 1. On the card, a purchase or a refund charges the invoice it names.
 * 2. A transfer out of the card is a purchase, with the sign of a purchase, on the invoice of
 *    its origin, or on its one invoice when it names none, which is every transfer out of a
 *    card written before 2.0.0.
 * 3. A transfer into the card pays the invoice it names: in money from an account of money,
 *    rolled when it comes from the card itself, by another card when that card named the
 *    invoice of its own side. From another card naming nothing of its own side, it was written
 *    before 2.0.0, and its one invoice is the one of the card it left, so here it is unmarked.
 *    A transfer naming no invoice is unmarked too.
 */
export function touchesOn(cardId: string, row: RowOnACard): CardTouch[] {
	const touches: CardTouch[] = [];
	if (row.accountId === cardId) {
		if (row.kind === "transfer") {
			touches.push({
				as: "charge",
				month: row.originInvoiceMonth ?? row.invoiceMonth,
				amount: row.amountInBase,
			});
		} else {
			touches.push({ as: "charge", month: row.invoiceMonth, amount: -row.amountInBase });
		}
	}
	if (row.kind === "transfer" && row.counterAccountId === cardId) {
		const itself = row.accountId === cardId;
		if (row.invoiceMonth === null) {
			touches.push({ as: "unmarked", amount: row.amountInBase });
		} else if (itself) {
			touches.push({ as: "rolled", month: row.invoiceMonth, amount: row.amountInBase });
		} else if (!row.leavesACard) {
			touches.push({ as: "paid", month: row.invoiceMonth, amount: row.amountInBase });
		} else if (row.originInvoiceMonth !== null) {
			touches.push({ as: "byCard", month: row.invoiceMonth, amount: row.amountInBase });
		} else {
			touches.push({ as: "unmarked", amount: row.amountInBase });
		}
	}
	return touches;
}
