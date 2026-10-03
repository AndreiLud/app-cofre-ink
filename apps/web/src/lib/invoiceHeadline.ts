// The sentence at the top of the invoice screen.

import type { InvoiceState } from "@cofre/core";

/**
 * The sentence at the top says where this invoice stands, which is the thing a person
 * opens the screen to find out.
 *
 * Paid comes before every question about days, because an invoice that is settled is not
 * one anybody needs to be told is three days late. Before the invoice has been read there
 * is nothing to say about its days: the sentence asked for a count of nought then, which
 * Portuguese counts as one, and the screen said the invoice closed tomorrow until it knew.
 */
export function invoiceHeadline(
	t: (key: string, values?: Record<string, unknown>) => string,
	month: string,
	card: string,
	state: InvoiceState | undefined,
): string {
	// The card first and then the sentence, which reads right whatever the card is called:
	// "da fatura do Caixa" is wrong in Portuguese, and "Caixa: a fatura" never is.
	if (!state) return t("invoice.headline", { month, card });
	if (state.standing === "paid") return t("invoice.paidHeadline", { month, card });
	if (state.standing === "inCredit") return t("invoice.inCreditHeadline", { month, card });
	// Settled and still being paid, on the invoices after it: never late, nothing to pay here.
	if (state.standing === "inParts") return t("invoice.inPartsHeadline", { month, card });
	if (state.daysToClose > 0) {
		return t("invoice.openHeadline", { month, card, count: state.daysToClose });
	}
	if (state.daysToDue > 0) {
		return t("invoice.closedHeadline", { month, card, count: state.daysToDue });
	}
	if (state.daysToDue === 0) return t("invoice.dueTodayHeadline", { month, card });
	return t("invoice.pastHeadline", { month, card, count: Math.abs(state.daysToDue) });
}
