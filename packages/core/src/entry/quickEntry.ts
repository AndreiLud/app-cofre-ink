// Reading a line of text the way a person writes it.
//
// "ifood 42,90 ontem nubank" is one record. Typing it should not cost five fields and
// four taps. What this does is read the line and say what it understood, so the screen
// can show that back before anything is written. It never guesses silently: whatever it
// could not find is reported, and whatever it did find can be corrected.
//
// The vocabulary holds Portuguese and English at the same time, on purpose. Nobody has
// to switch language to write "uber 30 today", and no word in one list collides with a
// word in the other.

import { type CurrencyCode, DEFAULT_CURRENCY, MoneyError } from "../money/money.ts";
import { parseMoney } from "../money/parse.ts";
import {
	addDays,
	type CalendarDate,
	clampDay,
	daysBetween,
	formatCalendarDate,
	parseCalendarDate,
} from "../time/calendar.ts";

export type QuickEntryKind = "expense" | "income";
export type QuickEntryStatus = "settled" | "planned";

/** Only what matching a name needs, so this stays free of the storage types. */
/**
 * A way to pay, by the name somebody would write on a line.
 *
 * An account is one. A card is another, and it names the account it reaches, because
 * "mercado 80 no nubank" says where the money is charged as surely as naming the account
 * does, and until now the reader knew only the account names and so read nothing.
 */
export type QuickEntryAccount = {
	/** The account the money is charged to. */
	id: string;
	name: string;
	/** Set when this name is a card rather than the account itself. */
	cardId?: string | null;
	/**
	 * Which side of a card that does both this entry is: a cartao multiplo is named once on a
	 * line and reaches two accounts, and "debito" or "credito" on the line says which.
	 */
	side?: "credit" | "debit" | null;
	/**
	 * Whether money coming in can land here. Not on a card and not on a benefit card: a salary
	 * read off a line that named the bank whose card has the same name went onto the card.
	 */
	takesIncome?: boolean;
};

export type QuickEntryOptions = {
	today: CalendarDate;
	accounts?: readonly QuickEntryAccount[];
	currency?: CurrencyCode;
};

/** What is missing before this can be written. Everything else has an answer. */
export type QuickEntryProblem = "amountMissing" | "descriptionMissing";

export type QuickEntryReading = {
	kind: QuickEntryKind;
	status: QuickEntryStatus;
	/** Positive minor units. The direction lives in the kind, as everywhere else. */
	amount: number | null;
	currency: CurrencyCode;
	happenedOn: CalendarDate;
	description: string;
	accountId: string | null;
	/** The card named on the line, when what was named was a card rather than an account. */
	cardId: string | null;
	installments: number;
	problems: QuickEntryProblem[];
};

const TODAY = ["hoje", "today"];
const YESTERDAY = ["ontem", "yesterday"];
const BEFORE_YESTERDAY = ["anteontem"];
const TOMORROW = ["amanha", "tomorrow"];
const DAY_MARKER = ["dia", "day"];

const INCOME_WORDS = [
	"recebi",
	"recebido",
	"salario",
	"entrou",
	"ganhei",
	"deposito",
	"received",
	"salary",
	"income",
];
const EXPENSE_WORDS = ["paguei", "gastei", "comprei", "spent", "paid", "bought"];
const PLANNED_WORDS = ["vence", "previsto", "prevista", "agendado", "agendada", "due", "planned"];

/** Dropped from the description only when they lead into something that was read. */
const LINKING_WORDS = [
	"no",
	"na",
	"nos",
	"nas",
	"em",
	"de",
	"do",
	"da",
	"dos",
	"das",
	"pelo",
	"pela",
	"com",
	"at",
	"in",
	"on",
	"from",
	"the",
	"with",
];

/** Currency noise. The currency of the record comes from the account, not from here. */
const CURRENCY_WORDS = ["r$", "rs", "$", "brl", "reais", "real", "conto", "pila"];

