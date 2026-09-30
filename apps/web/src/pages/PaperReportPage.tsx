// A whole month on paper, or in a PDF the browser writes.
//
// The report exists on several screens already, each answering its own question. This is
// the one page that puts the month in order, from what came in down to what the months
// ahead look like, for somebody who wants it in a file: an accountant, a partner who does
// not use the application, a folder.
//
// Nothing leaves the device. The browser's own print dialogue is what writes the PDF,
// which is registry 0046: it costs nothing to download, it works offline and in server
// mode alike, and it is the only route that produces a PDF a screen reader can read,
// because the browser derives the tags from this page.
//
// So this page is built for paper first. Every figure has a table beside or under it, no
// chart is the only carrier of a number, and the controls hide themselves when it prints.

import {
	addMonthsToMonth,
	type CalendarDate,
	type CalendarMonth,
	dateInMonth,
	lastDayOfMonth,
	moneyOnHand,
	monthOf,
	parseCalendarMonth,
	spendableNow,
	todayIn,
} from "@cofre/core";
import {
	Button,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@cofre/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Value } from "../components/Value.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";

function lastDayOf(month: CalendarMonth): CalendarDate {
	const { year, month: index } = parseCalendarMonth(month);
	return dateInMonth(month, lastDayOfMonth(year, index));
}

/** A heading and a rule, so a reader finds their way down a long page. */
function Part({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="break-inside-avoid-page space-y-3">
			<h2 className="border-line border-b pb-1 font-serif text-xl">{title}</h2>
			{children}
		</section>
	);
}

/** A row of a plain two column table, which is what most of this page is made of. */
function Line({
	name,
	amount,
	currency,
	tone = "neutral",
}: {
	name: string;
	amount: number;
	currency: string;
	tone?: "neutral" | "auto";
}) {
	return (
		<TableRow>
			<TableCell>{name}</TableCell>
			<TableCell numeric={true}>
				<Value amount={amount} currency={currency} tone={tone} />
			</TableCell>
		</TableRow>
	);
}

