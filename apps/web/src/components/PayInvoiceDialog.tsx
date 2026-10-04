// Paying an invoice: with money from an account, with another credit card, or in parts.
//
// Part 2, C.8 of the request for 2.0.0. The three are one question, how to pay, so they are
// one dialog: the button "Pagar fatura" asks it, and "Parcelar o que falta" opens it on the
// third answer. Before anything is written it says which invoices change and what it costs,
// which is the arithmetic of the core (`invoiceSplit`) on what is typed, and the model checks
// the same again when it writes.

import {
	addMonthsToMonth,
	amountToPay,
	type CalendarDate,
	type CalendarMonth,
	type CurrencyCode,
	type InvoiceState,
	invoiceMonthOf,
	invoiceSplit,
	MAX_INSTALLMENTS,
} from "@cofre/core";
import type { Account, Transaction } from "@cofre/storage";
import { Button, Callout, Dialog, Field, Segmented, Select } from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { afterRecordsChange } from "../lib/afterRecords.ts";
import { fillAmount, readAmount } from "../lib/amounts.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { accountOptions } from "../lib/wayLabel.ts";
import { useCofre } from "../storage/CofreProvider.tsx";

export type PayWay = "money" | "card" | "parts";

/** The category the cost of an arrangement goes to, found by its name, which is all it has. */
const FEES = ["tarifas e juros", "fees and interest"];

