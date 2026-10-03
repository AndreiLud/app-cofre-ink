// From lines of text to records somebody can check.
//
// This is the second layer: it knows nothing about PDFs and everything about what a
// statement looks like. It is given lines and gives back what it believes each one
// says, with how sure it is about each one, because a number it is not sure about has
// to arrive marked rather than quietly wrong.
//
// Nothing here writes anything, and nothing here decides. Every record it produces goes
// on a screen next to the line it came from, and a person says yes.

import type { CalendarDate } from "@cofre/core";
import { guessDateOrder, readAmount, readDate, tidy, type WrittenSign } from "../text.ts";

export type DocumentKind = "statement" | "invoice" | "receipt" | "unknown";

export type RecognisedEntry = {
	happenedOn: CalendarDate;
	/** Signed minor units. Negative is money leaving, as everywhere else. */
	amount: number;
	description: string;
	/** Zero to one. Under two thirds the screen asks the person to look. */
	confidence: number;
	/** What the bank called it, when the line carried an identifier. */
	externalId: string | null;
	/** The line it came from, so the person can compare. */
	line: number;
	source: string;
};

export type RecognisedDocument = {
	kind: DocumentKind;
	/** The name of the bank, when the document says it plainly. */
	institution: string | null;
	currency: string;
	period: { from: CalendarDate; to: CalendarDate } | null;
	/** When an invoice falls due. */
	dueOn: CalendarDate | null;
	/** What the document says it adds up to, in minor units and always positive. */
	total: number | null;
	/** How an invoice writes a purchase. Nothing on any other document. */
	convention: InvoiceConvention | null;
	entries: RecognisedEntry[];
	/** Lines that looked like they held money and could not be read. */
	unread: { line: number; text: string }[];
	confidence: number;
};

const MONTHS: Record<string, number> = {
	jan: 1,
	fev: 2,
	feb: 2,
	mar: 3,
	abr: 4,
	apr: 4,
	mai: 5,
	may: 5,
	jun: 6,
	jul: 7,
	ago: 8,
	aug: 8,
	set: 9,
	sep: 9,
	out: 10,
	oct: 10,
	nov: 11,
	dez: 12,
	dec: 12,
};

const INSTITUTIONS = [
	"Nubank",
	"Itau",
	"Bradesco",
	"Santander",
	"Banco do Brasil",
	"Caixa",
	"Inter",
	"C6",
	"BTG",
	"XP",
	"PicPay",
	"Mercado Pago",
	"PagBank",
	"Sicoob",
	"Sicredi",
	"Banrisul",
	"Safra",
	"Original",
	"Neon",
	"Will",
	"Digio",
	"Agibank",
	"BMG",
	"Pan",
	"Daycoval",
	"Revolut",
	"Wise",
	"N26",
];

/**
 * Words that say which way the money went, one list for each kind of document, matched as
 * whole words. One list for both, matched inside words, read "cartao de credito" as money
 * coming in. They decide only a line that carries no sign of its own.
 */
const STATEMENT_IN = [
	"pix recebido",
	"transferencia recebida",
	"ted recebida",
	"doc recebido",
	"credito em conta",
	"recebido",
	"recebida",
	"deposito",
	"salario",
	"rendimento",
	"rendimentos",
	"estorno",
	"devolucao",
	"reembolso",
	"refund",
	"deposit",
	"received",
	"salary",
];

const STATEMENT_OUT = [
	"pix enviado",
	"transferencia enviada",
	"ted enviada",
	"compra",
	"saque",
	"pagamento",
	"pagto",
	"pgto",
	"tarifa",
	"anuidade",
	"juros",
	"iof",
	"debito",
	"withdrawal",
	"purchase",
	"payment",
	"fee",
];

/** On a card invoice, what gives money back to the card: a refund, or the bill being paid. */
const INVOICE_BACK = [
	"estorno",
	"estornada",
	"estornado",
	"devolucao",
	"reembolso",
	"cashback",
	"ajuste a credito",
	"pagamento",
	"pagto",
	"pgto",
	"pag fatura",
	"debito automatico",
	"refund",
	"payment",
];

/** Whether a phrase is in a text as whole words. Both are folded first. */
export function saysWord(folded: string, phrase: string): boolean {
	const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
	return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(folded);
}

/**
 * Lines that are furniture: a heading, a total, a page number.
 *
 * Two lists, because a balance carries the date of the day in front of it and a total
 * does not. "Total" anywhere in a line would throw away a purchase at a shop called
 * Total, so that one is only furniture when the line opens with it.
 */
