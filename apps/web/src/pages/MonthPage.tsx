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
	type CardCycle,
	dateInMonth,
	type MonthPart,
	monthMark,
	monthOf,
	monthPartDay,
	parseMoney,
	readMonthMark,
	todayIn,
} from "@cofre/core";
import type { Account, Transaction } from "@cofre/storage";
import {
	Button,
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
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

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

/** The same shape the rest of the interface puts an amount into a field in. */
function asText(row: Transaction | undefined): string {
	if (!row) return "";
	return String(Math.abs(row.amount) / 100).replace(".", ",");
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
	const [invoice, setInvoice] = useState<string | null>(null);
	const [accountId, setAccountId] = useState("");
	const [cardAccountId, setCardAccountId] = useState("");
	const [problem, setProblem] = useState<string | null>(null);
	const [saved, setSaved] = useState<string | null>(null);

	function goTo(next: string) {
		setMonth(next);
		setIncome(null);
		setSpending(null);
		setInvoice(null);
		setProblem(null);
		setSaved(null);
	}

	const enabled = Boolean(session && currentSpace);

	const accounts = useQuery({
		queryKey: ["accounts", spaceId],
		enabled,
		queryFn: () => session?.accounts.list(spaceId) ?? [],
	});

	const everyAccount = accounts.data ?? [];
	const moneyAccounts = everyAccount.filter((one) => one.kind !== "credit");
	const cardAccounts = everyAccount.filter((one) => one.kind === "credit");
	const account = moneyAccounts.find((one) => one.id === accountId) ?? likeliest(moneyAccounts);
	const cardAccount =
		cardAccounts.find((one) => one.id === cardAccountId) ?? cardAccounts[0] ?? null;
	const cycle = cycleOf(cardAccount);

	// A card that closes on the first puts the invoice of this month on a day of the month
	// before, so the window has to start there or the record would be read as missing and
	// written a second time.
	const from = dateInMonth(addMonthsToMonth(shown, -1), 1);
	const to = dateInMonth(shown, 31);

	const records = useQuery({
		queryKey: ["transactions", spaceId, "theMonth", shown],
		enabled: enabled && shown !== "",
		queryFn: () => session?.transactions.list({ spaceId, from, to, limit: 500 }) ?? [],
	});

	const rows = records.data ?? [];
	const mine = new Map<MonthPart, Transaction>();
	for (const row of rows) {
		const mark = readMonthMark(row.externalId);
		if (mark && mark.month === shown) mine.set(mark.part, row);
	}

	// What is in this month that somebody wrote a line at a time. It counts too, and
	// saying so is the only thing standing between this screen and a month counted twice.
	const firstOfMonth = dateInMonth(shown, 1);
	const byHand = rows.filter(
		(row) =>
			readMonthMark(row.externalId) === null &&
			row.happenedOn >= firstOfMonth &&
			row.happenedOn <= to &&
			row.kind !== "transfer",
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

	// Inside a sentence, where the component that draws an amount cannot go. The same
	// thing the check up and the budget do with the figures in their own sentences.
	const asMoney = (cents: number) =>
		new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			style: "currency",
			currency,
		}).format(cents / 100);

	const withYear = new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(`${shown}-01T00:00:00Z`));

	const text: Record<MonthPart, string> = {
		income: income ?? asText(mine.get("income")),
		spending: spending ?? asText(mine.get("spending")),
		invoice: invoice ?? asText(mine.get("invoice")),
	};
	const cents: Record<MonthPart, number | null> = {
		income: typedAmount(text.income, currency),
		spending: typedAmount(text.spending, currency),
		invoice: typedAmount(text.invoice, currency),
	};
	const left = (cents.income ?? 0) - (cents.spending ?? 0) - (cents.invoice ?? 0);

	const write = useMutation({
		mutationFn: async () => {
			if (!session || account === null) return;

			for (const part of ["income", "spending", "invoice"] as const) {
				if (part === "invoice" && cardAccount === null) continue;

				const into = part === "invoice" ? cardAccount : account;
				if (into === null) continue;

				const existing = mine.get(part);
				const amount = cents[part];

				if (amount === null) {
					if (existing) await session.transactions.remove(existing.id);
					continue;
				}

				const happenedOn = monthPartDay(shown, part, part === "invoice" ? cycle : null);
				const description = t(
					part === "income"
						? "theMonth.descriptionIncome"
						: part === "spending"
							? "theMonth.descriptionSpending"
							: "theMonth.descriptionInvoice",
					{ month: withYear },
				);

				if (existing) {
					await session.transactions.update(existing.id, {
						amount,
						happenedOn,
						description,
						accountId: into.id,
					});
					continue;
				}

				await session.transactions.create({
					spaceId,
					kind: part === "income" ? "income" : "expense",
					amount,
					happenedOn,
					description,
					accountId: into.id,
					externalId: monthMark(shown, part),
				});
			}
		},
		onSuccess: () => {
			setIncome(null);
			setSpending(null);
			setInvoice(null);
			setProblem(null);
			setSaved(shown);
			void queries.invalidateQueries({ queryKey: ["transactions"] });
			void queries.invalidateQueries({ queryKey: ["balances"] });
			void queries.invalidateQueries({ queryKey: ["advice"] });
		},
		onError: (error: unknown) => {
			setSaved(null);
			const rule =
				error !== null && typeof error === "object" && "rule" in error
					? String((error as { rule: unknown }).rule)
					: null;
			setProblem(
				rule === null
					? error instanceof Error
						? error.message
						: String(error)
					: t(`rules.${rule}`, { defaultValue: t("rules.unknown") }),
			);
		},
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		setProblem(null);
		setSaved(null);

		const unreadable = (["income", "spending", "invoice"] as const).some((part) =>
			isUnreadable(text[part], currency),
		);
		if (unreadable) {
			setProblem(t("theMonth.unreadable"));
			return;
		}
		// Nothing in all three, with nothing written for the month either, is somebody who
		// opened the screen and pressed the button. Taking away what is not there and
		// saying it worked would read as having lost something.
		if (cents.income === null && cents.spending === null && cents.invoice === null) {
			if (mine.size === 0) {
				setProblem(t("theMonth.nothingTyped"));
				return;
			}
		}
		write.mutate();
	}

	if (!currentSpace) return null;

	if (!accounts.isPending && moneyAccounts.length === 0) {
		return (
			<div className="space-y-6">
				<InsightTitle level="h1">{t("theMonth.title")}</InsightTitle>
				<EmptyState
					icon="wallet"
					title={t("theMonth.noAccountTitle")}
					description={t("theMonth.noAccountBody")}
					action={
						<Link to={ROUTES.accounts}>
							<Button variant="primary">{t("accounts.create")}</Button>
						</Link>
					}
				/>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<InsightTitle level="h1" detail={t("theMonth.subtitle")}>
					{t("theMonth.headline", { month: monthName })}
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

			<Panel>
				<form className="space-y-5" onSubmit={submit}>
					<Field
						label={t("theMonth.income")}
						hint={t("theMonth.incomeHint")}
						numeric={true}
						inputMode="decimal"
						value={text.income}
						onChange={(event) => setIncome(event.target.value)}
						placeholder="0,00"
					/>
					<Field
						label={t("theMonth.spending")}
						hint={t(
							cardAccounts.length === 0 ? "theMonth.spendingOnlyHint" : "theMonth.spendingHint",
						)}
						numeric={true}
						inputMode="decimal"
						value={text.spending}
						onChange={(event) => setSpending(event.target.value)}
						placeholder="0,00"
					/>
					{cardAccounts.length > 0 ? (
						<Field
							label={t("theMonth.invoice")}
							hint={t("theMonth.invoiceHint", { month: monthName })}
							numeric={true}
							inputMode="decimal"
							value={text.invoice}
							onChange={(event) => setInvoice(event.target.value)}
							placeholder="0,00"
						/>
					) : null}

					{moneyAccounts.length > 1 ? (
						<Select
							label={t("theMonth.where")}
							hint={t("theMonth.whereHint")}
							value={account?.id ?? ""}
							onChange={(event) => setAccountId(event.target.value)}
							options={moneyAccounts.map((one) => ({ value: one.id, label: one.name }))}
						/>
					) : null}
					{cardAccounts.length > 1 ? (
						<Select
							label={t("theMonth.whichCard")}
							value={cardAccount?.id ?? ""}
							onChange={(event) => setCardAccountId(event.target.value)}
							options={cardAccounts.map((one) => ({ value: one.id, label: one.name }))}
						/>
					) : null}

					<p className="text-sm text-quiet">
						{t("theMonth.clearHint")}
						{moneyAccounts.length === 1 && account
							? ` ${t("theMonth.landsIn", { account: account.name })}`
							: ""}
					</p>

					{cents.income !== null || cents.spending !== null || cents.invoice !== null ? (
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

					<Button type="submit" variant="primary" disabled={write.isPending}>
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
								{(["income", "spending", "invoice"] as const).map((part) => {
									const row = mine.get(part);
									if (!row) return null;
									return (
										<TableRow key={part}>
											<TableCell>{row.description}</TableCell>
											<TableCell className="whitespace-nowrap font-mono text-quiet">
												{dayAndMonth(row.happenedOn)}
											</TableCell>
											<TableCell numeric={true}>
												<Value amount={row.amount} currency={row.currency} tone="auto" />
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

			<Disclosure summary={t("theMonth.whatItWrites")} hint={t("theMonth.whatItWritesHint")}>
				<p className="text-sm leading-relaxed text-quiet">{t("theMonth.whatItWritesBody")}</p>
			</Disclosure>
		</div>
	);
}