export function PayInvoiceDialog({
	state,
	card,
	accounts,
	waiting,
	today,
	startWith,
	ways,
	onClose,
}: {
	/** The invoice, or nothing while the dialog is closed. */
	state: InvoiceState | null;
	card: Account;
	/** Every account of the space, the archived ones too. */
	accounts: readonly Account[];
	/** A payment of this invoice dated after today, which an arrangement would pay again. */
	waiting: Transaction | null;
	today: CalendarDate;
	startWith: PayWay;
	/** The ways this person may pay by, in the order they are offered. */
	ways: readonly PayWay[];
	onClose: () => void;
}) {
	const { t, i18n } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();
	const language = i18n.resolvedLanguage;
	const currency = card.currency as CurrencyCode;

	const [way, setWay] = useState<PayWay>(startWith);
	const [problem, setProblem] = useState<string | null>(null);
	// With money.
	const [from, setFrom] = useState("");
	const [amount, setAmount] = useState("");
	const [day, setDay] = useState("");
	// With another card.
	const [payer, setPayer] = useState("");
	const [charged, setCharged] = useState("");
	// In parts, and the parts of either.
	const [parts, setParts] = useState("1");
	const [eachPart, setEachPart] = useState(false);
	const [entry, setEntry] = useState("");
	const [entryFrom, setEntryFrom] = useState("");
	const [useWaiting, setUseWaiting] = useState(false);
	const [firstMonth, setFirstMonth] = useState("");
	const [agreedOn, setAgreedOn] = useState("");
	const [tax, setTax] = useState("");
	const [categoryId, setCategoryId] = useState("");

	/** Money comes from a current account, savings or cash: never an investment, never a card. */
	const moneyAccounts = accounts
		.filter((one) => one.archivedAt === null && ["checking", "savings", "cash"].includes(one.kind))
		.sort((left, right) => Number(right.kind === "checking") - Number(left.kind === "checking"));
	/** Another card of this space, in use, with a cycle, counting in the same currency. */
	const otherCards = accounts.filter(
		(one) =>
			one.kind === "credit" &&
			one.id !== card.id &&
			one.archivedAt === null &&
			one.closingDay !== null &&
			one.dueDay !== null &&
			one.currency === card.currency,
	);
	const offered = ways.filter((one) => one !== "card" || otherCards.length > 0);

	const categories = useQuery({
		queryKey: ["categories", card.spaceId],
		enabled: Boolean(session && state),
		queryFn: () => session?.categories.list(card.spaceId) ?? [],
	});
	const expenseCategories = (categories.data ?? []).filter((one) => one.kind === "expense");
	const fees = expenseCategories.find((one) => FEES.includes(one.name.trim().toLowerCase()));

	// Opening is what fills the form, with what is owed and the days it usually goes by, and
	// only opening: what the person chose stays while the dialog is open.
	// biome-ignore lint/correctness/useExhaustiveDependencies: filled once per opening
	useEffect(() => {
		if (!state) return;
		const owed = fillAmount(amountToPay(state), language, currency);
		setWay(startWith);
		setProblem(null);
		setFrom(moneyAccounts[0]?.id ?? "");
		setAmount(owed);
		setDay(state.dueOn < today ? today : state.dueOn);
		setPayer(otherCards[0]?.id ?? "");
		setCharged(owed);
		setParts(startWith === "parts" ? "6" : "1");
		setEachPart(false);
		setEntry("");
		setEntryFrom(moneyAccounts[0]?.id ?? "");
		setUseWaiting(false);
		setFirstMonth("");
		setAgreedOn(state.dueOn < today ? today : state.dueOn);
		setTax("");
	}, [state, startWith]);
	useEffect(() => {
		if (categoryId === "" && fees) setCategoryId(fees.id);
	}, [fees, categoryId]);

	const payerAccount = otherCards.find((one) => one.id === payer);
	const cycleOfCard = { closingDay: card.closingDay ?? 1, dueDay: card.dueDay ?? 1 };
	const agreement = (agreedOn === "" ? (state?.dueOn ?? today) : agreedOn) as CalendarDate;
	const firstOfSplit = (
		firstMonth === "" ? invoiceMonthOf(agreement, cycleOfCard) : firstMonth
	) as CalendarMonth;

	const monthName = (month: string) =>
		new Intl.DateTimeFormat(language === "en" ? "en" : "pt-BR", {
			month: "long",
			year: month.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
			timeZone: "UTC",
		}).format(new Date(`${month}-01T00:00:00Z`));
	const spelled = (month: string) =>
		new Intl.DateTimeFormat(language === "en" ? "en" : "pt-BR", {
			month: "long",
			year: "numeric",
			timeZone: "UTC",
		}).format(new Date(`${month}-01T00:00:00Z`));
	const money = (cents: number) =>
		new Intl.NumberFormat(language === "en" ? "en" : "pt-BR", {
			style: "currency",
			currency,
		}).format(cents / 100);
	const read = (text: string) => (text.trim() === "" ? 0 : readAmount(text, currency));
	const count = Number(parts);

	/**
	 * What it costs and which invoices it lands on, said before anything is written. Nothing
	 * while a figure cannot be read or does not add up: the button then says why, from the model.
	 */
	const preview = (() => {
		if (!state) return null;
		try {
			if (way === "card" && payerAccount && payerAccount.closingDay && payerAccount.dueDay) {
				const split = invoiceSplit({
					owed: read(amount),
					entry: 0,
					parts: count,
					amount: read(charged),
					eachPart,
				});
				const first = invoiceMonthOf((day || today) as CalendarDate, {
					closingDay: payerAccount.closingDay,
					dueDay: payerAccount.dueDay,
				});
				const values = {
					card: payerAccount.name,
					cost: money(split.totalCost),
					from: monthName(first),
					to: monthName(addMonthsToMonth(first, count - 1)),
				};
				return count === 1
					? t("invoice.withCardCostsOne", values)
					: t("invoice.withCardCosts", values);
			}
			if (way === "parts") {
				const split = invoiceSplit({
					owed: state.left,
					entry: useWaiting && waiting ? waiting.amountInBase : read(entry),
					parts: count,
					amount: read(amount),
					eachPart,
				});
				const values = {
					cost: money(split.totalCost + read(tax)),
					from: monthName(firstOfSplit),
					to: monthName(addMonthsToMonth(firstOfSplit, count - 1)),
				};
				return count === 1 ? t("invoice.splitCostsOne", values) : t("invoice.splitCosts", values);
			}
		} catch {
			return null;
		}
		return null;
	})();

	const done = () => {
		afterRecordsChange(queries);
		onClose();
	};
	const failed = (error: unknown) => setProblem(sayWhy(error, t));

	const write = useMutation({
		mutationFn: async () => {
			if (!session || !state) throw new Error("no session");
			const names = { month: spelled(state.month), card: card.name };
			if (way === "money") {
				return session.invoices.pay({
					accountId: card.id,
					fromAccountId: from,
					amount: readAmount(amount, currency),
					happenedOn: day as CalendarDate,
					month: state.month,
					description: t("invoice.paymentOf", names),
				});
			}
			if (way === "card") {
				return session.invoices.payWithCard({
					accountId: card.id,
					month: state.month,
					cardAccountId: payer,
					amount: readAmount(amount, currency),
					charged: readAmount(charged, currency),
					eachPart,
					parts: count,
					happenedOn: day as CalendarDate,
					today,
					categoryId: categoryId === "" ? null : categoryId,
					description: t("invoice.paidWithCardOf", { ...names, by: payerAccount?.name ?? "" }),
					costDescription: t("invoice.paidWithCardCostOf", names),
				});
			}
			return session.invoices.split({
				accountId: card.id,
				month: state.month,
				entry: useWaiting ? 0 : read(entry),
				entryFromAccountId: useWaiting || read(entry) === 0 ? null : entryFrom,
				useAsEntry: useWaiting && waiting ? waiting.id : null,
				parts: count,
				amount: readAmount(amount, currency),
				eachPart,
				firstMonth: firstMonth === "" ? null : (firstMonth as CalendarMonth),
				agreedOn: agreement,
				today,
				categoryId: categoryId === "" ? null : categoryId,
				tax: read(tax),
				description: t("invoice.splitOf", names),
				costDescription: t("invoice.splitCostOf", names),
				entryDescription: t("invoice.splitEntryOf", names),
				taxDescription: t("invoice.splitTaxOf", names),
			});
		},
		onSuccess: done,
		onError: failed,
	});

	// The payment waiting for its day, taken away so the invoice is not paid twice.
	const dropWaiting = useMutation({
		mutationFn: async () => {
			if (!session || !waiting) throw new Error("no session");
			await session.transactions.remove(waiting.id);
		},
		onSuccess: () => {
			afterRecordsChange(queries);
			setProblem(null);
		},
		onError: failed,
	});

	const partsOptions = Array.from({ length: MAX_INSTALLMENTS }, (_unused, index) => ({
		value: String(index + 1),
		label: t("invoice.partsOption", { count: index + 1 }),
	}));
	const firstOptions = state
		? Array.from({ length: 6 }, (_unused, index) => {
				const month = addMonthsToMonth(state.month, index + 1);
				return { value: month, label: monthName(month) };
			})
		: [];
	const categoryField = (
		<Select
			label={t("invoice.costCategory")}
			hint={fees ? undefined : t("invoice.costCategoryMissing")}
			value={categoryId}
			onChange={(event) => setCategoryId(event.target.value)}
			options={[
				{ value: "", label: t("transactions.noCategory") },
				...expenseCategories.map((one) => ({ value: one.id, label: one.name })),
			]}
		/>
	);
	const partsFields = (
		<>
			<div className="grid gap-4 sm:grid-cols-2">
				<Select
					label={t("invoice.parts")}
					value={parts}
					onChange={(event) => setParts(event.target.value)}
					options={partsOptions}
				/>
				<Field
					label={way === "card" ? t("invoice.chargedByCard") : t("invoice.partsAmount")}
					value={way === "card" ? charged : amount}
					onChange={(event) =>
						way === "card" ? setCharged(event.target.value) : setAmount(event.target.value)
					}
					numeric={true}
					inputMode="decimal"
				/>
			</div>
			{/* A name of its own: the field above is "Valor das parcelas" too, and a screen reader
			    said two controls with one name. */}
			<Segmented
				label={t("invoice.partsAmountIs")}
				value={eachPart ? "each" : "total"}
				onChange={(value) => setEachPart(value === "each")}
				options={[
					{ value: "total", label: t("invoice.amountIsTotal") },
					{ value: "each", label: t("invoice.amountIsEach") },
				]}
			/>
		</>
	);
	const waitingFor = waiting && state?.scheduledBy === null ? waiting : null;
	// A payment waiting stops the other card and the split, and not a payment in money.
	const blockedByWaiting =
		waitingFor !== null && way !== "money" && !(way === "parts" && useWaiting);

	return (
		<Dialog
			open={state !== null}
			onOpenChange={(next) => !next && onClose()}
			title={t("invoice.payTitle")}
			description={
				way === "money"
					? t("invoice.payDescription")
					: way === "card"
						? t("invoice.payWithCardDescription")
						: t("invoice.splitDescription")
			}
			closeLabel={t("actions.close")}
			footer={
				<>
					<Button variant="quiet" onClick={onClose}>
						{t("actions.cancel")}
					</Button>
					<Button onClick={() => write.mutate()} disabled={write.isPending || blockedByWaiting}>
						{way === "money"
							? t("invoice.pay")
							: way === "card"
								? t("invoice.confirmPayWithCard")
								: t("invoice.confirmSplit")}
					</Button>
				</>
			}
		>
			<div className="space-y-4">
				{offered.length > 1 ? (
					<Segmented
						label={t("invoice.howToPay")}
						value={way}
						onChange={(value) => {
							setProblem(null);
							setWay(value as PayWay);
							if (value === "parts" && parts === "1") setParts("6");
						}}
						options={offered.map((one) => ({
							value: one,
							label:
								one === "money"
									? t("invoice.payWithMoney")
									: one === "card"
										? t("invoice.payWithCard")
										: t("invoice.payInParts"),
						}))}
					/>
				) : null}

				{waitingFor && way !== "money" ? (
					<Callout tone="attention">
						<p>
							{t("invoice.waitingPayment", {
								day: `${waitingFor.happenedOn.slice(8)}/${waitingFor.happenedOn.slice(5, 7)}`,
								amount: money(waitingFor.amountInBase),
							})}
						</p>
						<div className="mt-2 flex flex-wrap items-center gap-3">
							<Button
								size="small"
								variant="secondary"
								onClick={() => dropWaiting.mutate()}
								disabled={dropWaiting.isPending}
							>
								{t("invoice.deleteWaiting")}
							</Button>
							{way === "parts" ? (
								<label className="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										checked={useWaiting}
										onChange={(event) => setUseWaiting(event.target.checked)}
									/>
									{t("invoice.useWaitingAsEntry")}
								</label>
							) : null}
						</div>
					</Callout>
				) : null}

				{way === "money" ? (
					<>
						<Select
							label={t("invoice.payFrom")}
							value={from}
							onChange={(event) => setFrom(event.target.value)}
							options={accountOptions(moneyAccounts, t)}
						/>
						<Field
							label={t("transactions.amount")}
							hint={t("invoice.payPartHint")}
							value={amount}
							onChange={(event) => setAmount(event.target.value)}
							numeric={true}
							inputMode="decimal"
						/>
						<Field
							label={t("transactions.day")}
							type="date"
							value={day}
							onChange={(event) => setDay(event.target.value)}
						/>
					</>
				) : null}

				{way === "card" ? (
					<>
						<Select
							label={t("invoice.payingCard")}
							hint={t("invoice.sameSpaceOnly")}
							value={payer}
							onChange={(event) => setPayer(event.target.value)}
							options={otherCards.map((one) => ({ value: one.id, label: one.name }))}
						/>
						<Field
							label={t("invoice.receives")}
							value={amount}
							onChange={(event) => setAmount(event.target.value)}
							numeric={true}
							inputMode="decimal"
						/>
						{partsFields}
						<Field
							label={t("invoice.payDay")}
							type="date"
							value={day}
							onChange={(event) => setDay(event.target.value)}
						/>
						{categoryField}
					</>
				) : null}

				{way === "parts" ? (
					<>
						{useWaiting ? null : (
							<div className="grid gap-4 sm:grid-cols-2">
								<Field
									label={t("invoice.entry")}
									hint={t("invoice.entryHint")}
									value={entry}
									onChange={(event) => setEntry(event.target.value)}
									numeric={true}
									inputMode="decimal"
									placeholder={t("fields.amountPlaceholder")}
								/>
								<Select
									label={t("invoice.entryFrom")}
									value={entryFrom}
									onChange={(event) => setEntryFrom(event.target.value)}
									options={accountOptions(moneyAccounts, t)}
								/>
							</div>
						)}
						{partsFields}
						<div className="grid gap-4 sm:grid-cols-2">
							<Select
								label={t("invoice.firstInvoice")}
								value={firstOfSplit}
								onChange={(event) => setFirstMonth(event.target.value)}
								options={firstOptions}
							/>
							<Field
								label={t("invoice.agreedOn")}
								hint={t("invoice.agreedOnHint")}
								type="date"
								value={agreedOn}
								onChange={(event) => setAgreedOn(event.target.value)}
							/>
						</div>
						<Field
							label={t("invoice.tax")}
							hint={t("invoice.taxHint")}
							value={tax}
							onChange={(event) => setTax(event.target.value)}
							numeric={true}
							inputMode="decimal"
							placeholder={t("fields.amountPlaceholder")}
						/>
						{categoryField}
					</>
				) : null}

				{preview ? <p className="text-sm">{preview}</p> : null}
				{problem ? <Callout tone="problem">{problem}</Callout> : null}
			</div>
		</Dialog>
	);
}
