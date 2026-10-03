// The card invoice: what it charged, whether it was paid, when it closes and when it
// falls due.
//
// A purchase carries the invoice it landed on, written at the time it happened, so this
// screen reads that stamp rather than working the dates out again. Changing the closing
// day tomorrow does not move what already closed, which is the whole point of stamping
// it, and a purchase the bank closed a day either side can be moved from here and stays
// moved.
//
// Whether it was paid is the half that did not exist. A payment is a transfer into the
// card marked with the invoice it pays, and the standing comes from the model rather than
// from this screen adding things up, so the overview and this screen cannot disagree.

import {
	addMonthsToMonth,
	amountToPay,
	type CalendarDate,
	type CalendarMonth,
	type CardCycle,
	cardsByUrgency,
	type InvoiceState,
	invoiceMonthOf,
	limitLeftOf,
	todayIn,
} from "@cofre/core";
import type { Account } from "@cofre/storage";
import {
	Button,
	buttonClasses,
	Callout,
	Dialog,
	Disclosure,
	EmptyState,
	Field,
	Icon,
	InsightTitle,
	Menu,
	MenuItem,
	Panel,
	Segmented,
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
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Value } from "../components/Value.tsx";
import { afterRecordsChange } from "../lib/afterRecords.ts";
import { fillAmount, readAmount } from "../lib/amounts.ts";
import { invoiceHeadline } from "../lib/invoiceHeadline.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { accountOptions, cardOptions } from "../lib/wayLabel.ts";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";

function dayAndMonth(date: string): string {
	return `${date.slice(8)}/${date.slice(5, 7)}`;
}