const FURNITURE_ANYWHERE = [
	"saldo anterior",
	"saldo do dia",
	"saldo final",
	"saldo em conta",
	"total desta fatura",
	"total da fatura",
	"limite total",
	"limite disponivel",
	"pagamento minimo",
	"previous balance",
	"closing balance",
];

const FURNITURE_AT_START = [
	"saldo",
	"valor total",
	"total a pagar",
	"total",
	"subtotal",
	"data descricao",
	"data historico",
	"data lancamento",
	"date description",
	"pagina",
	"page",
];

export function fold(text: string): string {
	return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** A sign, written by a keyboard or a typesetter. Escaped, so it can be read here. */
const SIGN = "[-+\\u2212\\u2013\\u2014]";
const MARK = "(?:R\\$|US\\$|BRL|USD|EUR|\\u20ac|\\$)";
/**
 * The digits of an amount: grouped by thousands or not, with two decimals. "TED 12345,67"
 * was read as 345,67, because only a number grouped in threes was looked for and the reading
 * began wherever three digits were left.
 */
const DIGITS =
	"(?:\\d{1,3}(?:\\.\\d{3})+,\\d{2}|\\d+,\\d{2}|\\d{1,3}(?:,\\d{3})+\\.\\d{2}|\\d+\\.\\d{2})(?![.,]?\\d)";
/**
 * A C or a D is a direction only alone at the end of the line or before another amount.
 * Against the next word it read "18,40 Centro" as eighteen reais forty coming in.
 */
const LETTER = `(?:\\s?[DCdc](?=\\s*$|\\s+(?:${SIGN}|\\(|${MARK}|\\d)))`;
const AMOUNT_TOKEN = new RegExp(
	`(?<![\\w.,])(?:\\(\\s?)?(?:${SIGN}\\s?)?(?:${MARK}\\s?)?(?:${SIGN}\\s?)?${DIGITS}(?:\\s?\\))?(?:[-\\u2212](?!\\d))?${LETTER}?`,
	"g",
);

const DATE_TOKEN = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/;
const NAMED_DATE = /\b(\d{1,2})\s?(?:de\s)?([a-z]{3})[a-z]*\.?\s?(\d{2,4})?\b/i;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;

export type FoundDate = { day: CalendarDate | null; text: string; at: number; sure: boolean };

/** The first date a line names, in whatever shape the bank wrote it. */
export function findDate(
	line: string,
	order: Parameters<typeof readDate>[1],
	year: number,
): FoundDate | null {
	const iso = ISO_DATE.exec(line);
	if (iso) {
		return { day: readDate(iso[0]), text: iso[0], at: iso.index, sure: true };
	}

	const separated = DATE_TOKEN.exec(line);
	if (separated) {
		const written = separated[3]
			? separated[0]
			: `${separated[1]}/${separated[2]}/${String(year).slice(-4)}`;
		return {
			day: readDate(written, order),
			text: separated[0],
			at: separated.index,
			// A day with no year in it is a day that needed the document to say which.
			sure: Boolean(separated[3]),
		};
	}

	const named = NAMED_DATE.exec(line);
	if (named) {
		const month = MONTHS[fold(named[2] ?? "").slice(0, 3)];
		if (month !== undefined) {
			const written = `${named[1]}/${month}/${named[3] ?? String(year)}`;
			return {
				day: readDate(written, "dayFirst"),
				text: named[0],
				at: named.index,
				sure: Boolean(named[3]),
			};
		}
	}

	return null;
}

export type FoundAmount = {
	value: number;
	text: string;
	at: number;
	/** Whether the text carried a direction at all. */
	signed: boolean;
	/** How it carried it, which decides how far it is trusted. */
	sign: WrittenSign;
};

export function findAmounts(line: string): FoundAmount[] {
	AMOUNT_TOKEN.lastIndex = 0;
	const found: FoundAmount[] = [];

	let match = AMOUNT_TOKEN.exec(line);
	while (match) {
		const text = match[0].trim();
		const read = readAmount(text);
		if (read !== null) {
			found.push({
				value: read.value,
				text,
				at: match.index + (match[0].length - match[0].trimStart().length),
				signed: read.sign !== "none",
				sign: read.sign,
			});
		}
		match = AMOUNT_TOKEN.exec(line);
	}

	return found;
}

export function kindOf(lines: readonly string[]): DocumentKind {
	const opening = fold(lines.slice(0, 6).join(" "));
	const all = fold(lines.join(" "));

	// A receipt says what it is at the top and holds one payment. A statement that
	// happens to list a transfer is still a statement, and what tells them apart is how
	// many lines on the page carry money.
	const withMoney = lines.filter((line) => findAmounts(line).length > 0).length;
	if (/comprovante|recibo|receipt|transferencia realizada/.test(opening)) {
		if (withMoney <= 4 && lines.length <= 40) return "receipt";
	}

	if (/fatura|cartao de credito|credit card|invoice|vencimento/.test(all)) return "invoice";
	if (/extrato|statement|saldo/.test(all)) return "statement";
	return "unknown";
}

export function institutionOf(lines: readonly string[]): string | null {
	const head = fold(lines.slice(0, 25).join(" "));
	for (const name of INSTITUTIONS) {
		if (head.includes(fold(name))) return name;
	}
	return null;
}

export function currencyOf(lines: readonly string[]): string {
	const all = lines.join(" ");
	if (/US\$|USD/.test(all)) return "USD";
	if (/€|EUR/.test(all)) return "EUR";
	return "BRL";
}

export function yearOf(lines: readonly string[], today: CalendarDate): number {
	for (const line of lines) {
		const withYear = /\b\d{1,2}[/.-]\d{1,2}[/.-](\d{4})\b/.exec(line);
		if (withYear?.[1]) return Number(withYear[1]);
		const iso = ISO_DATE.exec(line);
		if (iso?.[1]) return Number(iso[1]);
	}
	return Number(today.slice(0, 4));
}

export function labelled(
	lines: readonly string[],
	words: RegExp,
): { line: string; index: number } | null {
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		if (words.test(fold(line))) return { line, index };
	}
	return null;
}