export function PaperReportPage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace } = useCofre();

	const spaceId = currentSpace?.id ?? "";
	const timezone = currentSpace?.timezone ?? "America/Sao_Paulo";
	const currency = currentSpace?.baseCurrency ?? "BRL";
	const mine = useWhatIMayDo(spaceId);

	const asked = new URLSearchParams(window.location.search).get("mes");
	const month = asked && /^\d{4}-\d{2}$/.test(asked) ? asked : monthOf(todayIn(timezone));
	const from = `${month}-01` as CalendarDate;
	const to = lastDayOf(month);

	/**
	 * The day this month is read on.
	 *
	 * A month already over is read as it stood on its last day, which is what makes the
	 * check up and the months ahead in this file about that month rather than about now.
	 * The month somebody is living in is read today, because its last day has not come.
	 */
	const today = todayIn(timezone);
	const asOf = to < today ? to : today;
	const past = to < today;

	const locale = i18n.resolvedLanguage === "en" ? "en" : "pt-BR";
	const monthName = new Intl.DateTimeFormat(locale, {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(`${month}-01T00:00:00Z`));

	/**
	 * A day and a month as somebody reads them, not as the database keeps them.
	 *
	 * This file is the one thing here that somebody hands to another person, and it printed
	 * "Gerado em 2026-09-29" and listed its rows as 2026-10, which is the shape of a column
	 * in a table and not of a date in a document.
	 */
	const dayName = (day: string) =>
		new Intl.DateTimeFormat(locale, {
			day: "2-digit",
			month: "long",
			year: "numeric",
			timeZone: "UTC",
		}).format(new Date(`${day}T00:00:00Z`));
	const shortMonth = (value: string) =>
		new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit", timeZone: "UTC" }).format(
			new Date(`${value}-01T00:00:00Z`),
		);

	// The browser suggests the document title as the file name, which is the only say this
	// page has over what the file ends up called.
	useEffect(() => {
		const before = document.title;
		document.title = `cofre_relatorio_${month}`;
		return () => {
			document.title = before;
		};
	}, [month]);

	const range = { spaceId, from, to };
	const on = Boolean(session && currentSpace);

	const totals = useQuery({
		queryKey: ["reports", spaceId, "totals", month],
		enabled: on,
		queryFn: () => session?.reports.totals(range) ?? null,
	});
	const byCategory = useQuery({
		queryKey: ["reports", spaceId, "byCategory", month],
		enabled: on,
		queryFn: () => session?.reports.byCategory(range) ?? [],
	});
	const byPriority = useQuery({
		queryKey: ["reports", spaceId, "byPriority", month],
		enabled: on,
		queryFn: () => session?.reports.byPriority(range) ?? [],
	});
	const byMonth = useQuery({
		queryKey: ["reports", spaceId, "byMonth", month],
		enabled: on,
		queryFn: () =>
			session?.reports.byMonth({
				spaceId,
				from: `${addMonthsToMonth(month, -11)}-01` as CalendarDate,
				to,
			}) ?? [],
	});

	const accounts = useQuery({
		queryKey: ["accounts", spaceId],
		enabled: on,
		queryFn: () => session?.accounts.list(spaceId) ?? [],
	});
	const balances = useQuery({
		queryKey: ["balances", spaceId, asOf],
		enabled: on,
		queryFn: () => session?.transactions.balances(spaceId, asOf) ?? [],
	});
	const holdings = useQuery({
		queryKey: ["investments", spaceId],
		enabled: on,
		queryFn: () => session?.investments.list(spaceId) ?? [],
	});
	const cards = useQuery({
		queryKey: ["invoices", "standing", spaceId, asOf],
		enabled: on,
		queryFn: () => session?.invoices.standing(spaceId, asOf) ?? [],
	});

	const budgets = useQuery({
		queryKey: ["budgets", spaceId, month],
		enabled: on,
		queryFn: () => session?.budgets.progress({ spaceId, month, today: asOf }) ?? [],
	});
	const savings = useQuery({
		queryKey: ["savings", spaceId, month],
		enabled: on,
		queryFn: () => session?.goals.savings({ spaceId, month }) ?? null,
	});
	const goals = useQuery({
		queryKey: ["goals", spaceId, asOf],
		enabled: on,
		queryFn: () => session?.goals.progress({ spaceId, today: asOf }) ?? [],
	});

	// The check up reads the money of the whole household, so it is not in the file of
	// somebody who only sees what they wrote, for the same reason its screen closes to
	// them: every threshold behind its verdict was written for a household.
	const reading = useQuery({
		queryKey: ["advice", "reading", spaceId, asOf],
		enabled: on && mine.ready && !mine.seesOwnRowsOnly,
		queryFn: () => session?.advice.reading({ spaceId, today: asOf }) ?? null,
	});
	const projection = useQuery({
		queryKey: ["projection", spaceId, month, asOf],
		enabled: on,
		queryFn: () =>
			session?.projections.monthsAhead({
				spaceId,
				from: addMonthsToMonth(month, 1),
				months: 6,
				// As the month ended, for a month that has gone. A report on August printed
				// in November is a report on August, so the months after it are the months
				// that were ahead then and not the ones ahead now.
				today: asOf,
			}) ?? null,
	});

	if (!currentSpace) return null;

	const money = (value: unknown) =>
		new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			style: "currency",
			currency,
		}).format(Number(value) / 100);

	const worth: Record<string, number> = {};
	for (const holding of holdings.data ?? []) {
		worth[holding.accountId] = (worth[holding.accountId] ?? 0) + holding.value;
	}
	const counted = { accounts: accounts.data ?? [], balances: balances.data ?? [], worth };

	const period = totals.data ?? { income: 0, expense: 0, benefits: 0, left: 0 };

	return (
		<div className="mx-auto max-w-3xl space-y-8">
			<div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
				<p className="text-quiet text-sm">{t("paper.chooseInReports")}</p>
				<Button onClick={() => window.print()}>{t("paper.save")}</Button>
			</div>

			<header className="space-y-1">
				<h1 className="font-serif text-2xl">
					{t("paper.title", { space: currentSpace.name, month: monthName })}
				</h1>
				<p className="text-quiet text-sm">
					{t("paper.madeOn", { day: dayName(today) })}
					{past ? ` ${t("paper.asItStood", { day: dayName(to) })}` : ""}
				</p>
				{mine.seesOwnRowsOnly ? <p className="text-quiet text-sm">{t("paper.yoursOnly")}</p> : null}
			</header>

			{totals.isPending ? <Skeleton lines={6} /> : null}

			<Part title={t("paper.summary")}>
				<Table caption={t("paper.summaryCaption", { month: monthName })}>
					<TableHead>
						<TableRow>
							<TableHeader>{t("paper.what")}</TableHeader>
							<TableHeader numeric={true}>{t("paper.howMuch")}</TableHeader>
						</TableRow>
					</TableHead>
					<TableBody>
						<Line name={t("reports.income")} amount={period.income} currency={currency} />
						{period.benefits > 0 ? (
							<Line name={t("paper.benefitsLine")} amount={period.benefits} currency={currency} />
						) : null}
						<Line
							name={t("reports.expense")}
							amount={-period.expense}
							currency={currency}
							tone="auto"
						/>
						<Line
							name={t("dashboard.leftOver")}
							amount={period.left}
							currency={currency}
							tone="auto"
						/>
						<Line
							name={t("paper.moneyAtTheEnd")}
							amount={moneyOnHand(counted)}
							currency={currency}
						/>
						<Line
							name={t("paper.spendableAtTheEnd")}
							amount={spendableNow(counted)}
							currency={currency}
						/>
					</TableBody>
				</Table>
			</Part>

			{(cards.data ?? []).length > 0 ? (
				<Part title={t("paper.cards")}>
					<Table caption={t("paper.cardsCaption")}>
						<TableHead>
							<TableRow>
								<TableHeader>{t("paper.card")}</TableHeader>
								<TableHeader>{t("paper.state")}</TableHeader>
								<TableHeader numeric={true}>{t("paper.charged")}</TableHeader>
								<TableHeader numeric={true}>{t("paper.stillToPay")}</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							{(cards.data ?? []).map((card) => (
								<TableRow key={card.account.id}>
									<TableCell>{card.account.name}</TableCell>
									<TableCell>{t(`invoice.standing.${card.open.standing}`)}</TableCell>
									<TableCell numeric={true}>
										<Value amount={card.open.charged} currency={card.account.currency} />
									</TableCell>
									<TableCell numeric={true}>
										<Value amount={card.open.left} currency={card.account.currency} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Part>
			) : null}

			{(byCategory.data ?? []).length > 0 ? (
				<Part title={t("paper.byCategory")}>
					<Table caption={t("reports.categoryCaption", { month: monthName })}>
						<TableHead>
							<TableRow>
								<TableHeader>{t("reports.category")}</TableHeader>
								<TableHeader numeric={true}>{t("reports.amount")}</TableHeader>
								<TableHeader numeric={true}>{t("paper.share")}</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							{(byCategory.data ?? []).map((one) => (
								<TableRow key={one.categoryId ?? "none"}>
									{/* Money nobody sorted is a line of its own and not a blank one.
									    The screen next door has said so all along, and this printed
									    an empty cell against two thirds of a month. */}
									<TableCell>{one.name ?? t("reports.noCategory")}</TableCell>
									<TableCell numeric={true}>
										<Value amount={one.total} currency={currency} />
									</TableCell>
									<TableCell numeric={true}>
										{Math.round((one.total / Math.max(1, period.expense)) * 100)}%
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Part>
			) : null}

			{(byPriority.data ?? []).length > 0 ? (
				<Part title={t("paper.byPriority")}>
					<Table caption={t("paper.priorityCaption")}>
						<TableHead>
							<TableRow>
								<TableHeader>{t("transactions.priority")}</TableHeader>
								<TableHeader numeric={true}>{t("reports.amount")}</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							{(byPriority.data ?? []).map((one) => (
								<Line
									key={one.priority ?? "none"}
									// A record with no priority on it has none, and asking for the
									// sentence of a priority called nothing printed the key itself:
									// a row headed "priority.null" in the file somebody hands over.
									name={one.priority ? t(`priority.${one.priority}`) : t("reports.noPriority")}
									amount={one.total}
									currency={currency}
								/>
							))}
						</TableBody>
					</Table>
				</Part>
			) : null}

			{(byMonth.data ?? []).length > 0 ? (
				<Part title={t("paper.twelveMonths")}>
					<Table caption={t("reports.monthsCaption")}>
						<TableHead>
							<TableRow>
								<TableHeader>{t("reports.month")}</TableHeader>
								<TableHeader numeric={true}>{t("reports.income")}</TableHeader>
								<TableHeader numeric={true}>{t("reports.expense")}</TableHeader>
								<TableHeader numeric={true}>{t("reports.left")}</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							{(byMonth.data ?? []).map((one) => (
								<TableRow key={one.month}>
									<TableCell>{shortMonth(one.month)}</TableCell>
									<TableCell numeric={true}>
										<Value amount={one.income} currency={currency} />
									</TableCell>
									<TableCell numeric={true}>
										<Value amount={one.expense} currency={currency} />
									</TableCell>
									<TableCell numeric={true}>
										<Value amount={one.income - one.expense} currency={currency} tone="auto" />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Part>
			) : null}

			{(budgets.data ?? []).length > 0 ? (
				<Part title={t("paper.budget")}>
					<Table caption={t("paper.budgetCaption", { month: monthName })}>
						<TableHead>
							<TableRow>
								{/* What the limit is on, which is everything, a priority or a
								    category, and never a limit. This column was headed with the
								    same word as the one two along, so the English table read
								    "Limit, Spent, The limit, State". */}
								<TableHeader>{t("paper.what")}</TableHeader>
								<TableHeader numeric={true}>{t("paper.spent")}</TableHeader>
								<TableHeader numeric={true}>{t("paper.limitAmount")}</TableHeader>
								<TableHeader>{t("paper.state")}</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							{(budgets.data ?? []).map((limit) => (
								<TableRow key={limit.id}>
									<TableCell>
										{limit.scope === "total"
											? t("budget.everything")
											: limit.scope === "priority"
												? t(`priority.${limit.priority ?? "important"}`)
												: ((byCategory.data ?? []).find(
														(one) => one.categoryId === limit.categoryId,
													)?.name ?? "")}
									</TableCell>
									<TableCell numeric={true}>
										<Value amount={limit.progress.spent} currency={currency} />
									</TableCell>
									<TableCell numeric={true}>
										<Value amount={limit.progress.limit} currency={currency} />
									</TableCell>
									<TableCell>{t(`budget.state.${limit.progress.state}`)}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Part>
			) : null}

			<Part title={t("paper.saving")}>
				<Table caption={t("paper.savingCaption")}>
					<TableHead>
						<TableRow>
							<TableHeader>{t("paper.what")}</TableHeader>
							<TableHeader numeric={true}>{t("paper.howMuch")}</TableHeader>
						</TableRow>
					</TableHead>
					<TableBody>
						<Line
							name={t("dashboard.ruleAsks")}
							amount={savings.data?.expected ?? 0}
							currency={currency}
						/>
						<Line
							name={t("dashboard.savedSoFar")}
							amount={savings.data?.put ?? 0}
							currency={currency}
						/>
						{(goals.data ?? []).map((goal) => (
							<TableRow key={goal.id}>
								<TableCell>{goal.name}</TableCell>
								<TableCell numeric={true}>
									<Value amount={goal.saved} currency={currency} /> {t("dashboard.ofTarget")}{" "}
									<Value amount={goal.targetAmount} currency={currency} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Part>

			{reading.data ? (
				<Part title={t("paper.checkUp")}>
					<p className="font-serif text-lg">{t(`advisor.verdict.${reading.data.verdict}`)}</p>
					<Table caption={t("paper.signsCaption")}>
						<TableHead>
							<TableRow>
								<TableHeader>{t("paper.sign")}</TableHeader>
								<TableHeader>{t("paper.state")}</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							{reading.data.signs.map((sign) => (
								<TableRow key={sign.code}>
									<TableCell>{t(`sign.${sign.code}`)}</TableCell>
									<TableCell>{t(`signState.${sign.state}`)}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
					{reading.data.plan.steps.length > 0 ? (
						<ol className="list-decimal space-y-1 pl-5 text-sm">
							{reading.data.plan.steps.map((step) => (
								<li key={step.code}>
									{t(`plan.${step.code}`, {
										amount: money(step.amount),
										months: step.months,
									})}
								</li>
							))}
						</ol>
					) : null}
				</Part>
			) : null}

			{projection.data ? (
				<Part title={t("paper.monthsAhead")}>
					<Table caption={t("paper.monthsAheadCaption")}>
						<TableHead>
							<TableRow>
								<TableHeader>{t("reports.month")}</TableHeader>
								<TableHeader numeric={true}>{t("reports.income")}</TableHeader>
								<TableHeader numeric={true}>{t("reports.expense")}</TableHeader>
								<TableHeader numeric={true}>{t("paper.balanceAtTheEnd")}</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							{projection.data.months.map((one) => (
								<TableRow key={one.month}>
									<TableCell>{shortMonth(one.month)}</TableCell>
									<TableCell numeric={true}>
										<Value amount={one.income} currency={currency} />
									</TableCell>
									<TableCell numeric={true}>
										<Value amount={one.expense} currency={currency} />
									</TableCell>
									<TableCell numeric={true}>
										<Value amount={one.balance} currency={currency} tone="auto" />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Part>
			) : null}

			{(holdings.data ?? []).length > 0 ? (
				<Part title={t("paper.investments")}>
					<Table caption={t("paper.investmentsCaption")}>
						<TableHead>
							<TableRow>
								<TableHeader>{t("investments.name")}</TableHeader>
								<TableHeader numeric={true}>{t("investments.value")}</TableHeader>
								<TableHeader numeric={true}>{t("investments.gain")}</TableHeader>
							</TableRow>
						</TableHead>
						<TableBody>
							{(holdings.data ?? []).map((one) => (
								<TableRow key={one.id}>
									<TableCell>{one.name}</TableCell>
									<TableCell numeric={true}>
										<Value amount={one.value} currency={one.currency} />
									</TableCell>
									<TableCell numeric={true}>
										<Value amount={one.gain} currency={one.currency} tone="auto" />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Part>
			) : null}

			<p className="text-quiet text-xs">{t("paper.madeHere")}</p>
		</div>
	);
}
