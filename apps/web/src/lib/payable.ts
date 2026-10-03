// Whether an invoice is offered to be paid from its screen.

import { amountToPay, type InvoiceState } from "@cofre/core";

/**
 * Something is owed on it, and it has an honest total.
 *
 * An invoice holding a purchase in another currency with no rate for its day has no total,
 * and the screen said so above a button that offered to pay one: the amount it proposed left
 * that purchase out, so paying it would have marked the invoice paid short.
 */
export function payable(state: InvoiceState | undefined): state is InvoiceState {
	return state !== undefined && state.withoutRate === 0 && amountToPay(state) > 0;
}