/** True for the lines of a statement that are about the page rather than about money. */
export function isFurniture(line: string): boolean {
	const folded = fold(line).trim();
	// A balance keeps the day in front of it, so the date is stepped over first.
	const afterTheDate = folded.replace(/^\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\s*/, "").trim();

	if (FURNITURE_ANYWHERE.some((word) => folded.includes(word))) return true;
	return FURNITURE_AT_START.some((word) => afterTheDate.startsWith(word) || afterTheDate === word);
}

/**
 * What the description says about the direction, when it says anything, in the words of
 * the kind of document it is on. On an invoice a line says only that money came back.
 */
export function directionOf(description: string, kind: DocumentKind = "statement"): 1 | -1 | 0 {
	const folded = fold(description);
	if (kind === "invoice") return INVOICE_BACK.some((word) => saysWord(folded, word)) ? 1 : 0;
	if (STATEMENT_IN.some((word) => saysWord(folded, word))) return 1;
	if (STATEMENT_OUT.some((word) => saysWord(folded, word))) return -1;
	return 0;
}

/**
 * How a card invoice writes a purchase. Most write it as a positive number and a refund or a
 * payment as a negative one; some the other way round. A statement has no convention: there
 * a negative number is money leaving.
 */
export type InvoiceConvention = "chargesPositive" | "chargesNegative";

/** A sign that turns the convention round: a minus, parentheses, a minus after the number. */
const INVERTING: readonly WrittenSign[] = ["minus", "parentheses", "trailingMinus"];

/**
 * The convention of an invoice, by its lines when nothing surer decides it: the way most of
 * them are written is the way a purchase is written, and a tie is the common case.
 */
export function conventionOf(amounts: readonly FoundAmount[]): InvoiceConvention {
	const inverted = amounts.filter((amount) => INVERTING.includes(amount.sign)).length;
	return inverted > amounts.length - inverted ? "chargesNegative" : "chargesPositive";
}

/**
 * One line of an invoice under a convention: its direction and how sure that is.
 *
 * A D or a C says it outright. A minus, parentheses or a minus at the end turn the line
 * round from what the convention says a written number is. A plus is not trusted, because
 * banks disagree about what it means. A line with no sign is a purchase under a convention
 * of positive charges, unless its words say money came back.
 */
