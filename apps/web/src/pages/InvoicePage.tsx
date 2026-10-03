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
	type CardCycle,
	type InvoiceState,
	invoiceMonthOf,
	limitLeftOf,
	todayIn,
} from "@cofre/core";
import {
	Button,
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
import { Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Value } from "../components/Value.tsx";
import { fillAmount, readAmount } from "../lib/amounts.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";

function dayAndMonth(date: string): string {
	return `${date.slice(8)}/${date.slice(5, 7)}`;
}

/**
 * The sentence at the top says where this invoice stands, which is the thing a person
 * opens the screen to find out.
 *
 * Paid comes before every question about days, because an invoice that is settled is not
 * one anybody needs to be told is three days late.
 */
function headline(
	t: (key: string, values?: Record<string, unknown>) => string,
	month: string,
	state: InvoiceState | undefined,
): string {
	if (!state) return t("invoice.openHeadline", { month, count: 0 });
	if (state.standing === "paid") return t("invoice.paidHeadline", { month });
	if (state.standing === "inCredit") return t("invoice.inCreditHeadline", { month });
	if (state.daysToClose > 0) return t("invoice.openHeadline", { month, count: state.daysToClose });
	if (state.daysToDue > 0) return t("invoice.closedHeadline", { month, count: state.daysToDue });
	if (state.daysToDue === 0) return t("invoice.dueTodayHeadline", { month });
	return t("invoice.pastHeadline", { month, count: Math.abs(state.daysToDue) });
}

export function InvoicePage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	/** Whether the way out of an empty screen is a way out for this person. */
	const iMay = useWhatIMayDo(spaceId);
	const mayMakeAnAccount = iMay.mayCall("accounts.create");
	const ready = iMay.ready;
	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");

	/**
	 * Which card and which invoice the address asked for.
	 *
	 * The overview leads here with a card named, because it draws a block per card and
	 * every button on one of them means "that one". Read once as the starting point rather
	 * than held as the truth, so the pickers on this screen still work: somebody who
	 * arrived by a link and then chose another card is choosing another card.
	 */
	const asked = useSearch({ from: ROUTES.invoices });

	const [invoiceAccountId, setInvoiceAccountId] = useState(asked.cartao ?? "");
	const [month, setMonth] = useState(asked.mes ?? "");
	const [problem, setProblem] = useState<string | null>(null);

	const [paying, setPaying] = useState<InvoiceState | null>(null);
	const [payFrom, setPayFrom] = useState("");
	const [payAmount, setPayAmount] = useState("");
	const [payOn, setPayOn] = useState("");
	const [clearingOld, setClearingOld] = useState(false);
	const [closedDay, setClosedDay] = useState("");

	const mine = iMay;
	const mayPay = mine.mayCall("invoices.pay");
	const mayMove = mine.mayCall("transactions.update");

	const accounts = useQuery({
		queryKey: ["accounts", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.accounts.list(spaceId) ?? [],
	});

	const invoiceAccounts = (accounts.data ?? []).filter((one) => one.kind === "credit");
	const invoiceAccount =
		invoiceAccounts.find((one) => one.id === invoiceAccountId) ?? invoiceAccounts[0] ?? null;
	const cycle: CardCycle | null =
		invoiceAccount && invoiceAccount.closingDay !== null && invoiceAccount.dueDay !== null
			? { closingDay: invoiceAccount.closingDay, dueDay: invoiceAccount.dueDay }
			: null;

	// The invoice the purchases of today land on, which is the one to open on.
	const openMonth = cycle ? invoiceMonthOf(today, cycle) : "";
	const shown = month === "" ? openMonth : month;

	// Which pieces of plastic charge this invoice. Two is normal: the holder and the
	// extra card somebody else in the house carries.
	const cards = useQuery({
		queryKey: ["cards", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.cards.list(spaceId) ?? [],
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
		void queries.invalidateQueries({ queryKey: ["invoices"] });
		void queries.invalidateQueries({ queryKey: ["transactions"] });
		void queries.invalidateQueries({ queryKey: ["balances"] });
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

	const pay = useMutation({
		mutationFn: async () => {
			if (!session || !invoiceAccount || !paying) throw new Error("no session");
			return session.invoices.pay({
				accountId: invoiceAccount.id,
				fromAccountId: payFrom,
				amount: readAmount(payAmount, invoiceAccount.currency),
				happenedOn: payOn as CalendarDate,
				month: paying.month,
				description: t("invoice.paymentOf", { month: paying.month }),
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
				// the sentence with a hole in it.
				description: t("invoice.paymentOf", { month: "{{month}}" }),
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
								<Link to={ROUTES.accounts}>
									<Button variant="primary">{t("accounts.create")}</Button>
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

	const onThisInvoice = (cards.data ?? []).filter(
		(one) => invoiceAccount !== null && one.creditAccountId === invoiceAccount.id,
	);

	/** Every invoice before this one that still owes something, which is what one action clears. */
	const owingBefore = (older.data ?? []).filter((one) => one.month < shown && one.left > 0);

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
			? limitLeftOf({
					creditLimit: invoiceAccount.creditLimit,
					states: older.data,
					openMonth,
				})
			: undefined;

	// The year is only worth saying when it is not this one.
	const monthName =
		shown === ""
			? ""
			: new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
					month: "long",
					year: shown.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
					timeZone: "UTC",
				}).format(new Date(`${shown}-01T00:00:00Z`));

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
					{headline(t, monthName, state)}
				</InsightTitle>

				<div className="flex items-end gap-3">
					{invoiceAccounts.length > 1 ? (
						<Select
							label={t("invoice.card")}
							value={invoiceAccount?.id ?? ""}
							onChange={(event) => {
								setInvoiceAccountId(event.target.value);
								setMonth("");
							}}
							options={invoiceAccounts.map((one) => ({ value: one.id, label: one.name }))}
						/>
					) : null}
					<div className="flex items-center gap-1">
						<Button
							size="small"
							variant="secondary"
							onClick={() => setMonth(addMonthsToMonth(shown, -1))}
							aria-label={t("invoice.previous")}
						>
							{t("invoice.previousShort")}
						</Button>
						<Button
							size="small"
							variant="secondary"
							onClick={() => setMonth(addMonthsToMonth(shown, 1))}
							aria-label={t("invoice.next")}
						>
							{t("invoice.nextShort")}
						</Button>
					</div>
				</div>
			</div>

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

				{mayPay && state && amountToPay(state) > 0 ? (
					<div className="flex flex-wrap gap-2 pt-2">
						<Button onClick={() => openPayment(state)}>{t("invoice.pay")}</Button>
						{owingBefore.length > 0 ? (
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
													onSelect={() => moveOne.mutate({ id: row.id, towards: "earlier" })}
												>
													{t("invoice.moveEarlier")}
												</MenuItem>
												<MenuItem onSelect={() => moveOne.mutate({ id: row.id, towards: "later" })}>
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
			{mayMove && cycle ? (
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
							onClick={() => reclose.mutate()}
						>
							{t("invoice.moveThem")}
						</Button>
					</div>
				</Disclosure>
			) : null}

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
						options={payableFrom.map((one) => ({ value: one.id, label: one.name }))}
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
						options={payableFrom.map((one) => ({ value: one.id, label: one.name }))}
					/>
					<p className="text-quiet text-sm">{t("invoice.payOldHint")}</p>
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</div>
			</Dialog>
		</div>
	);
}
