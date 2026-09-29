// What the person sees first, and the one screen the product brief makes a promise
// about: in seconds, how much there is, how much is left to spend this month, what falls
// due in the next days, and whether what was planned is being put aside.
//
// Four questions, so the screen opens with four figures on one line. That band is the
// one place this product comes near a panel of indicators, which registry 0023 spent a
// release removing, and registry 0044 says why it is allowed here: it is four labelled
// numbers separated by a rule, in the same faces as everything else, with no box, no bar
// and no second colour. What 0023 objected to was a surface with nowhere for the eye to
// land, and four landing places is the opposite of that.
//
// Every number on it comes from the model. This screen adds nothing up that another
// screen also adds up, because that is how the overview, the check up and the projection
// came to give three different answers to the same question.

import {
	addDays,
	type CalendarDate,
	canSpendThisMonth,
	dateInMonth,
	lastDayOfMonth,
	moneyOnHand,
	monthOf,
	noticesFor,
	parseCalendarMonth,
	spendableNow,
	todayIn,
} from "@cofre/core";
import { Button, Callout, EmptyState, InsightTitle, Panel, Segmented, Skeleton } from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Findings } from "../components/Findings.tsx";
import { Value } from "../components/Value.tsx";
import { sayWhy } from "../lib/sayWhy.ts";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";

/** Lines about the months behind, here. The rest of them have a screen of their own. */
const SHOWN = 4;

/** How far ahead "the next days" looks. */
const AHEAD = 15;

function lastDayOf(month: string): CalendarDate {
	const { year, month: index } = parseCalendarMonth(month);
	return dateInMonth(month, lastDayOfMonth(year, index));
}

function dayAndMonth(date: string): string {
	return `${date.slice(8)}/${date.slice(5, 7)}`;
}

/** A figure with the question it answers above it, which is what the band is made of. */
function Figure({
	label,
	amount,
	currency,
	detail,
	size = "small",
	tone = "neutral",
}: {
	label: string;
	amount: number;
	currency: string;
	detail?: string;
	size?: "big" | "small";
	tone?: "neutral" | "auto";
}) {
	return (
		<div className="min-w-0">
			<p className="text-quiet text-sm">{label}</p>
			<p className={size === "big" ? "mt-1 text-2xl sm:text-3xl" : "mt-1 text-xl"}>
				<Value amount={amount} currency={currency} tone={tone} face="serif" />
			</p>
			{detail ? <p className="mt-1 text-quiet text-sm">{detail}</p> : null}
		</div>
	);
}