export function invoiceDirection(
	amount: FoundAmount,
	convention: InvoiceConvention,
	said: 1 | -1 | 0,
): { direction: 1 | -1; confidence: number } {
	if (amount.sign === "letter") return { direction: amount.value < 0 ? -1 : 1, confidence: 0.9 };
	const plain = convention === "chargesPositive" ? -1 : 1;
	if (INVERTING.includes(amount.sign)) {
		return { direction: plain === -1 ? 1 : -1, confidence: 0.9 };
	}
	if (amount.sign === "plus" || amount.sign === "spacedMinus") {
		const direction = amount.sign === "plus" ? plain : plain === -1 ? 1 : -1;
		return { direction, confidence: 0.6 };
	}
	if (said === 1) return { direction: 1, confidence: 0.8 };
	return { direction: plain, confidence: 0.75 };
}

const IDENTIFIER_LABEL = /(?:\bid\b|\be2e\b|\bnsu\b|autentica|documento|\bdoc\b|\bref\b|c[oó]digo)/;

/**
 * The code a bank puts on a payment so that it can be talked about later.
 *
 * The label and the code are often a few words apart ("ID da transacao: E1823..."), so
 * the label is found first and then the first run of letters and numbers after it that
 * has a digit in it, because a word never does and an identifier always does.
 */
export function findIdentifier(line: string): string | null {
	const label = IDENTIFIER_LABEL.exec(line.toLowerCase());
	if (!label) return null;

	const after = line.slice(label.index + label[0].length);
	for (const token of after.match(/\b[A-Za-z0-9]{8,40}\b/g) ?? []) {
		if (/\d/.test(token)) return token;
	}
	return null;
}

export type RecogniseOptions = {
	today?: CalendarDate;
	/** Given when the person has said which way round the days go. */
	order?: "dayFirst" | "monthFirst" | "yearFirst";
	/** Given when the person turned the signs of an invoice round on the screen. */
	convention?: InvoiceConvention;
};

/**
 * Reads a document.
 *
 * The rule that does most of the work: a line that names a day and an amount is an
 * entry, and everything between the two is what it was. The rest is deciding the sign,
 * which is the part that can be wrong, so every way of deciding it carries a different
 * confidence and the least sure of them lands on the screen asking to be looked at.
 */
