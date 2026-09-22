// The card invoice: what it will charge, when it closes and when it falls due.
//
// A purchase carries the invoice it landed on, written at the time it happened, so
// this screen reads that stamp rather than working the dates out again. Changing the
// closing day tomorrow does not move what already closed, which is the whole point of
// stamping it.

import {
	addMonthsToMonth,
	type CardCycle,
	daysBetween,
	invoiceClosingDate,
	invoiceDueDate,
	invoiceMonthOf,
	invoicePeriod,
	todayIn,
} from "@cofre/core";
import {
	Button,
	Callout,
	EmptyState,
	InsightTitle,
	Select,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@cofre/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Value } from "../components/Value.tsx";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

function dayAndMonth(date: string): string {
	return `${date.slice(8)}/${date.slice(5, 7)}`;
}

/**
 * The sentence at the top says where this invoice stands, which is the thing a person
 * opens the screen to find out. Four states, and today is one of them.
 */
function headline(
	t: (key: string, values?: Record<string, unknown>) => string,
	month: string,
	untilClosing: number,
	untilDue: number,
): string {
	if (untilClosing > 0) return t("invoice.openHeadline", { month, count: untilClosing });
	if (untilDue > 0) return t("invoice.closedHeadline", { month, count: untilDue });
	if (untilDue === 0) return t("invoice.dueTodayHeadline", { month });
	return t("invoice.pastHeadline", { month, count: Math.abs(untilDue) });
}

export function InvoicePage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace } = useCofre();

	const spaceId = currentSpace?.id ?? "";
	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");

	const [cardId, setCardId] = useState("");
	const [month, setMonth] = useState("");

	const accounts = useQuery({
		queryKey: ["accounts", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.accounts.list(spaceId) ?? [],
	});

	const cards = (accounts.data ?? []).filter((account) => account.kind === "credit");
	const card = cards.find((option) => option.id === cardId) ?? cards[0] ?? null;
	const cycle: CardCycle | null =
		card && card.closingDay !== null && card.dueDay !== null
			? { closingDay: card.closingDay, dueDay: card.dueDay }
			: null;

	// The invoice the purchases of today land on, which is the one to open on.
	const openMonth = cycle ? invoiceMonthOf(today, cycle) : "";
	const shown = month === "" ? openMonth : month;

	const records = useQuery({
		queryKey: ["transactions", spaceId, "invoice", card?.id, shown],
		enabled: Boolean(session && currentSpace && card && shown !== ""),
		queryFn: () =>
			session?.transactions.list({
				spaceId,
				accountId: card?.id,
				invoiceMonth: shown,
				limit: 500,
			}) ?? [],
	});

	if (!currentSpace) return null;

	if (!accounts.isPending && cards.length === 0) {
		return (
			<div className="space-y-6">
				<InsightTitle level="h1">{t("invoice.noCardTitle")}</InsightTitle>
				<EmptyState
					icon="wallet"
					title={t("invoice.noCardTitle")}
					description={t("invoice.noCardBody")}
					action={
						<Link to={ROUTES.accounts}>
							<Button variant="primary">{t("accounts.create")}</Button>
						</Link>
					}
				/>
			</div>
		);
	}

	const rows = records.data ?? [];
	const total = rows.reduce((sum, row) => sum + row.amount, 0);
	const closesOn = cycle && shown ? invoiceClosingDate(shown, cycle) : null;
	const dueOn = cycle && shown ? invoiceDueDate(shown, cycle) : null;
	const period = cycle && shown ? invoicePeriod(shown, cycle) : null;

	const untilClosing = closesOn === null ? 0 : daysBetween(today, closesOn);
	const untilDue = dueOn === null ? 0 : daysBetween(today, dueOn);

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
					{headline(t, monthName, untilClosing, untilDue)}
				</InsightTitle>

				<div className="flex items-end gap-3">
					{cards.length > 1 ? (
						<Select
							label={t("invoice.card")}
							value={card?.id ?? ""}
							onChange={(event) => {
								setCardId(event.target.value);
								setMonth("");
							}}
							options={cards.map((option) => ({ value: option.id, label: option.name }))}
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

			<section className="space-y-2">
				{records.isPending ? (
					<Skeleton lines={1} />
				) : (
					<p className="font-mono text-3xl tabular-nums">
						<Value
							amount={Math.abs(total)}
							currency={card?.currency ?? currentSpace.baseCurrency}
							tone="neutral"
						/>
					</p>
				)}
				<p className="text-sm text-graphite">
					{total > 0 ? t("invoice.inCredit") : t("invoice.toPay")}
					{dueOn ? ` ${t("invoice.dueOn", { day: dayAndMonth(dueOn) })}` : ""}
				</p>
				{card?.creditLimit ? (
					<p className="text-sm text-graphite">
						{t("invoice.limit")}{" "}
						<Value amount={card.creditLimit} currency={card.currency} tone="neutral" />
					</p>
				) : null}
			</section>

			{records.isPending ? <Skeleton lines={4} /> : null}

			{!records.isPending && rows.length === 0 ? (
				<p className="text-sm text-graphite">{t("invoice.empty")}</p>
			) : null}

			{rows.length > 0 ? (
				<Table caption={t("invoice.caption", { card: card?.name ?? "", month: monthName })}>
					<TableHead>
						<TableRow>
							<TableHeader>{t("transactions.day")}</TableHeader>
							<TableHeader>{t("transactions.description")}</TableHeader>
							<TableHeader numeric={true}>{t("transactions.amount")}</TableHeader>
						</TableRow>
					</TableHead>
					<TableBody>
						{rows.map((row) => (
							<TableRow key={row.id}>
								<TableCell className="whitespace-nowrap font-mono text-graphite">
									{dayAndMonth(row.happenedOn)}
								</TableCell>
								<TableCell>{row.description}</TableCell>
								<TableCell numeric={true}>
									<Value amount={row.amount} currency={row.currency} tone="auto" />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : null}
		</div>
	);
}
