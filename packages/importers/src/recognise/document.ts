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
import { guessDateOrder, readAmount, readDate, tidy } from "../text.ts";

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

/** Words that mean money came in, whatever the rest of the document is about. */
const MONEY_IN = [
	"pagamento recebido",
	"pagamento efetuado",
	"estorno",
	"credito",
	"devolucao",
	"reembolso",
	"recebido",
	"deposito",
	"salario",
	"rendimento",
	"transferencia recebida",
	"pix recebido",
	"refund",
	"payment received",
	"deposit",
	"credit",
];

const MONEY_OUT = [
	"compra",
	"debito",
	"saque",
	"pagamento de",
	"transferencia enviada",
	"pix enviado",
	"tarifa",
	"anuidade",
	"juros",
	"iof",
	"withdrawal",
	"purchase",
	"fee",
];

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

const AMOUNT_TOKEN =
	/(?:R\$|BRL|US\$|USD|\$|€)?\s?-?\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?(?:\s?[DC])?|(?:R\$|USD|\$|€)?\s?-?\(?\d{1,3}(?:,\d{3})*\.\d{2}\)?(?:\s?[DC])?/g;

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

export type FoundAmount = { value: number; text: string; at: number; signed: boolean };

export function findAmounts(line: string): FoundAmount[] {
	AMOUNT_TOKEN.lastIndex = 0;
	const found: FoundAmount[] = [];

	let match = AMOUNT_TOKEN.exec(line);
	while (match) {
		const text = match[0].trim();
		const value = readAmount(text);
		if (value !== null) {
			found.push({
				value,
				text,
				at: match.index,
				signed: /^[-(]|^R?\$?\s?-|[DC]$/.test(text),
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

/** What the description says about the direction, when it says anything. */
export function directionOf(description: string): 1 | -1 | 0 {
	const folded = fold(description);
	if (MONEY_IN.some((word) => folded.includes(word))) return 1;
	if (MONEY_OUT.some((word) => folded.includes(word))) return -1;
	return 0;
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

	// A running balance in the last column is the surest thing in a statement: the
	// direction of an entry is the direction the balance moved.
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
		const said = directionOf(description === "" ? line : description);

		let amount = chosen.value;
		let confidence = 0.55;

		if (fromBalance && balance && previousBalance !== null) {
			amount = balance.value >= previousBalance ? Math.abs(chosen.value) : -Math.abs(chosen.value);
			confidence = 0.95;
		} else if (chosen.signed) {
			confidence = 0.9;
		} else if (said !== 0) {
			amount = said * Math.abs(chosen.value);
			confidence = 0.8;
		} else if (kind === "invoice") {
			// Every line of a card invoice is a charge unless it says otherwise.
			amount = -Math.abs(chosen.value);
			confidence = 0.75;
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
		entries,
		unread,
		confidence: Math.max(0, average - penalty),
	};
}