export function recogniseStatement(
	lines: readonly string[],
	options: RecogniseOptions = {},
): RecognisedDocument {
	const today = options.today ?? "2026-01-01";
	const kind = kindOf(lines);
	const currency = currencyOf(lines);
	const year = yearOf(lines, today);
	const order =
		options.order ?? guessDateOrder(lines.flatMap((line) => line.match(/\d[\d/.-]{5,}/g) ?? []));

	const entries: RecognisedEntry[] = [];
	const unread: { line: number; text: string }[] = [];
	/** The lines of an invoice, kept until its convention is known. */
	const charges: {
		index: number;
		line: string;
		day: CalendarDate;
		sure: boolean;
		chosen: FoundAmount;
		description: string;
	}[] = [];

	// A running balance in the last column is the surest thing in a statement: the
	// direction of an entry is the direction the balance moved. An invoice has none.
	let previousBalance: number | null = null;

	lines.forEach((text, index) => {
		const line = tidy(text);
		if (line === "") return;

		const amounts = findAmounts(line);
		if (amounts.length === 0) return;

		if (isFurniture(line)) {
			// The balance a statement opens with is not an entry, and it is exactly what
			// the first real entry needs to have its direction read from.
			if (amounts.length === 1 && /saldo|balance/.test(fold(line))) {
				previousBalance = amounts[0]?.value ?? previousBalance;
			}
			return;
		}

		const date = findDate(line, order, year);
		if (!date || date.day === null) {
			// It held money and named no day. Worth telling the person about, because a
			// statement where these pile up is one this reader did not understand.
			if (!isFurniture(line)) unread.push({ line: index + 1, text: line });
			return;
		}

		// The amount is the last one on the line, unless the last one is a balance.
		let chosen = amounts[amounts.length - 1];
		let balance: FoundAmount | null = null;
		let fromBalance = false;

		if (kind === "invoice") {
			if (!chosen) return;
			const start = Math.max(date.at + date.text.length, 0);
			charges.push({
				index,
				line,
				day: date.day,
				sure: date.sure,
				chosen,
				description: tidy(line.slice(start, chosen.at).replace(/^[\s|:;.-]+/, "")),
			});
			return;
		}

		if (amounts.length >= 2) {
			const last = amounts[amounts.length - 1];
			const before = amounts[amounts.length - 2];
			if (last && before) {
				const moved = previousBalance === null ? null : last.value - previousBalance;
				if (moved !== null && Math.abs(Math.abs(moved) - Math.abs(before.value)) <= 1) {
					chosen = before;
					balance = last;
					fromBalance = true;
				} else if (previousBalance === null) {
					// The first line has nothing to compare against. Two amounts with the
					// second one much larger is the shape of value and balance.
					chosen = before;
					balance = last;
				}
			}
		}

		if (!chosen) return;

		const start = Math.max(date.at + date.text.length, 0);
		const description = tidy(line.slice(start, chosen.at).replace(/^[\s|:;.-]+/, ""));
		const said = directionOf(description === "" ? line : description, "statement");

		let amount = chosen.value;
		let confidence = 0.55;

		if (fromBalance && balance && previousBalance !== null) {
			amount = balance.value >= previousBalance ? Math.abs(chosen.value) : -Math.abs(chosen.value);
			confidence = 0.95;
		} else if (chosen.sign === "spacedMinus") {
			// " - " is also what separates two words, so a minus with a space after it is read
			// and shown to be checked.
			confidence = 0.6;
		} else if (chosen.signed) {
			confidence = 0.9;
		} else if (said !== 0) {
			amount = said * Math.abs(chosen.value);
			confidence = 0.8;
		} else {
			amount = -Math.abs(chosen.value);
			confidence = 0.5;
		}

		if (date.sure) confidence += 0.03;
		if (description.length >= 4) confidence += 0.02;

		if (balance) previousBalance = balance.value;

		if (amount === 0) {
			unread.push({ line: index + 1, text: line });
			return;
		}

		entries.push({
			happenedOn: date.day,
			amount,
			description: description === "" ? tidy(line) : description,
			confidence: Math.min(0.99, confidence),
			externalId: findIdentifier(line),
			line: index + 1,
			source: line,
		});
	});

	// The sign written on an invoice means what its convention says it means, so the lines wait
	// for it. It was read the same way on every document: a refund written as a negative number
	// on an invoice that writes purchases as positive ones became a purchase.
	const convention =
		kind === "invoice"
			? (options.convention ?? conventionOf(charges.map((charge) => charge.chosen)))
			: null;
	for (const charge of charges) {
		if (charge.chosen.value === 0) {
			unread.push({ line: charge.index + 1, text: charge.line });
			continue;
		}
		const said = directionOf(
			charge.description === "" ? charge.line : charge.description,
			"invoice",
		);
		const read = invoiceDirection(charge.chosen, convention ?? "chargesPositive", said);
		let confidence = read.confidence;
		if (charge.sure) confidence += 0.03;
		if (charge.description.length >= 4) confidence += 0.02;
		entries.push({
			happenedOn: charge.day,
			amount: read.direction * Math.abs(charge.chosen.value),
			description: charge.description === "" ? charge.line : charge.description,
			confidence: Math.min(0.99, confidence),
			externalId: findIdentifier(charge.line),
			line: charge.index + 1,
			source: charge.line,
		});
	}
	entries.sort((left, right) => left.line - right.line);

	const due = labelled(lines, /vencimento|vence em|pagar ate|due date|payment due/);
	const dueOn = due ? (findDate(due.line, order, year)?.day ?? null) : null;

	const totalLine = labelled(lines, /total desta fatura|total da fatura|valor total|total a pagar/);
	const totalAmounts = totalLine ? findAmounts(totalLine.line) : [];
	const total =
		totalAmounts.length > 0 ? Math.abs(totalAmounts[totalAmounts.length - 1]?.value ?? 0) : null;

	const periodLine = labelled(lines, /periodo|per[ií]odo|de .* (a|ate) |from .* to /);
	let period: RecognisedDocument["period"] = null;
	if (periodLine) {
		const days = [
			...(periodLine.line.match(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}/g) ?? []),
		]
			.map((token) => readDate(token, order))
			.filter((day): day is CalendarDate => day !== null);
		const from = days[0];
		const to = days[days.length - 1];
		if (days.length >= 2 && from !== undefined && to !== undefined) {
			period = { from, to };
		}
	}

	const average =
		entries.length === 0
			? 0
			: entries.reduce((sum, entry) => sum + entry.confidence, 0) / entries.length;
	const penalty = entries.length === 0 ? 0 : Math.min(0.3, unread.length / (entries.length + 1));

	return {
		kind,
		institution: institutionOf(lines),
		currency,
		period,
		dueOn,
		total,
		convention,
		entries,
		unread,
		confidence: Math.max(0, average - penalty),
	};
}