const INSTALLMENTS_WORDS = ["vezes", "parcelas", "x", "times"];

const AMOUNT = /^[\d.,]+$/;
const INSTALLMENT = /^(\d{1,2})x$/;
const SHORT_DATE = /^(\d{1,2})\/(\d{1,2})$/;
const FULL_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_ONLY = /^(\d{1,2})$/;

/** Lowercase and without accents, so "refeição" and "refeicao" are the same word. */
function fold(text: string): string {
	return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function wordsOf(name: string): string[] {
	return fold(name)
		.replace(/[^\p{Letter}\p{Number}]+/gu, " ")
		.trim()
		.split(" ")
		.filter((word) => word !== "");
}

/**
 * A day written as day and month belongs to this year. Bills fall due months ahead, so
 * the future is not suspicious by itself. More than half a year ahead is: somebody
 * writing "20/12" in January means the December that just passed.
 */
function yearFor(day: number, month: number, today: CalendarDate): number {
	const here = parseCalendarDate(today);
	const candidate = formatCalendarDate(here.year, month, clampDay(here.year, month, day));
	return daysBetween(today, candidate) > 183 ? here.year - 1 : here.year;
}

function dateFrom(token: string, today: CalendarDate): CalendarDate | null {
	if (ISO_DATE.test(token)) {
		try {
			parseCalendarDate(token);
			return token;
		} catch {
			return null;
		}
	}

	const full = FULL_DATE.exec(token);
	if (full) {
		const day = Number(full[1]);
		const month = Number(full[2]);
		const written = Number(full[3]);
		const year = written < 100 ? 2000 + written : written;
		if (month < 1 || month > 12) return null;
		return formatCalendarDate(year, month, clampDay(year, month, day));
	}

	const short = SHORT_DATE.exec(token);
	if (short) {
		const day = Number(short[1]);
		const month = Number(short[2]);
		if (month < 1 || month > 12) return null;
		const year = yearFor(day, month, today);
		return formatCalendarDate(year, month, clampDay(year, month, day));
	}

	return null;
}

function dayOfThisMonth(day: number, today: CalendarDate): CalendarDate {
	const here = parseCalendarDate(today);
	return formatCalendarDate(here.year, here.month, clampDay(here.year, here.month, day));
}

type Role = "amount" | "date" | "account" | "kind" | "status" | "installments" | "noise" | "word";

const DEBIT_WORDS = ["debito", "debit"];
const CREDIT_WORDS = ["credito", "credit"];

/**
 * The one way to pay a set of names that all answered comes down to, or nothing.
 *
 * Names pointing at the same account are one answer, the card among them preferred, so
 * the card is carried. A card and an account of the same name are the card: the form
 * that writes a card down gives it the name of its account, so "nubank" answered both,
 * the tie was left alone and the purchase went to the default account, where in 1.0.5
 * it went to the card. The two sides of one cartao multiplo are one card, and the line
 * says which side, credit when it says nothing. Two different cards, or two different
 * accounts, are a real tie.
 */
function oneOf(
	hits: readonly QuickEntryAccount[],
	side: "credit" | "debit" | null,
): QuickEntryAccount | null {
	if (hits.length === 0) return null;
	const cards = hits.filter((hit) => hit.cardId);
	const pool = cards.length > 0 ? cards : hits;
	const ids = new Set(pool.map((hit) => hit.id));
	if (ids.size === 1) return pool[0] ?? null;
	const plastics = new Set(pool.map((hit) => hit.cardId));
	if (cards.length > 0 && plastics.size === 1) {
		const wanted = side ?? "credit";
		return pool.find((hit) => hit.side === wanted) ?? null;
	}
	return null;
}

/**
 * Finds the account the line names, preferring the longest run of words that matches,
 * so "conta corrente" wins over "conta". A tie between two accounts is left unresolved:
 * picking one of them would be guessing with somebody else's money.
 */
function findAccount(
	folded: string[],
	accounts: readonly QuickEntryAccount[],
	kind: QuickEntryKind,
): { id: string; cardId: string | null; from: number; to: number; sideAt: number | null } | null {
	// Money coming in lands only where money can land.
	const reachable =
		kind === "income" ? accounts.filter((account) => account.takesIncome !== false) : accounts;
	const named = reachable.map((account) => ({ account, words: wordsOf(account.name) }));
	const sideAt = folded.findIndex(
		(word) => DEBIT_WORDS.includes(word) || CREDIT_WORDS.includes(word),
	);
	const side = sideAt < 0 ? null : DEBIT_WORDS.includes(folded[sideAt] ?? "") ? "debit" : "credit";

	for (let size = Math.min(3, folded.length); size >= 1; size -= 1) {
		for (let start = 0; start + size <= folded.length; start += 1) {
			const window = folded.slice(start, start + size);
			const joined = window.join("");

			const hits = named.filter(({ words }) => {
				if (words.length === 0) return false;
				if (size > 1) return words.join("").startsWith(joined) && joined.length >= 4;
				const single = window[0] ?? "";
				if (single.length < 3) return false;
				return words.some(
					(word) => word === single || (single.length >= 4 && word.startsWith(single)),
				);
			});

			const found = oneOf(
				hits.map((hit) => hit.account),
				side,
			);
			if (found) {
				// The word that chose the side is part of the way to pay, not of the description.
				const choseTheSide =
					found.side && sideAt >= 0 && (sideAt < start || sideAt > start + size - 1);
				return {
					id: found.id,
					cardId: found.cardId ?? null,
					from: start,
					to: start + size - 1,
					sideAt: choseTheSide ? sideAt : null,
				};
			}
			// More than one account answers to this name. Leave it and keep looking, in
			// case the line also names one that is not in doubt.
		}
	}
	return null;
}

/**
 * Whether the line is money coming in, read before the account is looked for, because
 * which accounts it may name depends on it. The same words and signs the reading below
 * reads, in the same order, the last one winning.
 */
function kindOf(folded: readonly string[]): QuickEntryKind {
	let kind: QuickEntryKind = "expense";
	let signed = false;
	for (const token of folded) {
		if (INCOME_WORDS.includes(token)) kind = "income";
		else if (EXPENSE_WORDS.includes(token)) kind = "expense";
		else if (!signed && /^[+-][\d.,]*\d/.test(token)) {
			signed = true;
			kind = token.startsWith("+") ? "income" : "expense";
		}
	}
	return kind;
}

export function readQuickEntry(text: string, options: QuickEntryOptions): QuickEntryReading {
	const currency = options.currency ?? DEFAULT_CURRENCY;
	const tokens = text.trim().split(/\s+/).filter(Boolean);
	const folded = tokens.map(fold);
	const roles: Role[] = tokens.map(() => "word");

	let kind: QuickEntryKind = "expense";
	let amount: number | null = null;
	let happenedOn: CalendarDate | null = null;
	let installments = 1;

	const account = options.accounts ? findAccount(folded, options.accounts, kindOf(folded)) : null;
	if (account) {
		for (let index = account.from; index <= account.to; index += 1) roles[index] = "account";
		if (account.sideAt !== null) roles[account.sideAt] = "account";
	}

	for (let index = 0; index < tokens.length; index += 1) {
		if (roles[index] !== "word") continue;
		const token = folded[index] ?? "";
		const next = folded[index + 1] ?? "";

		if (CURRENCY_WORDS.includes(token)) {
			roles[index] = "noise";
			continue;
		}
		if (TODAY.includes(token)) {
			happenedOn ??= options.today;
			roles[index] = "date";
			continue;
		}
		if (YESTERDAY.includes(token)) {
			happenedOn ??= addDays(options.today, -1);
			roles[index] = "date";
			continue;
		}
		if (BEFORE_YESTERDAY.includes(token)) {
			happenedOn ??= addDays(options.today, -2);
			roles[index] = "date";
			continue;
		}
		if (TOMORROW.includes(token)) {
			happenedOn ??= addDays(options.today, 1);
			roles[index] = "date";
			continue;
		}
		if (INCOME_WORDS.includes(token)) {
			kind = "income";
			roles[index] = "kind";
			continue;
		}
		if (EXPENSE_WORDS.includes(token)) {
			kind = "expense";
			roles[index] = "kind";
			continue;
		}
		if (PLANNED_WORDS.includes(token)) {
			roles[index] = "status";
			continue;
		}

		// "dia 5", where the number alone would otherwise read as an amount.
		if (DAY_MARKER.includes(token) && DAY_ONLY.test(next)) {
			happenedOn ??= dayOfThisMonth(Number(next), options.today);
			roles[index] = "date";
			roles[index + 1] = "date";
			continue;
		}

		const written = dateFrom(token, options.today);
		if (written) {
			happenedOn ??= written;
			roles[index] = "date";
			continue;
		}

		const split = INSTALLMENT.exec(token);
		if (split?.[1]) {
			installments = Math.max(Number(split[1]), 1);
			roles[index] = "installments";
			continue;
		}
		// "3 vezes" and "em 3x" written with a space.
		if (DAY_ONLY.test(token) && INSTALLMENTS_WORDS.includes(next)) {
			installments = Math.max(Number(token), 1);
			roles[index] = "installments";
			roles[index + 1] = "installments";
			continue;
		}

		if (amount === null) {
			// "R$89,90" is one token for whoever typed it, so the symbol comes off here.
			let bare = token;
			for (const marker of ["r$", "$"]) {
				if (bare.startsWith(marker)) bare = bare.slice(marker.length);
			}
			const sign = bare.startsWith("+") ? 1 : bare.startsWith("-") ? -1 : 0;
			if (sign !== 0) bare = bare.slice(1);

			if (AMOUNT.test(bare) && /\d/.test(bare)) {
				try {
					const read = Math.abs(parseMoney(bare, { currency }).amount);
					// Zero is not an amount. Somebody who types "0" has not said how much
					// yet, so the token stays part of what they wrote and the reading says
					// the amount is missing, which is the truth.
					if (read > 0) {
						amount = read;
						if (sign === 1) kind = "income";
						if (sign === -1) kind = "expense";
						roles[index] = "amount";
					}
				} catch (error) {
					// Not a number after all, so it stays part of what was written.
					if (!(error instanceof MoneyError)) throw error;
				}
			}
		}
	}

	// A linking word earns its place only when what follows it is part of the
	// description too. "no nubank" loses the "no", "pao de queijo" keeps the "de".
	const kept: string[] = [];
	for (let index = 0; index < tokens.length; index += 1) {
		if (roles[index] !== "word") continue;
		const token = tokens[index] ?? "";
		if (LINKING_WORDS.includes(folded[index] ?? "")) {
			const following = roles[index + 1];
			if (following !== undefined && following !== "word") continue;
			if (kept.length === 0) continue;
		}
		kept.push(token);
	}

	const description = kept.join(" ").trim();
	const day = happenedOn ?? options.today;
	const problems: QuickEntryProblem[] = [];
	if (amount === null) problems.push("amountMissing");
	if (description === "") problems.push("descriptionMissing");

	return {
		kind,
		// Always a fact. A day that has not arrived holds it back from the balance until it
		// arrives, and then it counts by itself; a promise is what release 1.0 wrote, and
		// nothing new is one. The words that used to ask for one are still read, so they do
		// not end up in the description, and they change nothing.
		status: "settled",
		amount,
		currency,
		happenedOn: day,
		description,
		accountId: account?.id ?? null,
		cardId: account?.cardId ?? null,
		installments,
		problems,
	};
}
