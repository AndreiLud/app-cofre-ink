// What a line of a file is, apart from which way the money went.
//
// The sign says whether money left or came back. It does not say whether a line on an
// invoice was a purchase, a fee the bank charged, a refund or the bill being paid, and
// those are written differently: a payment is a transfer from an account of money, not
// income on the card, and a refund is a purchase taken back. So every line gets a nature
// here, for every format, read from its words and the kind of document it is on.

import type { DocumentKind } from "./recognise/document.ts";
import { fold, saysWord } from "./text.ts";

export type Nature =
	| "purchase"
	| "fee"
	| "credit"
	| "installment"
	| "payment"
	/** On a statement of an account: the money that paid a card's invoice. */
	| "cardPayment";

const FEES = ["iof", "juros", "multa", "mora", "anuidade", "tarifa", "encargos", "seguro"];

const CREDITS = [
	"estorno",
	"estornada",
	"estornado",
	"devolucao",
	"reembolso",
	"cashback",
	"ajuste a credito",
	"refund",
];

/** On an invoice: the bill being paid. */
const PAYMENTS = ["pagamento", "pagto", "pgto", "pag fatura", "debito automatico", "payment"];

/** On a statement: money that went to pay a card. */
const CARD_PAYMENTS = [
	/\b(?:pagto|pgto|pag)\b.*\b(?:fatura|cartao)\b/,
	/\bpagamento (?:de |da )?fatura\b/,
	/\bpagamento (?:do |de )?cartao\b/,
];

export type NatureOptions = {
	/** The banks of the cards written down, so "FATURA NUBANK" on a statement is a card paid. */
	cardBanks?: readonly string[];
	/** The line carries the mark of a part of a plan. */
	installment?: boolean;
};

export function natureOf(
	description: string,
	kind: DocumentKind,
	options: NatureOptions = {},
): Nature {
	const folded = fold(description);
	const says = (words: readonly string[]) => words.some((word) => saysWord(folded, word));

	if (kind === "invoice") {
		if (says(PAYMENTS)) return "payment";
		if (says(CREDITS)) return "credit";
		if (says(FEES)) return "fee";
		if (options.installment) return "installment";
		return "purchase";
	}

	if (CARD_PAYMENTS.some((pattern) => pattern.test(folded))) return "cardPayment";
	const namesACard = (options.cardBanks ?? []).some((name) => {
		const bank = fold(name).trim();
		return bank !== "" && new RegExp(`\\bfatura\\b.*\\b${escaped(bank)}\\b`).test(folded);
	});
	if (namesACard) return "cardPayment";
	if (says(CREDITS)) return "credit";
	if (says(FEES)) return "fee";
	if (options.installment) return "installment";
	return "purchase";
}

function escaped(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
