// One payment, on one piece of paper.
//
// A receipt is not a small statement. It has one amount, one day and one other person,
// written as labels with the values beside them or underneath them, and it carries an
// identifier that the bank will use again if the same receipt is read twice. That
// identifier is worth more than everything else here: it is what stops a payment from
// being written down twice.

import type { CalendarDate } from "@cofre/core";
import { tidy } from "../text.ts";
import {
	currencyOf,
	findAmounts,
	findDate,
	findIdentifier,
	fold,
	institutionOf,
	type RecognisedDocument,
	type RecogniseOptions,
	yearOf,
} from "./document.ts";

const AMOUNT_LABEL = /^(valor|valor do pix|valor pago|valor total|amount|total)\b/;
const DATE_LABEL = /^(data|data do pagamento|data da transacao|realizado em|pago em|date)\b/;
const PAYEE_LABEL =
	/^(para|destinatario|recebedor|favorecido|beneficiario|quem recebeu|nome|estabelecimento|to|payee)\b/;
const PAYER_LABEL = /^(de|pagador|quem pagou|origem|remetente|from|payer)\b/;
const RECEIVED = /recebido|received|credito em conta|voce recebeu/;

/** What is written after a label, or on the line under it when the label stands alone. */
function valueAfter(lines: readonly string[], index: number, label: RegExp): string {
	const line = tidy(lines[index] ?? "");
	const folded = fold(line);
	const found = label.exec(folded);
	if (!found) return "";

	const rest = tidy(line.slice(found[0].length).replace(/^[\s:.-]+/, ""));
	if (rest !== "") return rest;

	// A label alone on its line belongs to the line under it, which is how a receipt
	// made of two columns comes out once it is read as lines.
	return tidy(lines[index + 1] ?? "");
}

function firstWhere(
	lines: readonly string[],
	label: RegExp,
): { index: number; value: string } | null {
	for (let index = 0; index < lines.length; index += 1) {
		const value = valueAfter(lines, index, label);
		if (value !== "") return { index, value };
	}
	return null;
}

/**
 * Reads a receipt.
 *
 * The amount is the one the document labels, and when it labels none, the largest one
 * on the page, because a receipt shows what was paid in larger type than anything else
 * and every other number on it is a fragment of an account number.
 */
export function recogniseReceipt(
	lines: readonly string[],
	options: RecogniseOptions = {},
): RecognisedDocument {
	const today = options.today ?? "2026-01-01";
	const year = yearOf(lines, today);
	const order = options.order ?? "dayFirst";
	const currency = currencyOf(lines);

	const labelledAmount = firstWhere(lines, AMOUNT_LABEL);
	const fromLabel = labelledAmount ? findAmounts(labelledAmount.value)[0] : undefined;

	const everyAmount = lines.flatMap((line) => findAmounts(line));
	const largest = [...everyAmount].sort(
		(left, right) => Math.abs(right.value) - Math.abs(left.value),
	)[0];

	const chosen = fromLabel ?? largest;

	const labelledDate = firstWhere(lines, DATE_LABEL);
	const day: CalendarDate | null =
		(labelledDate ? findDate(labelledDate.value, order, year)?.day : null) ??
		lines.reduce<CalendarDate | null>(
			(found, line) => found ?? findDate(line, order, year)?.day ?? null,
			null,
		);

	const payee = firstWhere(lines, PAYEE_LABEL);
	const payer = firstWhere(lines, PAYER_LABEL);
	const received = RECEIVED.test(fold(lines.slice(0, 15).join(" ")));

	const other = received ? (payer?.value ?? payee?.value) : (payee?.value ?? payer?.value);
	const identifier = lines.map((line) => findIdentifier(line)).find((value) => value !== null);

	const institution = institutionOf(lines);
	const description = tidy(other ?? institution ?? "Comprovante");

	const entries: RecognisedDocument["entries"] = [];
	const unread: RecognisedDocument["unread"] = [];

	if (chosen && day !== null && chosen.value !== 0) {
		// A receipt names one direction in words, and the words are all there is.
		const amount = received ? Math.abs(chosen.value) : -Math.abs(chosen.value);

		let confidence = 0.7;
		if (fromLabel) confidence += 0.1;
		if (labelledDate) confidence += 0.05;
		if (other) confidence += 0.05;
		if (identifier) confidence += 0.05;

		entries.push({
			happenedOn: day,
			amount,
			description: description.slice(0, 120),
			confidence: Math.min(0.99, confidence),
			externalId: identifier ?? null,
			line: labelledAmount?.index !== undefined ? labelledAmount.index + 1 : 1,
			source: tidy(lines.join(" ")).slice(0, 200),
		});
	} else {
		unread.push({ line: 1, text: tidy(lines.join(" ")).slice(0, 200) });
	}

	return {
		kind: "receipt",
		institution,
		currency,
		period: null,
		dueOn: null,
		total: chosen ? Math.abs(chosen.value) : null,
		entries,
		unread,
		confidence: entries[0]?.confidence ?? 0,
	};
}
