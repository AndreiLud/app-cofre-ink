// The month in three numbers.
//
// Most of this application assumes somebody writes down what they spend. Plenty of
// people never will, and for them a ledger with nothing in it says nothing: no balance,
// no report, no reading of whether the money is going the right way. They do know three
// figures at the end of a month, because the bank and the card tell them. This screen
// takes those three and nothing else.
//
// What it writes are three ordinary records, so every other screen keeps working
// exactly as it did. Registry 0038 says why it is not a mode and not a second kind of
// row. The one thing to be careful about is the double count: somebody who writes a few
// records by hand and then types the whole month here has counted those few twice, so
// the screen says what is already in the month before the fields.

import {
	addMonthsToMonth,
	againstAUsualMonth,
	type CardCycle,
	type CurrencyCode,
	dateInMonth,
	invoiceMonthOf,
	limitsNearBreaking,
	MONTH_PARTS,
	type MonthPart,
	monthMark,
	monthOf,
	monthPartDay,
	parseMoney,
	readMonthMark,
	type TookLine,
	todayIn,
	USUAL_WINDOW,
	whatTookIt,
} from "@cofre/core";
import {
	type Account,
	hasHappened,
	type Transaction,
	type TransactionStatus,
} from "@cofre/storage";
import {
	Button,
	buttonClasses,
	Callout,
	Disclosure,
	EmptyState,
	Field,
	InsightTitle,
	Panel,
	SectionTitle,
	Select,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Value } from "../components/Value.tsx";
import { afterRecordsChange } from "../lib/afterRecords.ts";
import { fillAmount } from "../lib/amounts.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { accountOptions } from "../lib/wayLabel.ts";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";

/** The two that come from a field of their own. Each card has a field for its invoice. */
type MonthField = "income" | "spending";

/**
 * Where a record of this screen sits in the month: income and spending once each, and an
 * invoice and its payment once for every card.
 */
function placeOf(part: MonthPart, cardAccountId: string | null): string {
	return part === "invoice" || part === "payment" ? `${part}:${cardAccountId ?? ""}` : part;
}

const DESCRIPTION: Record<MonthPart, string> = {
	income: "theMonth.descriptionIncome",
	spending: "theMonth.descriptionSpending",
	invoice: "theMonth.descriptionInvoice",
	payment: "theMonth.descriptionPayment",
};

/**
 * What was typed, in cents.
 *
 * Nothing typed is not zero: it means the month has no such number, and a record that is
 * there for it is taken away. Zero means the same thing, because a record of nothing is
 * a line in a list that tells nobody anything.
 */
function typedAmount(text: string, currency: string): number | null {
	if (text.trim() === "") return null;
	try {
		const cents = Math.abs(parseMoney(text, { currency }).amount);
		return cents === 0 ? null : cents;
	} catch {
		return null;
	}
}

/**
 * Whether the month has no such number, which is what takes a record away.
 *
 * Asked of the text and not of the reading. The reader answers nothing for an empty
 * field, for a zero and for a word it cannot read, and only the first two of those mean
 * the month has no such number: the third means somebody made a typo. The guard below
 * catches that before anything is saved, so nothing was ever lost, but the two disagreed
 * about what nothing meant and only their ordering kept it safe. A fourth field added
 * without being listed in MONTH_FIELDS would have deleted a record over a typo.
 */
function meansNoSuchNumber(text: string, currency: string): boolean {
	if (text.trim() === "") return true;
	try {
		return Math.abs(parseMoney(text, { currency }).amount) === 0;
	} catch {
		return false;
	}
}

/** Typed, and not a number. Said out loud rather than quietly read as nothing. */
function isUnreadable(text: string, currency: string): boolean {
	if (text.trim() === "") return false;
	try {
		parseMoney(text, { currency });
		return false;
	} catch {
		return true;
	}
}

/**
 * The same shape the rest of the interface puts an amount into a field in.
 *
 * Which stopped being true the moment the income field was taught to follow the language
 * on screen, so it takes the language now and the sentence above is true again.
 */
function asText(
	row: Transaction | undefined,
	language: string | undefined,
	currency: CurrencyCode,
): string {
	if (!row) return "";
	return fillAmount(Math.abs(row.amount), language, currency);
}

/** The same short day the invoice screen prints, because the month is in the caption. */
function dayAndMonth(date: string): string {
	return `${date.slice(8)}/${date.slice(5, 7)}`;
}

function cycleOf(account: Account | null): CardCycle | null {
	if (!account || account.closingDay === null || account.dueDay === null) return null;
	return { closingDay: account.closingDay, dueDay: account.dueDay };
}