export function DashboardPage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace, spaces } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");
	const month = monthOf(today);
	const endOfMonth = lastDayOf(month);
	const currency = currentSpace?.baseCurrency ?? "BRL";

	// One life, more than one space. The consolidated view adds them together, and it
	// only exists when there is more than one to add.
	const [across, setAcross] = useState<"space" | "everything">("space");
	const [problem, setProblem] = useState<string | null>(null);
	const consolidated = across === "everything" && spaces.length > 1;

	const mine = useWhatIMayDo(spaceId);
	const mayUpdate = mine.may("transaction.update");
	const mayMakeAnAccount = mine.may("account.create");
	const ready = mine.ready;

	const accounts = useQuery({
		queryKey: ["accounts", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.accounts.list(spaceId) ?? [],
	});

	const everywhere = useQuery({
		queryKey: ["accountsEverywhere"],
		enabled: Boolean(session) && consolidated,
		queryFn: () => session?.accounts.listEverywhere() ?? [],
	});

	const balancesEverywhere = useQuery({
		queryKey: ["balances", "everywhere", spaces.map((space) => space.id).join(","), today],
		enabled: Boolean(session) && consolidated,
		queryFn: async () => {
			if (!session) return [];
			// Each space is read on its own day. Two spaces can sit in two timezones, and
			// the one that is open is not the one that decides for the other.
			const lists = await Promise.all(
				spaces.map((space) => session.transactions.balances(space.id, todayIn(space.timezone))),
			);
			return lists.flat();
		},
	});

	const balances = useQuery({
		queryKey: ["balances", spaceId, today],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.transactions.balances(spaceId, today) ?? [],
	});

	// What the investment accounts are actually worth, which is the price somebody typed
	// and not the money that was moved into them.
	const holdings = useQuery({
		queryKey: ["investments", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.investments.list(spaceId) ?? [],
	});

	const cards = useQuery({
		queryKey: ["invoices", "standing", spaceId, today],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.invoices.standing(spaceId, today) ?? [],
	});

	/** What falls due in the next days, soonest first, cut at the near end and not the far one. */
	const upcoming = useQuery({
		queryKey: ["transactions", spaceId, "upcoming", today],
		enabled: Boolean(session && currentSpace),
		queryFn: () =>
			session?.transactions.list({
				spaceId,
				status: "planned",
				from: today,
				to: addDays(today, AHEAD),
				order: "oldestFirst",
				limit: 50,
			}) ?? [],
	});

	/**
	 * What was promised for a day that has already gone.
	 *
	 * These used to disappear: the list looked forward from today, so a bill nobody said
	 * had happened simply left the screen and went on being counted as money still to go.
	 */
	const late = useQuery({
		queryKey: ["transactions", spaceId, "late", today],
		enabled: Boolean(session && currentSpace),
		queryFn: () =>
			session?.transactions.list({
				spaceId,
				status: "planned",
				to: addDays(today, -1),
				order: "oldestFirst",
				limit: 50,
			}) ?? [],
	});

	/** Everything still to happen before the month ends, which is what is left to spend. */
	const restOfMonth = useQuery({
		queryKey: ["transactions", spaceId, "restOfMonth", today, endOfMonth],
		enabled: Boolean(session && currentSpace),
		queryFn: () =>
			session?.transactions.list({
				spaceId,
				status: "planned",
				from: today,
				to: endOfMonth,
				order: "oldestFirst",
				limit: 500,
			}) ?? [],
	});

	const budgets = useQuery({
		queryKey: ["budgets", spaceId, month],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.budgets.progress({ spaceId, month, today }) ?? [],
	});

	const savings = useQuery({
		queryKey: ["savings", spaceId, month],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.goals.savings({ spaceId, month }) ?? null,
	});

	const goals = useQuery({
		queryKey: ["goals", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.goals.progress({ spaceId, today }) ?? [],
	});

	const thisMonth = useQuery({
		queryKey: ["reports", spaceId, "totals", month],
		enabled: Boolean(session && currentSpace),
		queryFn: () =>
			session?.reports.totals({ spaceId, from: `${month}-01` as CalendarDate, to: endOfMonth }) ??
			null,
	});

	const categories = useQuery({
		queryKey: ["categories", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.categories.list(spaceId) ?? [],
	});

	const findings = useQuery({
		queryKey: ["advice", spaceId, today],
		enabled: Boolean(session && currentSpace) && balances.isSuccess,
		queryFn: () => session?.advice.findings({ spaceId, today }) ?? [],
	});

	const settle = useMutation({
		mutationFn: async (id: string) => session?.transactions.settle(id, today),
		onSuccess: () => {
			setProblem(null);
			for (const key of ["transactions", "balances", "advice", "budgets", "savings", "goals"]) {
				void queries.invalidateQueries({ queryKey: [key] });
			}
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	const drop = useMutation({
		mutationFn: async (id: string) => session?.transactions.remove(id),
		onSuccess: () => {
			setProblem(null);
			for (const key of ["transactions", "balances", "advice"]) {
				void queries.invalidateQueries({ queryKey: [key] });
			}
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	if (!currentSpace) return null;

	const shownAccounts = consolidated ? (everywhere.data ?? []) : (accounts.data ?? []);
	const shownBalances = consolidated ? (balancesEverywhere.data ?? []) : (balances.data ?? []);
	const open = new Set(shownAccounts.map((account) => account.id));
	const visible = shownBalances.filter((balance) => open.has(balance.accountId));

	/** What each investment account is worth, by the prices somebody typed. */
	const worth: Record<string, number> = {};
	for (const holding of holdings.data ?? []) {
		worth[holding.accountId] = (worth[holding.accountId] ?? 0) + holding.value;
	}

	const counted = { accounts: shownAccounts, balances: visible, worth };
	const have = moneyOnHand(counted);
	const spendable = spendableNow(counted);

	const vouchers = shownAccounts.filter((account) => account.kind === "voucher");

	/** Money still to arrive and still to leave before the month ends. */
	const rest = restOfMonth.data ?? [];
	const comingIn = rest
		.filter((row) => row.kind === "income")
		.reduce((total, row) => total + row.amount, 0);
	const goingOut = rest
		.filter((row) => row.kind === "expense")
		.reduce((total, row) => total + Math.abs(row.amount), 0);
	// An invoice falling due this month is one bill, wherever its purchases were made.
	const invoicesDue = (cards.data ?? [])
		.filter((card) => card.open.dueOn <= endOfMonth && card.open.left > 0)
		.reduce((total, card) => total + card.open.left, 0);
	const fallingDue = goingOut + invoicesDue;

	const stillToSave = Math.max(0, (savings.data?.expected ?? 0) - (savings.data?.put ?? 0));
	const left = canSpendThisMonth({ spendable, comingIn, fallingDue, stillToSave });

	/** What falls due next, with a card invoice as one bill on the day it falls due. */
	const dues = [
		...(upcoming.data ?? [])
			.filter((row) => !open.has(row.accountId) || accountKind(row.accountId) !== "credit")
			.map((row) => ({
				id: row.id,
				on: row.happenedOn,
				description: row.description,
				amount: row.amount,
				kind: row.kind,
				invoice: false,
			})),
		...(cards.data ?? [])
			.filter((card) => card.open.left > 0 && card.open.dueOn <= addDays(today, AHEAD))
			.map((card) => ({
				id: `invoice:${card.account.id}`,
				on: card.open.dueOn,
				description: t("dashboard.invoiceOf", { card: card.account.name }),
				amount: -card.open.left,
				kind: "expense" as const,
				invoice: true,
			})),
	].sort((one, other) => (one.on < other.on ? -1 : 1));

	function accountKind(id: string): string {
		return shownAccounts.find((account) => account.id === id)?.kind ?? "";
	}

	const nameOfLimit = (limit: {
		scope: string;
		priority?: string | null;
		categoryId?: string | null;
	}) => {
		if (limit.scope === "total") return t("budget.everything");
		if (limit.scope === "priority") return t(`priority.${limit.priority ?? "important"}`);
		return categories.data?.find((category) => category.id === limit.categoryId)?.name ?? "";
	};

	const notices = noticesFor({
		today,
		budgets: (budgets.data ?? []).map((limit) => ({
			name: nameOfLimit(limit),
			spent: limit.progress.spent,
			limit: limit.progress.limit,
			state: limit.progress.state,
		})),
		bills: (upcoming.data ?? []).map((row) => ({
			description: row.description,
			amount: Math.abs(row.amount),
			happenedOn: row.happenedOn,
		})),
		savings: savings.data ?? null,
		goals: (goals.data ?? []).map((goal) => ({
			name: goal.name,
			saved: goal.saved,
			target: goal.targetAmount,
			achievedAt: goal.achievedAt,
		})),
	});

	const found = findings.data ?? [];

	const money = (value: unknown) =>
		new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			style: "currency",
			currency,
		}).format(Number(value) / 100);
	const out = dues.filter((row) => row.kind !== "income");
	const income = dues.filter((row) => row.kind === "income");

	return (
		<div className="space-y-4">
			{problem ? (
				<Callout tone="problem" title={t("rules.somethingWentWrong")}>
					{problem}
				</Callout>
			) : null}

			<Panel className="border-accent/30 bg-gradient-to-b from-accentSoft/60 to-panel">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<InsightTitle
						level="h1"
						detail={
							mine.seesOwnRowsOnly
								? t("dashboard.yoursOnly")
								: t("dashboard.asOf", { day: dayAndMonth(today) })
						}
					>
						{consolidated
							? t("dashboard.headlineEverywhere")
							: t("dashboard.headline", { space: currentSpace.name })}
					</InsightTitle>

					{spaces.length > 1 ? (
						<Segmented
							label={t("dashboard.show")}
							value={across}
							onChange={(value) => setAcross(value as "space" | "everything")}
							options={[
								{ value: "space", label: t("reports.thisSpace") },
								{ value: "everything", label: t("reports.everySpace") },
							]}
						/>
					) : null}
				</div>

				{/* The four questions the product brief promises an answer to, on one line. */}
				{balances.isPending ? (
					<Skeleton lines={2} />
				) : (
					<div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
						<Figure
							label={t("dashboard.youHave")}
							amount={have}
							currency={currency}
							size="big"
							tone="auto"
						/>
						<div className="border-line lg:border-l lg:pl-6">
							<Figure
								label={t("dashboard.canSpend")}
								amount={left.amount}
								currency={currency}
								tone="auto"
							/>
						</div>
						<div className="border-line lg:border-l lg:pl-6">
							<Figure
								label={t("dashboard.dueThisMonth")}
								amount={-fallingDue}
								currency={currency}
								tone="auto"
							/>
						</div>
						{/* Nothing to put aside and no rule to put it aside by are different
						    answers, and a zero here reads as the first one. */}
						<div className="border-line lg:border-l lg:pl-6">
							{(savings.data?.expected ?? 0) > 0 ? (
								<Figure
									label={t("dashboard.stillToSave")}
									amount={stillToSave}
									currency={currency}
								/>
							) : (
								<div className="min-w-0">
									<p className="text-quiet text-sm">{t("dashboard.stillToSave")}</p>
									<p className="mt-1 text-quiet text-sm">{t("dashboard.noRuleShort")}</p>
								</div>
							)}
						</div>
					</div>
				)}

				{/* What is owed and what is allowed, each on a line of its own, because
				    neither of them is the money somebody has. */}
				{(cards.data ?? []).length > 0 || vouchers.length > 0 ? (
					<div className="mt-4 divide-y divide-line border-line border-t">
						{(cards.data ?? []).map((card) => (
							<div
								key={card.account.id}
								className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
							>
								<div className="min-w-0">
									<p className="truncate">{card.account.name}</p>
									<p className="text-quiet text-sm">
										<Value amount={card.open.charged} currency={card.account.currency} />{" "}
										{t("dashboard.onTheInvoiceDue", { day: dayAndMonth(card.open.dueOn) })}
										{card.later > 0 ? (
											<>
												{", "}
												<Value amount={card.later} currency={card.account.currency} />{" "}
												{t("dashboard.inPartsAfter")}
											</>
										) : null}
									</p>
								</div>
								<Link to={ROUTES.invoices}>
									<Button size="small" variant="secondary">
										{card.open.left > 0 ? t("invoice.pay") : t("invoice.see")}
									</Button>
								</Link>
							</div>
						))}
						{vouchers.map((voucher) => (
							<VoucherLine
								key={voucher.id}
								accountId={voucher.id}
								name={voucher.name}
								today={today}
							/>
						))}
					</div>
				) : null}
			</Panel>

			{/* Late first, because it is the only thing on this screen that is already wrong. */}
			{(late.data ?? []).length > 0 ? (
				<Callout tone="problem" title={t("dashboard.late")}>
					<ul className="mt-1 space-y-2">
						{(late.data ?? []).map((row) => (
							<li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2">
								<span className="min-w-0">
									<span className="font-mono text-quiet text-xs">
										{dayAndMonth(row.happenedOn)}
									</span>{" "}
									{row.description}
								</span>
								<span className="flex items-center gap-2">
									<Value amount={row.amount} currency={row.currency} tone="auto" />
									{mayUpdate ? (
										<>
											<Button
												size="small"
												variant="secondary"
												onClick={() => settle.mutate(row.id)}
											>
												{row.kind === "income" ? t("dashboard.received") : t("dashboard.happened")}
											</Button>
											<Button size="small" variant="quiet" onClick={() => drop.mutate(row.id)}>
												{t("dashboard.didNotHappen")}
											</Button>
										</>
									) : null}
								</span>
							</li>
						))}
					</ul>
				</Callout>
			) : null}

			{notices.length > 0 || found.length > 0 ? (
				<Panel
					title={t("dashboard.attention")}
					action={
						<Link to={ROUTES.advisor}>
							<Button size="small" variant="quiet">
								{t("dashboard.seeMore")}
							</Button>
						</Link>
					}
				>
					<ul className="space-y-2">
						{notices.slice(0, 5).map((notice) => (
							<li
								key={`${notice.kind}${JSON.stringify(notice.values)}`}
								className={`border-l-2 pl-3 text-sm ${
									notice.level === "urgent"
										? "border-seal text-ink"
										: notice.level === "attention"
											? "border-ochre text-ink"
											: "border-line text-quiet"
								}`}
							>
								{t(`notice.${notice.kind}`, {
									...notice.values,
									over: money(notice.values.over),
									left: money(notice.values.left),
									amount: money(notice.values.amount),
									missing: money(notice.values.missing),
									target: money(notice.values.target),
								})}
							</li>
						))}
					</ul>
					{found.length > 0 ? (
						<div className="mt-3">
							<Findings findings={found} money={money} limit={SHOWN} />
						</div>
					) : null}
				</Panel>
			) : null}

			<Panel
				title={t("dashboard.dueSoon")}
				action={
					<Link to={ROUTES.transactions}>
						<Button size="small" variant="quiet">
							{t("dashboard.seeTransactions")}
						</Button>
					</Link>
				}
			>
				{upcoming.isPending ? <Skeleton lines={3} /> : null}
				{!upcoming.isPending && dues.length === 0 ? (
					<p className="text-quiet text-sm">{t("dashboard.nothingDue")}</p>
				) : null}

				{out.length > 0 ? (
					<>
						<p className="text-quiet text-sm">{t("dashboard.goesOut")}</p>
						<ul className="mt-1 divide-y divide-line border-line border-t">
							{out.map((row) => (
								<DueRow
									key={row.id}
									row={row}
									currency={currency}
									mayUpdate={mayUpdate}
									onSettle={() => settle.mutate(row.id)}
									label={t("dashboard.happened")}
								/>
							))}
						</ul>
					</>
				) : null}

				{income.length > 0 ? (
					<>
						<p className="mt-4 text-quiet text-sm">{t("dashboard.comesIn")}</p>
						<ul className="mt-1 divide-y divide-line border-line border-t">
							{income.map((row) => (
								<DueRow
									key={row.id}
									row={row}
									currency={currency}
									mayUpdate={mayUpdate}
									onSettle={() => settle.mutate(row.id)}
									label={t("dashboard.received")}
								/>
							))}
						</ul>
					</>
				) : null}
			</Panel>

			<div className="grid gap-4 lg:grid-cols-2">
				<Panel title={t("dashboard.monthSoFar")}>
					{thisMonth.isPending ? (
						<Skeleton lines={2} />
					) : (
						<div className="grid grid-cols-3 gap-3">
							<Figure
								label={t("reports.income")}
								amount={thisMonth.data?.income ?? 0}
								currency={currency}
							/>
							<Figure
								label={t("reports.expense")}
								amount={-(thisMonth.data?.expense ?? 0)}
								currency={currency}
								tone="auto"
							/>
							<Figure
								label={t("dashboard.leftOver")}
								amount={(thisMonth.data?.income ?? 0) - (thisMonth.data?.expense ?? 0)}
								currency={currency}
								tone="auto"
							/>
						</div>
					)}
				</Panel>

				<Panel title={t("dashboard.savingAndGoals")}>
					{savings.data ? (
						<p>
							{t("dashboard.ruleAsks")} <Value amount={savings.data.expected} currency={currency} />
							. {t("dashboard.savedSoFar")} <Value amount={savings.data.put} currency={currency} />.
						</p>
					) : (
						<p className="text-quiet text-sm">{t("dashboard.noRule")}</p>
					)}
					{(goals.data ?? []).length > 0 ? (
						<ul className="mt-3 divide-y divide-line border-line border-t">
							{(goals.data ?? []).slice(0, 3).map((goal) => (
								<li key={goal.id} className="flex items-baseline justify-between gap-4 py-2">
									<span className="min-w-0 truncate">{goal.name}</span>
									<span className="text-quiet text-sm">
										<Value amount={goal.saved} currency={currency} /> {t("dashboard.ofTarget")}{" "}
										<Value amount={goal.targetAmount} currency={currency} />
									</span>
								</li>
							))}
						</ul>
					) : null}
				</Panel>
			</div>

			<Panel
				title={t("dashboard.whereItIs")}
				action={
					<Link to={ROUTES.accounts}>
						<Button size="small" variant="quiet">
							{t("dashboard.seeAccounts")}
						</Button>
					</Link>
				}
			>
				{accounts.isPending ? <Skeleton lines={4} /> : null}
				{!accounts.isPending && shownAccounts.length === 0 && ready ? (
					<EmptyState
						icon="wallet"
						title={t("accounts.emptyTitle")}
						description={mayMakeAnAccount ? t("accounts.emptyBody") : t("accounts.emptyForYou")}
						action={
							mayMakeAnAccount ? (
								<Link to={ROUTES.accounts}>
									<Button variant="primary">{t("accounts.create")}</Button>
								</Link>
							) : null
						}
					/>
				) : null}

				{GROUPS.map((group) => {
					const rows = shownAccounts.filter((account) => group.kinds.includes(account.kind));
					if (rows.length === 0) return null;
					return (
						<div key={group.key} className="mb-4 last:mb-0">
							<p className="text-quiet text-sm">{t(`dashboard.group.${group.key}`)}</p>
							<ul className="mt-1 divide-y divide-line border-line border-t">
								{rows.map((account) => {
									const balance = visible.find((one) => one.accountId === account.id);
									const amount =
										account.kind === "investment" && worth[account.id] !== undefined
											? (worth[account.id] ?? 0)
											: (balance?.settled ?? account.initialBalance);
									return (
										<li key={account.id}>
											{/* Every account opens the records charged to it, which is the
											    question somebody has when a number surprises them. */}
											<Link
												to={ROUTES.transactions}
												search={{ accountId: account.id }}
												className="flex items-baseline justify-between gap-4 py-2 hover:underline"
											>
												<span className="min-w-0 truncate">{account.name}</span>
												<Value amount={amount} currency={account.currency} tone="auto" />
											</Link>
										</li>
									);
								})}
							</ul>
						</div>
					);
				})}
			</Panel>
		</div>
	);
}

/** The groups of the last panel, in the order somebody thinks about them. */
const GROUPS = [
	{ key: "money", kinds: ["checking", "savings", "cash"] },
	{ key: "investments", kinds: ["investment"] },
	{ key: "cards", kinds: ["credit"] },
	{ key: "benefits", kinds: ["voucher"] },
];

type Due = {
	id: string;
	on: string;
	description: string;
	amount: number;
	kind: string;
	invoice: boolean;
};

function DueRow({
	row,
	currency,
	mayUpdate,
	onSettle,
	label,
}: {
	row: Due;
	currency: string;
	mayUpdate: boolean;
	onSettle: () => void;
	label: string;
}) {
	const { t } = useTranslation();
	return (
		<li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
			<span className="flex min-w-0 items-baseline gap-2">
				<span className="font-mono text-quiet text-xs">{dayAndMonth(row.on)}</span>
				<span className="truncate">{row.description}</span>
				{row.invoice ? <span className="text-quiet text-xs">{t("dashboard.oneBill")}</span> : null}
			</span>
			<span className="flex items-center gap-2">
				<Value amount={row.amount} currency={currency} tone="auto" />
				{/* An invoice is settled by paying it, on the screen that knows what it costs
				    and where the money comes from, so this one only points at it. */}
				{mayUpdate && !row.invoice ? (
					<Button size="small" variant="secondary" onClick={onSettle}>
						{label}
					</Button>
				) : null}
				{row.invoice ? (
					<Link to={ROUTES.invoices}>
						<Button size="small" variant="secondary">
							{t("invoice.pay")}
						</Button>
					</Link>
				) : null}
			</span>
		</li>
	);
}

/** What is left on one benefit card, which is worked out rather than stored. */
function VoucherLine({
	accountId,
	name,
	today,
}: {
	accountId: string;
	name: string;
	today: CalendarDate;
}) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const state = useQuery({
		queryKey: ["benefit", accountId, today],
		enabled: Boolean(session),
		queryFn: () => session?.accounts.benefitLeft(accountId, today) ?? null,
	});

	return (
		<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
			<div className="min-w-0">
				<p className="truncate">{name}</p>
				<p className="text-quiet text-sm">
					{state.data ? (
						<>
							<Value amount={state.data.left} /> {t("dashboard.ofQuota")}{" "}
							<Value amount={state.data.quota} /> {t("dashboard.thisPeriod")}
						</>
					) : (
						t("dashboard.noQuota")
					)}
				</p>
			</div>
		</div>
	);
}