export function InvoicePage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace, spaces, selectSpace } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	/** Whether the way out of an empty screen is a way out for this person. */
	const iMay = useWhatIMayDo(spaceId);
	const mayMakeAnAccount = iMay.mayCall("accounts.create");
	const ready = iMay.ready;
	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");

	/**
	 * Which card and which invoice, from the address and from nowhere else.
	 *
	 * The overview leads here with a card named, because every button on a card means "that
	 * one". It was read once, when the screen opened, so a second link followed with the
	 * screen already open stayed on the first card, and choosing another card did not reach
	 * the address, so going back did not go back. Choosing writes the address now, and the
	 * address is what the screen shows.
	 */
	const asked = useSearch({ from: ROUTES.invoices });
	const navigate = useNavigate();
	const goTo = (next: { cartao?: string; mes?: string }) =>
		void navigate({ to: ROUTES.invoices, search: { cartao: next.cartao, mes: next.mes } });
	const [problem, setProblem] = useState<string | null>(null);

	const [paying, setPaying] = useState<InvoiceState | null>(null);
	const [payFrom, setPayFrom] = useState("");
	const [payAmount, setPayAmount] = useState("");
	const [payOn, setPayOn] = useState("");
	const [clearingOld, setClearingOld] = useState(false);
	const [closedDay, setClosedDay] = useState("");

	const mine = iMay;
	// Each button by the call it makes.
	const mayPay = mine.mayCall("invoices.pay");
	const mayPayOld = mine.mayCall("invoices.markPaidUntil");
	const mayMove = mine.mayCall("invoices.move");
	const mayReclose = mine.mayCall("invoices.closedOn");

	// The archived ones too, because a card put away with its last invoice still owed is a
	// card somebody still has to pay.
	const accounts = useQuery({
		queryKey: ["accounts", spaceId, "includingArchived"],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.accounts.list(spaceId, { includeArchived: true }) ?? [],
	});

	/** Where every card stands, which is what puts them in the order they have to be dealt with. */
	const standing = useQuery({
		queryKey: ["invoices", "standing", spaceId, today],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.invoices.standing(spaceId, today) ?? [],
	});

	/**
	 * The cards, the most urgent first: late, then closed and owed, then something on the open
	 * invoice, then nothing, and the name in the language of the screen for a tie. The screen
	 * opened on the first card the database sorted by name, which was not the same card in the
	 * two modes and was rarely the one that was late. An archived card is here while it owes.
	 */
	const order = cardsByUrgency(
		(standing.data ?? []).map((one) => ({
			...one,
			name: one.account.name,
			currency: one.account.currency,
		})),
		today,
		i18n.resolvedLanguage,
	).map((one) => one.account.id);
	const stillOwing = new Set((standing.data ?? []).map((one) => one.account.id));
	const lateOnes = new Set(
		(standing.data ?? [])
			.filter((one) => one.owing.some((state) => state.late))
			.map((one) => one.account.id),
	);
	const placeOf = (id: string) => {
		const at = order.indexOf(id);
		return at < 0 ? order.length : at;
	};
	const invoiceAccounts = (accounts.data ?? [])
		.filter((one) => one.kind === "credit" && (one.archivedAt === null || stillOwing.has(one.id)))
		.sort(
			(left, right) =>
				placeOf(left.id) - placeOf(right.id) ||
				left.name.localeCompare(right.name, i18n.resolvedLanguage),
		);
	const invoiceAccount =
		invoiceAccounts.find((one) => one.id === asked.cartao) ?? invoiceAccounts[0] ?? null;

	/** A card as the switch names it, with what somebody has to know before choosing it. */
	const cardLabel = (one: Account) => {
		const marks = [
			lateOnes.has(one.id) ? t("invoice.lateMark") : null,
			one.archivedAt !== null ? t("invoice.archivedMark") : null,
		].filter((mark): mark is string => mark !== null);
		return marks.length === 0 ? one.name : `${one.name} (${marks.join(", ")})`;
	};

	/**
	 * A card from another space, which "Todos" on the overview links to. This screen reads the
	 * space that is open, and it showed another card with nothing said.
	 */
	const elsewhere = useQuery({
		queryKey: ["accountsEverywhere", "includingArchived"],
		enabled: Boolean(
			session && asked.cartao && !accounts.isPending && invoiceAccount?.id !== asked.cartao,
		),
		queryFn: () => session?.accounts.listEverywhere({ includeArchived: true }) ?? [],
	});
	const cardElsewhere = (elsewhere.data ?? []).find(
		(one) => one.id === asked.cartao && one.spaceId !== spaceId,
	);
	const spaceOfCard = cardElsewhere
		? spaces.find((space) => space.id === cardElsewhere.spaceId)
		: undefined;
	const cycle: CardCycle | null =
		invoiceAccount && invoiceAccount.closingDay !== null && invoiceAccount.dueDay !== null
			? { closingDay: invoiceAccount.closingDay, dueDay: invoiceAccount.dueDay }
			: null;

	// The invoice the purchases of today land on, which is the one to open on.
	const openMonth = cycle ? invoiceMonthOf(today, cycle) : "";
	const shown = asked.mes ?? openMonth;

	// Which pieces of plastic charge this invoice. Two is normal: the holder and the
	// extra card somebody else in the house carries.
	// The archived ones too, for the name of a purchase made with a card since put away.
	const cards = useQuery({
		queryKey: ["cards", spaceId, "includingArchived"],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.cards.list(spaceId, { includeArchived: true }) ?? [],
	});

	const records = useQuery({
		queryKey: ["transactions", spaceId, "invoice", invoiceAccount?.id, shown],
		enabled: Boolean(session && currentSpace && invoiceAccount && shown !== ""),
		queryFn: () =>
			session?.transactions.list({
				spaceId,
				accountId: invoiceAccount?.id,
				invoiceMonth: shown,
				limit: 500,
			}) ?? [],
	});

	// Where this invoice stands, from the model. The screen adds nothing up itself, so it
	// cannot disagree with the overview about the same card.
	const invoice = useQuery({
		queryKey: ["invoices", invoiceAccount?.id, shown, today],
		enabled: Boolean(session && invoiceAccount && shown !== "" && cycle),
		queryFn: () => session?.invoices.get(invoiceAccount?.id ?? "", shown, today) ?? null,
	});

	const older = useQuery({
		queryKey: ["invoices", invoiceAccount?.id, "all", today],
		enabled: Boolean(session && invoiceAccount && cycle),
		queryFn: () => session?.invoices.list(invoiceAccount?.id ?? "", today) ?? [],
	});

	/**
	 * Where a payment can come from: money, and never the card paying itself.
	 *
	 * Current accounts first, because an invoice is paid by the bank and not out of a
	 * pocket, and the list is sorted by name, so the default was whichever account somebody
	 * happened to have called something early in the alphabet.
	 */
	const payableFrom = (accounts.data ?? [])
		.filter((one) => one.kind !== "credit" && one.kind !== "voucher")
		.sort((left, right) => Number(right.kind === "checking") - Number(left.kind === "checking"));

	function afterInvoiceChange() {
		setProblem(null);
		afterRecordsChange(queries);
	}

	function openPayment(state: InvoiceState) {
		setProblem(null);
		setPaying(state);
		setPayFrom(payableFrom[0]?.id ?? "");
		// What is left, and not what was charged: paying an invoice twice because the field
		// came back with the whole amount is a mistake this screen can simply not make.
		setPayAmount(fillAmount(amountToPay(state), i18n.resolvedLanguage, invoiceAccount?.currency));
		setPayOn(state.dueOn);
	}

	/**
	 * The month of an invoice as a payment names it, with the year, which a record found a
	 * year later needs. A payment said "Pagamento da fatura de 2026-10", and with two cards
	 * nothing said which card it paid.
	 */
	const spelled = (month: string) =>
		new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			month: "long",
			year: "numeric",
			timeZone: "UTC",
		}).format(new Date(`${month}-01T00:00:00Z`));

	const pay = useMutation({
		mutationFn: async () => {
			if (!session || !invoiceAccount || !paying) throw new Error("no session");
			return session.invoices.pay({
				accountId: invoiceAccount.id,
				fromAccountId: payFrom,
				amount: readAmount(payAmount, invoiceAccount.currency),
				happenedOn: payOn as CalendarDate,
				month: paying.month,
				description: t("invoice.paymentOf", {
					month: spelled(paying.month),
					card: invoiceAccount.name,
				}),
			});
		},
		onSuccess: () => {
			setPaying(null);
			afterInvoiceChange();
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	const clearOld = useMutation({
		mutationFn: async () => {
			if (!session || !invoiceAccount) throw new Error("no session");
			return session.invoices.markPaidUntil({
				accountId: invoiceAccount.id,
				month: shown,
				fromAccountId: payFrom === "" ? (payableFrom[0]?.id ?? "") : payFrom,
				today,
				// The month is put in by the model, one record at a time, so what travels is
				// the sentence with a hole in it, and the name of every month it may fill it with.
				description: t("invoice.paymentOf", { month: "{{month}}", card: invoiceAccount.name }),
				monthNames: Object.fromEntries(
					(older.data ?? []).map((state) => [state.month, spelled(state.month)]),
				),
			});
		},
		onSuccess: () => {
			setClearingOld(false);
			afterInvoiceChange();
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	const moveOne = useMutation({
		mutationFn: async ({ id, towards }: { id: string; towards: "earlier" | "later" }) => {
			if (!session) throw new Error("no session");
			return session.invoices.move(id, towards);
		},
		onSuccess: afterInvoiceChange,
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	/**
	 * Moving purchases between two invoices when either already has a payment on it.
	 *
	 * The payment does not move with them, so one invoice ends up with credit and the other
	 * owes more, which is right and is a surprise if nobody says it first. So the screen says
	 * it and waits.
	 */
	const [askingFirst, setAskingFirst] = useState<{
		month: CalendarMonth;
		other: CalendarMonth;
		go: () => void;
	} | null>(null);

	function withPaymentsInMind(months: [CalendarMonth, CalendarMonth], go: () => void) {
		const paidOne = months.find((month) => {
			const one = (older.data ?? []).find((state) => state.month === month);
			return one !== undefined && (one.paid > 0 || one.scheduled > 0);
		});
		if (paidOne === undefined) {
			go();
			return;
		}
		setAskingFirst({
			month: paidOne,
			other: months.find((month) => month !== paidOne) ?? months[1],
			go,
		});
	}

	const reclose = useMutation({
		mutationFn: async () => {
			if (!session || !invoiceAccount) throw new Error("no session");
			return session.invoices.closedOn({
				accountId: invoiceAccount.id,
				month: shown,
				day: closedDay as CalendarDate,
			});
		},
		onSuccess: () => {
			setClosedDay("");
			afterInvoiceChange();
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	if (!currentSpace) return null;

	/**
	 * Closed to somebody who only ever sees the records they wrote.
	 *
	 * An invoice is the whole of what the card will charge, whoever made the purchases, so
	 * it is not a thing that can be narrowed to one person: the model refuses to read it one
	 * person at a time. Without this the screen drew the household's bill above a list
	 * holding one purchase of their own, with a button offering to pay it.
	 */
	if (mine.ready && mine.seesOwnRowsOnly) {
		return (
			<div className="space-y-6">
				<InsightTitle level="h1">{t("invoice.title")}</InsightTitle>
				<EmptyState
					icon="wallet"
					title={t("invoice.yoursOnlyTitle")}
					description={t("invoice.yoursOnlyBody")}
				/>
			</div>
		);
	}

	if (!accounts.isPending && invoiceAccounts.length === 0) {
		return (
			<div className="space-y-6">
				<InsightTitle level="h1">{t("invoice.noCardTitle")}</InsightTitle>
				{/* A way out that is not one for this person is worse than none: it led to
				    Accounts, where that button does not exist for them. And taking the
				    button away is not enough on its own, because the sentence beside it
				    still told them to add a card. Whichever of the two is true gets said,
				    and neither until the member list has answered. */}
				{!ready ? (
					<Skeleton lines={3} />
				) : (
					<EmptyState
						icon="wallet"
						title={t("invoice.noCardTitle")}
						description={mayMakeAnAccount ? t("invoice.noCardBody") : t("invoice.noCardForYou")}
						action={
							mayMakeAnAccount ? (
								<Link
									to={ROUTES.accounts}
									className={buttonClasses({ variant: "primary", size: "medium" })}
								>
									{t("accounts.create")}
								</Link>
							) : null
						}
					/>
				)}
			</div>
		);
	}

	// Purchases only. A payment carries the same invoice stamp, which is what makes it a
	// payment of that invoice, and it belongs beside the total rather than inside a table
	// headed with what the card charged.
	const rows = (records.data ?? []).filter((row) => row.counterAccountId !== invoiceAccount?.id);
	const state = invoice.data ?? undefined;
	const period = state ? { from: state.from, to: state.to } : null;
	const dueOn = state?.dueOn ?? null;

	const everyPlastic = (cards.data ?? []).filter(
		(one) => invoiceAccount !== null && one.creditAccountId === invoiceAccount.id,
	);
	const onThisInvoice = everyPlastic.filter((one) => one.archivedAt === null);
	/**
	 * Which plastic made each purchase, when more than one charges this invoice: the holder's
	 * card and the extra one somebody else in the house carries are one bill and two people.
	 * The last four digits only where two plastics share a name.
	 */
	const severalPlastics = everyPlastic.length > 1;
	const plasticNames = new Map(
		cardOptions(everyPlastic, t).map((option) => [option.value, option.label]),
	);

	/**
	 * Every invoice before this one that still owes something, which is what one action
	 * clears: the same filter the repository applies, so the number on the button is the
	 * number of invoices it marks.
	 */
	const owingBefore = (older.data ?? []).filter((one) => one.month < shown && amountToPay(one) > 0);

	/**
	 * How much of the limit is left, from the same function the overview reads, so the two
	 * screens cannot disagree about one card.
	 *
	 * It is a fact about the card today and not about the invoice on screen, so it counts from
	 * the open invoice whichever month is being looked at. Undefined while the invoices are
	 * still being read, which is not the same as null: null is a card nobody wrote a limit for.
	 */
	/**
	 * And nothing when the card's account counts in another currency than the space.
	 *
	 * The limit is a figure in the account's currency and what is owed is a figure in the
	 * currency of the space, because that is what the stored rate of a purchase converts to.
	 * Subtracting one from the other would be arithmetic between two units.
	 */
	const limitInAnotherCurrency =
		invoiceAccount !== null &&
		invoiceAccount.creditLimit !== null &&
		invoiceAccount.currency !== currentSpace.baseCurrency;

	const limitLeft =
		invoiceAccount && cycle && older.data && !limitInAnotherCurrency
			? limitLeftOf({ creditLimit: invoiceAccount.creditLimit, states: older.data })
			: undefined;

	// The year is only worth saying when it is not this one.
	function monthLabel(month: string): string {
		if (month === "") return "";
		return new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			month: "long",
			year: month.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
			timeZone: "UTC",
		}).format(new Date(`${month}-01T00:00:00Z`));
	}
	const monthName = monthLabel(shown);

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<InsightTitle
					level="h1"
					detail={
						period
							? t("invoice.period", {
									from: dayAndMonth(period.from),
									to: dayAndMonth(period.to),
								})
							: undefined
					}
				>
					{invoiceHeadline(t, monthName, invoiceAccount?.name ?? "", state)}
				</InsightTitle>

				<div className="flex flex-wrap items-end gap-3">
					{/* The cards side by side on a wide screen while there are few enough of them to
					    read at a glance, the late one marked; a list on a telephone or with more. */}
					{invoiceAccounts.length > 1 && invoiceAccounts.length <= 4 ? (
						<Segmented
							className="hidden md:flex"
							label={t("invoice.card")}
							value={invoiceAccount?.id ?? ""}
							onChange={(id) => goTo({ cartao: id })}
							options={invoiceAccounts.map((one) => ({ value: one.id, label: cardLabel(one) }))}
						/>
					) : null}
					{invoiceAccounts.length > 1 ? (
						<div className={invoiceAccounts.length <= 4 ? "md:hidden" : undefined}>
							<Select
								label={t("invoice.card")}
								value={invoiceAccount?.id ?? ""}
								onChange={(event) => goTo({ cartao: event.target.value })}
								options={invoiceAccounts.map((one) => ({ value: one.id, label: cardLabel(one) }))}
							/>
						</div>
					) : null}
					<div className="flex items-center gap-1">
						<Button
							size="small"
							variant="secondary"
							onClick={() => goTo({ cartao: invoiceAccount?.id, mes: addMonthsToMonth(shown, -1) })}
							aria-label={t("invoice.previous")}
						>
							{t("invoice.previousShort")}
						</Button>
						<Button
							size="small"
							variant="secondary"
							onClick={() => goTo({ cartao: invoiceAccount?.id, mes: addMonthsToMonth(shown, 1) })}
							aria-label={t("invoice.next")}
						>
							{t("invoice.nextShort")}
						</Button>
					</div>
				</div>
			</div>

			{/* A card of another space, linked from "Todos" on the overview. The space is not
			    changed behind somebody's back: the screen says whose card it is and offers it. */}
			{cardElsewhere && spaceOfCard ? (
				<Callout tone="attention">
					{t("invoice.cardOfAnotherSpace", { space: spaceOfCard.name })}{" "}
					<Button size="small" variant="secondary" onClick={() => selectSpace(spaceOfCard.id)}>
						{t("invoice.openInSpace", { space: spaceOfCard.name })}
					</Button>
				</Callout>
			) : null}

			{cycle === null ? (
				<Callout tone="attention" title={t("invoice.noCycleTitle")}>
					{t("invoice.noCycleBody")}{" "}
					<Link to={ROUTES.accounts} className="underline">
						{t("invoice.goToAccounts")}
					</Link>
				</Callout>
			) : null}

			{problem ? (
				<Callout tone="problem" title={t("rules.somethingWentWrong")}>
					{problem}
				</Callout>
			) : null}

			<section className="space-y-2">
				{invoice.isPending ? (
					<Skeleton lines={1} />
				) : (state?.withoutRate ?? 0) > 0 ? (
					/* A purchase in another currency with no rate for the day has no honest figure
					   here, and a total that quietly leaves it out is worse than no total. The
					   purchases are still listed below, and the way out is on the record itself. */
					<Callout tone="attention" title={t("invoice.noRateTitle")}>
						{t("invoice.noRateBody")}
					</Callout>
				) : (
					<p className="font-mono text-3xl tabular-nums">
						<Value
							amount={state?.charged ?? 0}
							currency={currentSpace.baseCurrency}
							tone="neutral"
						/>
					</p>
				)}

				{(state?.inOtherCurrencies ?? 0) > 0 && (state?.withoutRate ?? 0) === 0 ? (
					<p className="text-sm text-quiet">
						{t("invoice.countedIn", { currency: currentSpace.baseCurrency })}
					</p>
				) : null}
				{/* The day it falls due matters while something is owed on it. On one that is
				    settled it is a date nobody has to do anything about. */}
				<p className="text-sm text-quiet">
					{t(`invoice.standing.${state?.standing ?? "open"}`)}
					{dueOn && (state?.left ?? 0) > 0
						? ` ${t("invoice.dueOn", { day: dayAndMonth(dueOn) })}`
						: ""}
				</p>

				{state && state.paid !== 0 && state.withoutRate === 0 ? (
					<p className="text-sm text-quiet">
						{t("invoice.paidSoFar")}{" "}
						<Value amount={state.paid} currency={currentSpace.baseCurrency} />
						{state.left > 0 ? (
							<>
								{". "}
								{t("invoice.stillToPay")}{" "}
								<Value amount={state.left} currency={currentSpace.baseCurrency} />
							</>
						) : null}
					</p>
				) : null}

				{/* Credit moves from one invoice to the next, and each end of it says so. */}
				{state && state.carriedIn > 0 ? (
					<p className="text-sm text-quiet">
						{t("invoice.carriedIn")}{" "}
						<Value amount={state.carriedIn} currency={currentSpace.baseCurrency} />
					</p>
				) : null}
				{state && state.carriedOut > 0 ? (
					<p className="text-sm text-quiet">
						{t("invoice.carriedOut")}{" "}
						<Value amount={state.carriedOut} currency={currentSpace.baseCurrency} />
					</p>
				) : null}

				{/* The debt a card from release 1.0 was written down with is an invoice of its own,
				    with no purchase in it, so this says where the amount comes from. */}
				{state && state.opening > 0 ? (
					<p className="text-sm text-quiet">
						{t("invoice.openingDebt")}{" "}
						<Value amount={state.opening} currency={currentSpace.baseCurrency} />
					</p>
				) : null}

				{/* A payment dated ahead pays from its day. Until then the money is in the bank and
				    the invoice is still owed, so it stays in what falls due, and this says why. */}
				{state && state.scheduled > 0 && state.scheduledOn ? (
					<p className="text-sm text-quiet">
						{t("invoice.scheduled", { day: dayAndMonth(state.scheduledOn) })}{" "}
						<Value amount={state.scheduled} currency={currentSpace.baseCurrency} />
					</p>
				) : null}

				{state?.late ? <p className="text-sm text-seal">{t("invoice.noInterest")}</p> : null}

				{/* How much of the limit is left, and not what the limit is. The limit on its own
				    is a number nobody acts on, and this is the one the card will refuse. */}
				{limitInAnotherCurrency ? (
					<p className="text-sm text-quiet">{t("dashboard.limitInAnotherCurrency")}</p>
				) : limitLeft === undefined ? null : limitLeft === null ? (
					<p className="text-sm text-quiet">{t("dashboard.noLimitYet")}</p>
				) : (
					<p className="text-sm text-quiet">
						{t("dashboard.limitLeft")}{" "}
						<Value amount={limitLeft} currency={currentSpace.baseCurrency} tone="neutral" />
					</p>
				)}
				{onThisInvoice.length > 0 ? (
					<p className="text-sm text-quiet">
						{t("cards.onInvoice")}:{" "}
						{onThisInvoice
							.map((one) =>
								one.lastFour === null
									? one.name
									: `${one.name} (${t("cards.digits", { digits: one.lastFour })})`,
							)
							.join(", ")}
					</p>
				) : null}

				{/* The two do not depend on each other. The earlier invoices used to be offered only
				    beside a payment of this one, so an open invoice with nothing on it, which is
				    what somebody who has just updated sees first, hid every invoice they owe. */}
				{(mayPay && state && amountToPay(state) > 0) || (mayPayOld && owingBefore.length > 0) ? (
					<div className="flex flex-wrap gap-2 pt-2">
						{mayPay && state && amountToPay(state) > 0 ? (
							<Button onClick={() => openPayment(state)}>{t("invoice.pay")}</Button>
						) : null}
						{mayPayOld && owingBefore.length > 0 ? (
							<Button variant="secondary" onClick={() => setClearingOld(true)}>
								{t("invoice.payOld", { count: owingBefore.length })}
							</Button>
						) : null}
					</div>
				) : null}
			</section>

			{records.isPending ? <Skeleton lines={4} /> : null}

			{!records.isPending && rows.length === 0 ? (
				<p className="text-sm text-quiet">{t("invoice.empty")}</p>
			) : null}

			{rows.length > 0 ? (
				<Panel flush>
					<Table
						caption={t("invoice.caption", { card: invoiceAccount?.name ?? "", month: monthName })}
					>
						<TableHead>
							<TableRow>
								<TableHeader>{t("transactions.day")}</TableHeader>
								<TableHeader>{t("transactions.description")}</TableHeader>
								{severalPlastics ? <TableHeader>{t("invoice.card")}</TableHeader> : null}
								<TableHeader numeric={true}>{t("transactions.amount")}</TableHeader>
								<TableHeader>
									<span className="sr-only">{t("transactions.actions")}</span>
								</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell className="whitespace-nowrap font-mono text-quiet">
										{dayAndMonth(row.happenedOn)}
									</TableCell>
									<TableCell>{row.description}</TableCell>
									{severalPlastics ? (
										<TableCell className="text-quiet">
											{plasticNames.get(row.cardId ?? "") ?? t("invoice.noCard")}
										</TableCell>
									) : null}
									<TableCell numeric={true}>
										<Value amount={row.amount} currency={row.currency} tone="auto" />
									</TableCell>
									<TableCell>
										{mayMove ? (
											<Menu
												align="end"
												trigger={
													<Button
														size="small"
														variant="quiet"
														aria-label={t("transactions.actions")}
													>
														<Icon name="settings" size="small" />
													</Button>
												}
											>
												<MenuItem
													onSelect={() =>
														withPaymentsInMind([shown, addMonthsToMonth(shown, -1)], () =>
															moveOne.mutate({ id: row.id, towards: "earlier" }),
														)
													}
												>
													{t("invoice.moveEarlier")}
												</MenuItem>
												<MenuItem
													onSelect={() =>
														withPaymentsInMind([shown, addMonthsToMonth(shown, 1)], () =>
															moveOne.mutate({ id: row.id, towards: "later" }),
														)
													}
												>
													{t("invoice.moveLater")}
												</MenuItem>
											</Menu>
										) : null}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Panel>
			) : null}

			{/* The bank closes a day either side of the day this application expected, because
			    of a weekend or a holiday, and everything charged in between is on the wrong
			    invoice. Saying which day it really closed moves all of them at once. */}
			{mayReclose && cycle ? (
				<Disclosure summary={t("invoice.reallyClosedOn")}>
					<p className="max-w-[62ch] text-quiet text-sm">{t("invoice.reallyClosedOnHint")}</p>
					<div className="mt-3 flex flex-wrap items-end gap-3">
						<Field
							label={t("invoice.closedOnDay")}
							type="date"
							value={closedDay}
							onChange={(event) => setClosedDay(event.target.value)}
						/>
						<Button
							variant="secondary"
							disabled={closedDay === "" || reclose.isPending}
							onClick={() =>
								withPaymentsInMind([shown, addMonthsToMonth(shown, 1)], () => reclose.mutate())
							}
						>
							{t("invoice.moveThem")}
						</Button>
					</div>
				</Disclosure>
			) : null}

			<Dialog
				open={askingFirst !== null}
				onOpenChange={(next) => !next && setAskingFirst(null)}
				title={t("invoice.alreadyPaidTitle")}
				description={
					askingFirst
						? t("invoice.alreadyPaidBody", {
								month: monthLabel(askingFirst.month),
								other: monthLabel(askingFirst.other),
							})
						: ""
				}
				closeLabel={t("actions.close")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setAskingFirst(null)}>
							{t("actions.cancel")}
						</Button>
						<Button
							onClick={() => {
								askingFirst?.go();
								setAskingFirst(null);
							}}
						>
							{t("invoice.moveAnyway")}
						</Button>
					</>
				}
			>
				{problem ? <Callout tone="problem">{problem}</Callout> : null}
			</Dialog>

			<Dialog
				open={paying !== null}
				onOpenChange={(next) => !next && setPaying(null)}
				title={t("invoice.payTitle")}
				description={t("invoice.payDescription")}
				closeLabel={t("actions.close")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setPaying(null)}>
							{t("actions.cancel")}
						</Button>
						<Button onClick={() => pay.mutate()} disabled={pay.isPending}>
							{t("invoice.pay")}
						</Button>
					</>
				}
			>
				<div className="space-y-4">
					<Select
						label={t("invoice.payFrom")}
						value={payFrom}
						onChange={(event) => setPayFrom(event.target.value)}
						options={accountOptions(payableFrom, t)}
					/>
					<Field
						label={t("transactions.amount")}
						hint={t("invoice.payPartHint")}
						value={payAmount}
						onChange={(event) => setPayAmount(event.target.value)}
						numeric={true}
						inputMode="decimal"
					/>
					<Field
						label={t("transactions.day")}
						type="date"
						value={payOn}
						onChange={(event) => setPayOn(event.target.value)}
					/>
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</div>
			</Dialog>

			<Dialog
				open={clearingOld}
				onOpenChange={setClearingOld}
				title={t("invoice.payOldTitle")}
				description={t("invoice.payOldDescription", { count: owingBefore.length })}
				closeLabel={t("actions.close")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setClearingOld(false)}>
							{t("actions.cancel")}
						</Button>
						<Button onClick={() => clearOld.mutate()} disabled={clearOld.isPending}>
							{t("invoice.payOldAction")}
						</Button>
					</>
				}
			>
				<div className="space-y-4">
					<Select
						label={t("invoice.payFrom")}
						value={payFrom === "" ? (payableFrom[0]?.id ?? "") : payFrom}
						onChange={(event) => setPayFrom(event.target.value)}
						options={accountOptions(payableFrom, t)}
					/>
					<p className="text-quiet text-sm">{t("invoice.payOldHint")}</p>
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</div>
			</Dialog>
		</div>
	);
}