/**
 * Which account the two ordinary numbers land in when nobody has said.
 *
 * Accounts come back in the order of their names, and the first name is as likely to be
 * a brokerage as the account the wages arrive in. So the guess is by what the account is
 * for, and anything chosen by hand wins over it anyway.
 */
const PREFERENCE = ["checking", "savings", "cash", "voucher", "investment"];

function likeliest(accounts: readonly Account[]): Account | null {
	for (const kind of PREFERENCE) {
		const found = accounts.find((one) => one.kind === kind);
		if (found) return found;
	}
	return accounts[0] ?? null;
}

export function MonthPage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");
	const currency = currentSpace?.baseCurrency ?? "BRL";

	const [month, setMonth] = useState("");
	const shown = month === "" ? monthOf(today) : month;

	// Null is not "empty", it is "nothing typed yet", which is what shows whatever the
	// month already holds without an effect copying it into the state behind the person.
	const [income, setIncome] = useState<string | null>(null);
	const [spending, setSpending] = useState<string | null>(null);
	/** What was typed for the invoice of each card, by the card; a card not here was not typed. */
	const [invoices, setInvoices] = useState<Record<string, string>>({});
	const [accountId, setAccountId] = useState("");
	const [problem, setProblem] = useState<string | null>(null);
	const [saved, setSaved] = useState<string | null>(null);
	/** Which fields could not be read, so the sentence sits on the field itself. */
	const [unreadable, setUnreadable] = useState<string[]>([]);

	function goTo(next: string) {
		setMonth(next);
		setIncome(null);
		setSpending(null);
		setInvoices({});
		setProblem(null);
		setSaved(null);
	}

	const enabled = Boolean(session && currentSpace);

	// The archived ones too: a card put away still has the invoices it was written with.
	const accounts = useQuery({
		queryKey: ["accounts", spaceId, "includingArchived"],
		enabled,
		queryFn: () => session?.accounts.list(spaceId, { includeArchived: true }) ?? [],
	});

	// A role that does not write should not be handed a button that writes. It used to
	// be offered, pressed, and refused afterwards in a raw English sentence.
	const { mayCall, ready, role, seesOwnRowsOnly } = useWhatIMayDo(spaceId);
	/**
	 * Two reasons, and they are not the same reason. A Viewer writes nothing at all. A
	 * Logger writes, but only ever sees the records they wrote themselves, and this
	 * screen is about the month of the whole household: it would look empty to them even
	 * when somebody else had already filled it in, and saving would write a second set of
	 * the same three marks, which nothing refuses, and the space would count the month
	 * twice.
	 */
	const mayWrite = mayCall("transactions.create") && !seesOwnRowsOnly;
	/** Whether the way out of an empty screen is a way out for this person. */
	const mayMakeAnAccount = mayCall("accounts.create");

	const everyAccount = accounts.data ?? [];
	// A benefit card is neither. It takes no income, because whoever gives it is what
	// credits it, and the spending on it is not the household's money going out.
	const moneyAccounts = everyAccount.filter(
		(one) => one.archivedAt === null && one.kind !== "credit" && one.kind !== "voucher",
	);
	const creditAccounts = everyAccount.filter((one) => one.kind === "credit");

	// Asked for by name, not by a range of days.
	//
	// These sit on different days, one of which is in the month before and one in the
	// month after, and a range wide enough to hold them all is wide enough for a busy
	// space to fill the page it comes back in. A record that fell off that page would be
	// read as missing and written a second time, which is the one thing this screen must
	// never do. Every card's invoice and payment, and the two marks from before 2.0.0 that
	// named no card.
	const marks = [
		...MONTH_PARTS.map((part) => monthMark(shown, part)),
		...creditAccounts.flatMap((card) => [
			monthMark(shown, "invoice", card.id),
			monthMark(shown, "payment", card.id),
		]),
	];
	const written = useQuery({
		queryKey: ["transactions", spaceId, "theMonth", "mine", shown, marks.join(",")],
		enabled: enabled && shown !== "" && !accounts.isPending,
		queryFn: () => session?.transactions.list({ spaceId, externalIds: marks }) ?? [],
	});

	/**
	 * What this screen already wrote for the month, by where it sits. A mark from before 2.0.0
	 * names no card and belongs to the card the record is on: the account of the invoice, and
	 * the account the payment went into.
	 */
	const mine = new Map<string, Transaction>();
	for (const row of written.data ?? []) {
		const mark = readMonthMark(row.externalId);
		if (!mark || mark.month !== shown) continue;
		const card =
			mark.cardAccountId ??
			(mark.part === "invoice"
				? row.accountId
				: mark.part === "payment"
					? row.counterAccountId
					: null);
		mine.set(placeOf(mark.part, card), row);
	}

	/**
	 * A field for every card in use, and for an archived one only in a month it already has a
	 * line in. One field for one card made somebody with two choose which invoice the month
	 * had, and saving again moved the invoice, its payment and the account.
	 */
	const cardAccounts = creditAccounts.filter(
		(card) =>
			card.archivedAt === null ||
			mine.has(placeOf("invoice", card.id)) ||
			mine.has(placeOf("payment", card.id)),
	);

	// Where the money of the month lands: where the saved income went, else the spending,
	// else a payment. It opened on the likeliest account whatever had been saved, so saving
	// the month again moved every record of it there.
	const savedIn = [
		mine.get("income")?.accountId,
		mine.get("spending")?.accountId,
		...cardAccounts.map((card) => mine.get(placeOf("payment", card.id))?.accountId),
	].find((id) => id !== undefined && moneyAccounts.some((one) => one.id === id));
	const account =
		moneyAccounts.find((one) => one.id === accountId) ??
		moneyAccounts.find((one) => one.id === savedIn) ??
		likeliest(moneyAccounts);

	// What is in this month that somebody wrote a line at a time. It counts too, and
	// saying so is the only thing standing between this screen and a month counted twice.
	const firstOfMonth = dateInMonth(shown, 1);
	const to = dateInMonth(shown, 31);
	const records = useQuery({
		queryKey: ["transactions", spaceId, "theMonth", "month", shown],
		enabled: enabled && shown !== "",
		queryFn: () =>
			session?.transactions.list({ spaceId, from: firstOfMonth, to, limit: 1000 }) ?? [],
	});

	/**
	 * The three readings of the month, for somebody who gave it three numbers.
	 *
	 * Drawn for nobody who only sees their own records. Each of the three is a household
	 * figure, and narrowed to one person's rows it is a household limit measured against one
	 * person's spending, which is worse than silence. That is what the flag is for.
	 */
	const reads = enabled && shown !== "" && ready && !seesOwnRowsOnly;

	const behind = useQuery({
		queryKey: ["reports", "byMonth", spaceId, shown],
		enabled: reads,
		queryFn: () =>
			session?.reports.byMonth({
				spaceId,
				from: dateInMonth(addMonthsToMonth(shown, -USUAL_WINDOW), 1),
				to,
			}) ?? [],
	});

	const limits = useQuery({
		// No day is passed on purpose: the month is read whole, because that is what three
		// typed numbers are a claim about.
		queryKey: ["budgets", "progress", spaceId, shown],
		enabled: reads,
		queryFn: () => session?.budgets.progress({ spaceId, month: shown }) ?? [],
	});

	const categories = useQuery({
		queryKey: ["categories", spaceId],
		enabled: reads,
		queryFn: () => session?.categories.list(spaceId) ?? [],
	});

	const byHand = (records.data ?? []).filter(
		(row) => readMonthMark(row.externalId) === null && row.kind !== "transfer",
	);
	const byHandIn = byHand
		.filter((row) => row.kind === "income")
		.reduce((sum, row) => sum + row.amount, 0);
	const byHandOut = byHand
		.filter((row) => row.kind === "expense")
		.reduce((sum, row) => sum + Math.abs(row.amount), 0);

	const monthName = new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
		month: "long",
		year: shown.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
		timeZone: "UTC",
	}).format(new Date(`${shown}-01T00:00:00Z`));

	// A title begins with a capital letter. In Portuguese a month is written in small letters,
	// so the title read "outubro em três números".
	const titled = t("theMonth.headline", { month: monthName });
	const headline =
		titled.charAt(0).toLocaleUpperCase(i18n.resolvedLanguage === "en" ? "en" : "pt-BR") +
		titled.slice(1);

	// Inside a sentence, where the component that draws an amount cannot go. The same
	// thing the check up and the budget do with the figures in their own sentences.
	const asMoney = (cents: number) =>
		new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			style: "currency",
			currency,
		}).format(cents / 100);

	/**
	 * This month against the middle of the closed months before it, when there are enough.
	 *
	 * What came in is the income and the benefit together, which is decision 5 of 2.0.0 and
	 * what the overview says for the same month. The spending already holds the lunches the
	 * benefit paid for, so leaving the benefit out made every month look worse by it.
	 */
	const withBenefits = (behind.data ?? []).map((one) => ({
		month: one.month,
		income: one.income + one.benefits,
		expense: one.expense,
	}));
	const usual = reads ? againstAUsualMonth({ month: shown, today, months: withBenefits }) : null;
	/** How much of what came in this month was benefit, said beside the figure. */
	const benefitsThisMonth = (behind.data ?? []).find((one) => one.month === shown)?.benefits ?? 0;
	const monthsBehind = (behind.data ?? []).filter((one) => one.month < shown).length;

	/**
	 * What the month went on, out of the records that say.
	 *
	 * Not drawn when the month holds more records than the query asks for, because a ranking
	 * of a truncated month is a ranking of whichever thousand came back.
	 */
	const truncated = (records.data ?? []).length >= 1000;
	const took = reads && !truncated ? whatTookIt(records.data ?? []) : null;
	const nameOfCategory = (categoryId: string | null) =>
		categoryId === null
			? t("reports.noCategory")
			: (categories.data?.find((one) => one.id === categoryId)?.name ?? t("reports.noCategory"));

	/**
	 * The five lines that spent most, and the rest as one more line.
	 *
	 * Every share is of the whole that was itemised, so five lines on their own added up to
	 * less than it, with nothing said about the rest. Registry 0049.
	 */
	const tookLines = (ranked: readonly TookLine[]) => {
		const lines = ranked.slice(0, 5).map((line) => ({
			key: line.categoryId ?? "none",
			name: nameOfCategory(line.categoryId),
			amount: line.amount,
			share: line.share,
		}));
		const rest = ranked.slice(5);
		if (rest.length === 0) return lines;
		return [
			...lines,
			{
				key: "rest",
				name: t("theMonth.tookRest", { count: rest.length }),
				amount: rest.reduce((total, line) => total + line.amount, 0),
				share: rest.reduce((total, line) => total + line.share, 0),
			},
		];
	};

	const risks = reads
		? limitsNearBreaking(
				(limits.data ?? []).map((one) => ({
					budgetId: one.id,
					limit: one.progress.limit,
					spent: one.progress.spent,
				})),
			)
		: [];
	const nameOfLimit = (budgetId: string) => {
		const found = (limits.data ?? []).find((one) => one.id === budgetId);
		if (!found) return "";
		if (found.scope === "total") return t("budget.everything");
		if (found.scope === "priority") return t(`priority.${found.priority ?? "important"}`);
		return categories.data?.find((one) => one.id === found.categoryId)?.name ?? "";
	};
	// A limit on a category cannot see a typed total, which carries none, so a household with
	// only those is told rather than left reading silence as safety.
	const onlyNarrowLimits =
		(limits.data ?? []).length > 0 && (limits.data ?? []).every((one) => one.scope !== "total");
	/**
	 * Whether money out was typed for this month: the spending, or an invoice of a card.
	 *
	 * The sentence about limits on a category is about typed spending they cannot see, and it
	 * showed in months where none was typed, beside an income and nothing else.
	 */
	const typedOut =
		mine.has("spending") || cardAccounts.some((card) => mine.has(placeOf("invoice", card.id)));

	const withYear = new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(`${shown}-01T00:00:00Z`));

	const language = i18n.resolvedLanguage;
	const text: Record<MonthField, string> = {
		income: income ?? asText(mine.get("income"), language, currency),
		spending: spending ?? asText(mine.get("spending"), language, currency),
	};
	/** What the field of one card's invoice says: what was typed, or what the month holds. */
	const invoiceText = (cardId: string) =>
		invoices[cardId] ?? asText(mine.get(placeOf("invoice", cardId)), language, currency);
	// Null means the month has no such number, which is what takes a record away, and it
	// is asked of the text rather than read off a failed parse. A word somebody mistyped
	// is not the month saying it has no income.
	const read = (typed: string) =>
		meansNoSuchNumber(typed, currency) ? null : typedAmount(typed, currency);
	const cents: Record<MonthField, number | null> = {
		income: read(text.income),
		spending: read(text.spending),
	};
	const invoiceCents = (cardId: string) => read(invoiceText(cardId));
	/** Every invoice of the month added up, which is what comes off what is left over. */
	const invoicesTogether = cardAccounts.reduce(
		(total, card) => total + (invoiceCents(card.id) ?? 0),
		0,
	);
	const anyInvoice = cardAccounts.some((card) => invoiceCents(card.id) !== null);
	const left = (cents.income ?? 0) - (cents.spending ?? 0) - invoicesTogether;

	/**
	 * What the month should end up holding.
	 *
	 * Income and spending, and for every card its invoice and the payment of it. The payment is
	 * not a question: an invoice is paid, and leaving that out was what made the account the
	 * wages arrive in climb by the whole invoice every month while the card sank by the same
	 * amount. The total was right and both accounts were wrong. Each payment leaves on the day
	 * its own card falls due and names the invoice of its own card.
	 */
	function wanted(): Array<{
		place: string;
		part: MonthPart;
		/** The mark it carries, with the card in it for an invoice and a payment. */
		mark: string;
		amount: number | null;
		into: Account;
		kind: "income" | "expense" | "transfer";
		counter: string | null;
		status: TransactionStatus;
		happenedOn: string;
		description: string;
		/** Which invoice a payment pays, where the row is one. */
		invoiceMonth?: string | null;
	}> {
		if (account === null) return [];

		const rows: ReturnType<typeof wanted> = [
			{
				place: "income",
				part: "income",
				mark: monthMark(shown, "income"),
				amount: cents.income,
				into: account,
				kind: "income",
				counter: null,
				status: "settled",
				happenedOn: monthPartDay(shown, "income", null, today),
				description: t(DESCRIPTION.income, { month: withYear }),
			},
			{
				place: "spending",
				part: "spending",
				mark: monthMark(shown, "spending"),
				amount: cents.spending,
				into: account,
				kind: "expense",
				counter: null,
				status: "settled",
				happenedOn: monthPartDay(shown, "spending", null, today),
				description: t(DESCRIPTION.spending, { month: withYear }),
			},
		];

		for (const card of cardAccounts) {
			const cycle = cycleOf(card);
			const amount = invoiceCents(card.id);
			rows.push({
				place: placeOf("invoice", card.id),
				part: "invoice",
				mark: monthMark(shown, "invoice", card.id),
				amount,
				into: card,
				kind: "expense",
				counter: null,
				status: "settled",
				happenedOn: monthPartDay(shown, "invoice", cycle, today),
				description: t(DESCRIPTION.invoice, { month: withYear, card: card.name }),
			});
			rows.push({
				place: placeOf("payment", card.id),
				part: "payment",
				mark: monthMark(shown, "payment", card.id),
				amount,
				into: account,
				kind: "transfer",
				counter: card.id,
				// A fact, like everything the application writes. An invoice that has not
				// fallen due yet has not been paid yet, and its day says so: the payment
				// leaves the bank and pays the invoice on that day, by itself.
				status: "settled",
				happenedOn: monthPartDay(shown, "payment", cycle, today),
				description: t(DESCRIPTION.payment, { month: withYear, card: card.name }),
				/**
				 * Which invoice it pays, said out loud.
				 *
				 * The invoice row is charged to the card and finds its invoice through the cycle.
				 * A payment that named none fell through to the rule written for a payment nobody
				 * explained, which pays down the oldest invoice still owing, so somebody filling
				 * in three months out of order had each payment land on a month it was not about.
				 */
				invoiceMonth:
					cycle === null
						? null
						: invoiceMonthOf(monthPartDay(shown, "invoice", cycle, today), cycle),
			});
		}

		return rows;
	}

	const write = useMutation({
		mutationFn: async () => {
			if (!session) return;

			for (const one of wanted()) {
				const existing = mine.get(one.place);

				if (one.amount === null) {
					if (existing) await session.transactions.remove(existing.id);
					continue;
				}

				if (existing) {
					await session.transactions.update(existing.id, {
						amount: one.amount,
						happenedOn: one.happenedOn,
						description: one.description,
						accountId: one.into.id,
						counterAccountId: one.counter,
						status: one.status,
						// A record written before 2.0.0 carries a mark with no card, and saving the
						// month gives it the mark of its own, so the next save finds it by its card.
						externalId: one.mark,
						...(one.invoiceMonth ? { invoiceMonth: one.invoiceMonth } : {}),
					});
					continue;
				}

				await session.transactions.create({
					spaceId,
					kind: one.kind,
					amount: one.amount,
					happenedOn: one.happenedOn,
					description: one.description,
					accountId: one.into.id,
					counterAccountId: one.counter,
					status: one.status,
					// Only the payment carries one, and naming it marks it as chosen, so
					// correcting the closing day of the card afterwards leaves it where it
					// was put rather than dragging it to another month.
					...(one.invoiceMonth ? { invoiceMonth: one.invoiceMonth } : {}),
					externalId: one.mark,
				});
			}
		},
		onSuccess: () => {
			setIncome(null);
			setSpending(null);
			setInvoices({});
			setProblem(null);
			setSaved(shown);
		},
		onError: (error: unknown) => {
			setSaved(null);
			setProblem(sayWhy(error, t));
		},
		// On the way out either way, and not only when it worked. A save that failed half
		// way through still wrote some of the rows, and a screen that did not go and look
		// would still believe it had written none of them and write those again.
		onSettled: () => {
			afterRecordsChange(queries);
			// The three readings below are about the month that was just typed, so they are
			// stale the moment it is saved.
			void queries.invalidateQueries({ queryKey: ["reports"] });
			void queries.invalidateQueries({ queryKey: ["budgets"] });
		},
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		setProblem(null);
		setSaved(null);

		// On the field that is wrong, and in the words every amount field uses. It said
		// one of three amounts could not be read without saying which, and the field it
		// was about looked exactly like the other two.
		const wrong = [
			...(["income", "spending"] as const).filter((part) => isUnreadable(text[part], currency)),
			...cardAccounts
				.filter((card) => isUnreadable(invoiceText(card.id), currency))
				.map((card) => placeOf("invoice", card.id)),
		];
		if (wrong.length > 0) {
			setUnreadable(wrong);
			return;
		}
		setUnreadable([]);
		// Nothing in any field, with nothing written for the month either, is somebody who
		// opened the screen and pressed the button. Taking away what is not there and
		// saying it worked would read as having lost something.
		const nothing = cents.income === null && cents.spending === null && !anyInvoice;
		if (nothing && mine.size === 0) {
			setProblem(t("theMonth.nothingTyped"));
			return;
		}
		write.mutate();
	}

	if (!currentSpace) return null;

	if (!accounts.isPending && moneyAccounts.length === 0) {
		return (
			<div className="space-y-6">
				<InsightTitle level="h1">{t("theMonth.title")}</InsightTitle>
				{/* This return sits before the callout that says which role you are, so a
				    Viewer here was never told that and only got a button leading to a screen
				    where it does not exist. Whichever of the two is true gets said, and
				    neither is said until the member list has answered: an owner would have
				    been told the making of an account was not theirs, for as long as that
				    request takes. */}
				{!ready ? (
					<Skeleton lines={3} />
				) : mayMakeAnAccount ? (
					<EmptyState
						icon="wallet"
						title={t("theMonth.noAccountTitle")}
						description={t("theMonth.noAccountBody")}
						action={
							<Link
								to={ROUTES.accounts}
								className={buttonClasses({ variant: "primary", size: "medium" })}
							>
								{t("accounts.create")}
							</Link>
						}
					/>
				) : (
					<EmptyState
						icon="wallet"
						title={t("theMonth.noAccountTitle")}
						description={t("theMonth.noAccountForYou")}
					/>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<InsightTitle level="h1" detail={t("theMonth.subtitle")}>
					{headline}
				</InsightTitle>
				{/* On a wide screen this sits at the far end of the line the title is on. The
				    title takes the whole width long before that, so when it wraps onto its
				    own line this keeps it at the right edge instead of under the first word
				    of the subtitle. */}
				<div className="ml-auto flex items-center gap-1">
					<Button
						size="small"
						variant="secondary"
						onClick={() => goTo(addMonthsToMonth(shown, -1))}
						aria-label={t("theMonth.previous")}
					>
						{t("theMonth.previousShort")}
					</Button>
					<Button
						size="small"
						variant="secondary"
						onClick={() => goTo(addMonthsToMonth(shown, 1))}
						aria-label={t("theMonth.next")}
					>
						{t("theMonth.nextShort")}
					</Button>
				</div>
			</div>

			{records.isPending ? <Skeleton lines={3} /> : null}

			{!records.isPending && byHand.length > 0 ? (
				<Callout tone="attention" title={t("theMonth.alsoTitle")}>
					<p>{t("theMonth.alsoBody", { count: byHand.length })}</p>
					<p className="mt-1">
						{t("theMonth.alsoTotals", {
							income: asMoney(byHandIn),
							expense: asMoney(byHandOut),
						})}
					</p>
				</Callout>
			) : null}

			{/* A limit already broken is the one thing somebody has to see the second the month
			    is typed, so it goes above the form rather than below the table. */}
			{risks.length > 0 ? (
				<Callout tone="attention" title={t("theMonth.limitsTitle")}>
					<p>{t("theMonth.limitsBody")}</p>
					<ul className="mt-1 space-y-1">
						{risks.map((risk) => (
							<li key={risk.budgetId}>
								{risk.state === "over"
									? t("theMonth.limitOver", {
											name: nameOfLimit(risk.budgetId),
											spent: asMoney(risk.spent),
											limit: asMoney(risk.limit),
											over: asMoney(-risk.left),
										})
									: t("theMonth.limitClose", {
											name: nameOfLimit(risk.budgetId),
											spent: asMoney(risk.spent),
											limit: asMoney(risk.limit),
											left: asMoney(risk.left),
										})}
							</li>
						))}
					</ul>
					{onlyNarrowLimits && typedOut ? (
						<p className="mt-1">{t("theMonth.limitsTotalOnly")}</p>
					) : null}
					<p className="mt-1">
						<Link to={ROUTES.budget} className="underline">
							{t("theMonth.limitsSeeBudget")}
						</Link>
					</p>
				</Callout>
			) : null}

			{/* And the case the sentence above was written for, which could not reach it.
			    When every limit of the month is on a category, none of them can see a typed
			    total, so none of them is ever near breaking and the warning above is never
			    drawn: the silence read as safety, which is the one thing it had to avoid. */}
			{risks.length === 0 && onlyNarrowLimits && typedOut ? (
				<Callout tone="neutral">
					{t("theMonth.limitsTotalOnly")}{" "}
					<Link to={ROUTES.budget} className="underline">
						{t("theMonth.limitsSeeBudget")}
					</Link>
				</Callout>
			) : null}

			<Panel>
				<form className="space-y-5" onSubmit={submit}>
					<Field
						label={t("theMonth.income")}
						error={unreadable.includes("income") ? t("fields.amountError") : null}
						hint={t("theMonth.incomeHint")}
						numeric={true}
						inputMode="decimal"
						value={text.income}
						onChange={(event) => setIncome(event.target.value)}
						placeholder={t("fields.amountPlaceholder")}
					/>
					<Field
						label={t("theMonth.spending")}
						error={unreadable.includes("spending") ? t("fields.amountError") : null}
						hint={t(
							cardAccounts.length === 0 ? "theMonth.spendingOnlyHint" : "theMonth.spendingHint",
						)}
						numeric={true}
						inputMode="decimal"
						value={text.spending}
						onChange={(event) => setSpending(event.target.value)}
						placeholder={t("fields.amountPlaceholder")}
					/>
					{/* A field for every card, under one heading, because a household with two cards
					    has two invoices, and one field made it choose which one the month had. */}
					{cardAccounts.length > 0 ? (
						<fieldset className="space-y-3">
							<legend className="font-medium text-ink text-sm">{t("theMonth.invoices")}</legend>
							<p className="text-quiet text-xs">
								{t("theMonth.invoicesHint", { month: monthName, count: cardAccounts.length })}
							</p>
							{cardAccounts.map((card) => (
								<Field
									key={card.id}
									label={t("theMonth.invoiceOf", {
										card:
											card.archivedAt === null
												? card.name
												: `${card.name} (${t("invoice.archivedMark")})`,
									})}
									error={
										unreadable.includes(placeOf("invoice", card.id))
											? t("fields.amountError")
											: null
									}
									numeric={true}
									inputMode="decimal"
									value={invoiceText(card.id)}
									onChange={(event) => setInvoices({ ...invoices, [card.id]: event.target.value })}
									placeholder={t("fields.amountPlaceholder")}
								/>
							))}
						</fieldset>
					) : null}

					{moneyAccounts.length > 1 ? (
						<Select
							label={t("theMonth.where")}
							hint={t("theMonth.whereHint")}
							value={account?.id ?? ""}
							onChange={(event) => setAccountId(event.target.value)}
							options={accountOptions(moneyAccounts, t)}
						/>
					) : null}

					<p className="text-sm text-quiet">
						{t("theMonth.clearHint")}
						{moneyAccounts.length === 1 && account
							? ` ${t("theMonth.landsIn", { account: account.name })}`
							: ""}
					</p>

					{cents.income !== null || cents.spending !== null || anyInvoice ? (
						<p className="text-sm text-ink">
							{left >= 0 ? t("theMonth.leftOver") : t("theMonth.shortBy")}{" "}
							<Value
								amount={Math.abs(left)}
								currency={currency}
								tone={left >= 0 ? "positive" : "negative"}
							/>
						</p>
					) : null}

					{problem ? (
						<Callout tone="problem" title={t("theMonth.couldNot")}>
							{problem}
						</Callout>
					) : null}
					{saved !== null && !write.isPending ? (
						<Callout tone="neutral" title={t("theMonth.saved", { month: monthName })}>
							{t("theMonth.savedBody")}
						</Callout>
					) : null}

					{mayWrite || role === null ? null : (
						<Callout tone="attention" title={t("roles.youAre", { role: t(`role.${role}`) })}>
							{t(seesOwnRowsOnly ? "theMonth.loggerBody" : "theMonth.cannotWriteBody")}
						</Callout>
					)}

					<Button type="submit" variant="primary" disabled={write.isPending || !mayWrite}>
						{write.isPending ? t("theMonth.saving") : t("theMonth.save")}
					</Button>
				</form>
			</Panel>

			{mine.size > 0 ? (
				<section className="space-y-3">
					<SectionTitle level="h2">{t("theMonth.written")}</SectionTitle>
					<Panel flush>
						<Table caption={t("theMonth.caption", { month: withYear })}>
							<TableHead>
								<TableRow>
									<TableHeader>{t("transactions.description")}</TableHeader>
									<TableHeader>{t("transactions.day")}</TableHeader>
									<TableHeader numeric={true}>{t("transactions.amount")}</TableHeader>
								</TableRow>
							</TableHead>
							<TableBody>
								{[
									"income",
									"spending",
									...cardAccounts.flatMap((card) => [
										placeOf("invoice", card.id),
										placeOf("payment", card.id),
									]),
								].map((place) => {
									const row = mine.get(place);
									if (!row) return null;
									return (
										<TableRow key={place}>
											<TableCell>
												{row.description}
												{hasHappened(row, today) ? null : (
													<span className="ml-2 text-xs text-quiet">
														{t("transactionStatus.planned")}
													</span>
												)}
											</TableCell>
											<TableCell className="whitespace-nowrap font-mono text-quiet">
												{dayAndMonth(row.happenedOn)}
											</TableCell>
											<TableCell numeric={true}>
												{/* A transfer is neither money in nor money out of the space, so
												    it is not coloured like one. */}
												<Value
													amount={row.amount}
													currency={row.currency}
													tone={row.kind === "transfer" ? "neutral" : "auto"}
												/>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</Panel>
					<p className="text-sm text-quiet">
						<Link to={ROUTES.transactions} className="underline">
							{t("theMonth.seeTheList")}
						</Link>
					</p>
				</section>
			) : null}

			{/* The two readings of the month, as lists rather than tables: the one table on this
			    screen stays the one table, which is also what the browser tests locate by. */}
			{reads ? (
				<Panel title={t("theMonth.usualTitle")}>
					{usual === null ? (
						<p className="text-sm text-quiet">
							{t("theMonth.usualTooFew", { count: monthsBehind })}
						</p>
					) : (
						<>
							<p className="text-sm text-quiet">
								{t("theMonth.usualBody", { count: usual.months, month: monthName })}
							</p>
							<ul className="mt-3 divide-y divide-line">
								{(
									[
										["movement.income", usual.usualIn, usual.monthIn],
										["movement.expense", usual.usualOut, usual.monthOut],
									] as const
								).map(([label, was, now]) => (
									<li
										key={label}
										className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
									>
										<span>{t(label)}</span>
										<span className="font-mono text-sm">
											{t("theMonth.usualFigures", { usual: asMoney(was), now: asMoney(now) })}
										</span>
									</li>
								))}
							</ul>
							{benefitsThisMonth > 0 ? (
								<p className="mt-2 text-quiet text-sm">
									{t("reports.ofWhichBenefits", { amount: asMoney(benefitsThisMonth) })}
								</p>
							) : null}
							<p className="mt-4 border-line border-t pt-4 text-sm">
								{usual.verdict === "tooEarly"
									? t("theMonth.usualTooEarly", { month: monthName })
									: usual.verdict === "same"
										? t("theMonth.usualSame")
										: t(
												usual.verdict === "lower" ? "theMonth.usualLower" : "theMonth.usualHigher",
												{
													difference: asMoney(Math.abs(usual.differenceOut)),
												},
											)}
							</p>
						</>
					)}
				</Panel>
			) : null}

			{/* Not for a month with no spending at all, which it told that nothing in it had a
			    category, as if something in it could have. */}
			{took && (took.ranked.length > 0 || took.notItemised > 0) ? (
				<Panel title={t("theMonth.tookTitle")}>
					{took.ranked.length === 0 ? (
						<p className="text-sm text-quiet">{t("theMonth.tookNothing", { month: monthName })}</p>
					) : (
						<>
							{/* Only when there is a typed total to account for. Saying that nothing is a
							    total nobody itemised is a sentence about nothing. */}
							{took.notItemised > 0 ? (
								<p className="text-sm text-quiet">
									{t("theMonth.tookBody", { amount: asMoney(took.notItemised) })}
								</p>
							) : null}
							<ul className="mt-3 divide-y divide-line">
								{tookLines(took.ranked).map((line) => (
									<li
										key={line.key}
										className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
									>
										<span className="min-w-0">
											<span className="truncate">{line.name}</span>{" "}
											<span className="text-quiet text-xs">
												{t("theMonth.tookLine", { share: Math.round(line.share * 100) })}
											</span>
										</span>
										<Value amount={-line.amount} currency={currency} tone="auto" />
									</li>
								))}
							</ul>
						</>
					)}
					<p className="mt-4 text-sm text-quiet">
						<Link to={ROUTES.reports} className="underline">
							{t("theMonth.tookSeeReports")}
						</Link>
					</p>
				</Panel>
			) : null}

			<Disclosure summary={t("theMonth.whatItWrites")} hint={t("theMonth.whatItWritesHint")}>
				<p className="text-sm leading-relaxed text-quiet">{t("theMonth.whatItWritesBody")}</p>
			</Disclosure>
		</div>
	);
}
