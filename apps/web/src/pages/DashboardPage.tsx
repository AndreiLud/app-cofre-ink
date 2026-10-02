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
	addUpInBase,
	type CalendarDate,
	canSpendThisMonth,
	dateInMonth,
	lastDayOfMonth,
	moneyOnHand,
	monthOf,
	noticesFor,
	parseCalendarMonth,
	spendableNow,
	splitInvoicesFallingDue,
	todayIn,
} from "@cofre/core";
import type { CardStanding } from "@cofre/storage";
import { roleSeesOwnRowsOnly } from "@cofre/storage";
import {
	Button,
	Callout,
	Dialog,
	EmptyState,
	InsightTitle,
	Panel,
	Segmented,
	Skeleton,
} from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Findings } from "../components/Findings.tsx";
import { Value } from "../components/Value.tsx";
import { EVERY_MONTH } from "../lib/recordFilters.ts";
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
			{/* One step smaller on the narrowest screen, because the band is two columns
			    there and an amount does not wrap: at 390 pixels a column is about a hundred
			    and sixty seven wide and "R$ 27.162,90" in tabular figures at the larger size
			    is more than that, so the answer ran into the figure beside it. */}
			<p className={size === "big" ? "mt-1 text-xl sm:text-3xl" : "mt-1 text-lg sm:text-xl"}>
				<Value amount={amount} currency={currency} tone={tone} face="serif" />
			</p>
			{detail ? <p className="mt-1 text-quiet text-sm">{detail}</p> : null}
		</div>
	);
}

export function DashboardPage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace, spaces, user } = useCofre();
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

	// Answering the whole overdue block at once. There is no undoing a confirmation, so the
	// dialog is not decoration: it is the only stop between the button and the writes.
	const [askingAll, setAskingAll] = useState(false);
	const [confirmedAll, setConfirmedAll] = useState(0);

	const mine = useWhatIMayDo(spaceId);
	const mayUpdate = mine.may("transaction.update");
	const mayMakeAnAccount = mine.may("account.create");
	// Paying an invoice writes a transfer, so it is the permission a record needs.
	const mayPay = mine.may("transaction.create");
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

	// Whether any of the spaces being added together shows this person only their own
	// records. The role is held per space and the space row does not carry it, so the
	// member lists are what answers, and only while the consolidated view is open.
	const narrowed = useQuery({
		queryKey: ["narrowedEverywhere", spaces.map((space) => space.id).join(","), user?.id],
		enabled: Boolean(session && user) && consolidated,
		queryFn: async () => {
			if (!session) return false;
			const lists = await Promise.all(spaces.map((space) => session.members.list(space.id)));
			return lists.some((list) =>
				roleSeesOwnRowsOnly(list.find((one) => one.userId === user?.id)?.role ?? null),
			);
		},
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

	/**
	 * The same, and the cards, across every space, for the consolidated view.
	 *
	 * The band used to take the money from every space and the bills from whichever space
	 * happened to be open, under a heading that says it is about all of them. A household
	 * with two thousand and fifteen hundred of bills in the personal space and three
	 * thousand and four thousand of bills in the shared one read as a thousand to spare
	 * when the honest answer was five hundred short.
	 */
	const restEverywhere = useQuery({
		queryKey: [
			"transactions",
			"everywhere",
			"restOfMonth",
			spaces.map((space) => space.id).join(","),
			endOfMonth,
		],
		enabled: Boolean(session) && consolidated,
		queryFn: async () => {
			if (!session) return [];
			// Each space on its own day, because two spaces can sit in two timezones.
			const lists = await Promise.all(
				spaces.map((space) =>
					session.transactions.list({
						spaceId: space.id,
						status: "planned",
						from: todayIn(space.timezone),
						to: lastDayOf(monthOf(todayIn(space.timezone))),
						order: "oldestFirst",
						limit: 500,
					}),
				),
			);
			return lists.flat();
		},
	});

	const cardsEverywhere = useQuery({
		queryKey: ["invoices", "standing", "everywhere", spaces.map((space) => space.id).join(",")],
		enabled: Boolean(session) && consolidated,
		queryFn: async () => {
			if (!session) return [];
			const lists = await Promise.all(
				spaces.map((space) => session.invoices.standing(space.id, todayIn(space.timezone))),
			);
			return lists.flat();
		},
	});

	const savingsEverywhere = useQuery({
		queryKey: ["savings", "everywhere", spaces.map((space) => space.id).join(",")],
		enabled: Boolean(session) && consolidated,
		queryFn: async () => {
			if (!session) return { expected: 0, put: 0 };
			const each = await Promise.all(
				spaces.map((space) =>
					session.goals.savings({ spaceId: space.id, month: monthOf(todayIn(space.timezone)) }),
				),
			);
			return {
				expected: each.reduce((total, one) => total + (one?.expected ?? 0), 0),
				put: each.reduce((total, one) => total + (one?.put ?? 0), 0),
			};
		},
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
			setConfirmedAll(0);
			for (const key of ["transactions", "balances", "advice", "budgets", "savings", "goals"]) {
				void queries.invalidateQueries({ queryKey: [key] });
			}
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	/**
	 * The whole block at once, for a household coming back from a week away.
	 *
	 * One request, one database transaction, all of them or none of them. Each record stays on
	 * the day it was promised for, which is what the single button does and what keeps a bill
	 * inside the month and the limit it belongs to.
	 */
	const settleAllLate = useMutation({
		mutationFn: async (ids: string[]) => session?.transactions.settleMany(ids, today),
		onSuccess: (count) => {
			setProblem(null);
			setConfirmedAll(count ?? 0);
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
			setConfirmedAll(0);
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

	// A benefit card's leftover is the whole card, made of every lunch on it whoever ate it,
	// so there is no line to draw for somebody who can see none of them. The model answers
	// nothing for them, and drawing the line anyway would say the allowance is not written
	// down when it is.
	const vouchers = mine.seesOwnRowsOnly
		? []
		: shownAccounts.filter((account) => account.kind === "voucher");

	/** Whether any of the spaces being added together is narrowed to this person's rows. */
	const narrowedSomewhere = narrowed.data ?? false;

	/** Money still to arrive and still to leave before the month ends. */
	const rest = consolidated ? (restEverywhere.data ?? []) : (restOfMonth.data ?? []);
	const shownCards = consolidated ? (cardsEverywhere.data ?? []) : (cards.data ?? []);

	// In the currency of the space, from the figure worked out at the rate of the day, and
	// not from the amount as it was typed. These two sums were written with the amount while
	// the release was taking it out of every other total on every other screen.
	const comingIn = addUpInBase(rest.filter((row) => row.kind === "income"));

	/**
	 * What is still to leave, with the cards counted once.
	 *
	 * A purchase on a card is not money leaving the bank: the invoice is. So a planned
	 * record charged to a card is left out here and the invoice below stands for it,
	 * exactly as the list of what falls due next already did. Counting both added the
	 * subscription of the tenth twice, once as itself and once inside its invoice.
	 */
	const goingOut = Math.abs(
		addUpInBase(
			rest.filter((row) => row.kind === "expense" && accountKind(row.accountId) !== "credit"),
		),
	);

	/**
	 * Every invoice falling due before the month ends, which is one bill each wherever its
	 * purchases were made.
	 *
	 * Both of them: the one still taking purchases, and the one that has closed and is not
	 * paid. Only the first was counted, so for every day between the closing day and the end
	 * of the month the bill the household actually owes was in no figure on this screen, and
	 * what was left to spend read high by the whole of it.
	 *
	 * There is deliberately no bound at the near end. An invoice whose due day has gone is
	 * still money that has not left the account, and this figure is what canSpendThisMonth
	 * subtracts, so dropping a late bill here would quietly hand it back as money to spend.
	 * The list below is bounded at the near end, which looks like an inconsistency and is
	 * not: a list answers where a bill belongs, a total answers what is owed.
	 */
	const invoicesDue = shownCards
		.flatMap((card) => [card.open, card.unpaid])
		.filter((state) => state !== null && state.left > 0 && state.dueOn <= endOfMonth)
		.reduce((total, state) => total + (state?.left ?? 0), 0);
	const fallingDue = goingOut + invoicesDue;

	const putAside = consolidated ? savingsEverywhere.data : savings.data;
	const stillToSave = Math.max(0, (putAside?.expected ?? 0) - (putAside?.put ?? 0));
	const left = canSpendThisMonth({ spendable, comingIn, fallingDue, stillToSave });

	/**
	 * Every invoice a card is still owing, as one bill each, with the card it belongs to.
	 *
	 * Both of them: the one still taking purchases, and the one that closed and has not been
	 * paid. The second is the one somebody has to act on, and it was on no list here at all.
	 */
	const invoiceBills = shownCards.flatMap((card) =>
		[card.open, card.unpaid]
			.filter((state): state is NonNullable<typeof state> => state !== null)
			.map((state) => ({
				id: `invoice:${card.account.id}:${state.month}`,
				accountId: card.account.id,
				month: state.month,
				dueOn: state.dueOn,
				left: state.left,
				on: state.dueOn,
				description: t("dashboard.invoiceOf", { card: card.account.name }),
				amount: -state.left,
				// An invoice is charged in the currency of its card, which is not always the
				// currency the space counts in.
				currency: card.account.currency,
				kind: "expense" as const,
				invoice: true,
			})),
	);

	// Coming, or already somebody's problem. A bill past its due day used to pass the only
	// test there was, which asked whether it was inside the horizon, and was drawn under a
	// heading saying it was still to come.
	const bills = splitInvoicesFallingDue({
		invoices: invoiceBills,
		today,
		until: addDays(today, AHEAD),
	});

	/** What falls due next, with a card invoice as one bill on the day it falls due. */
	const dues = [
		...(upcoming.data ?? [])
			.filter((row) => !open.has(row.accountId) || accountKind(row.accountId) !== "credit")
			.map((row) => ({
				id: row.id,
				on: row.happenedOn,
				description: row.description,
				amount: row.amount,
				currency: row.currency,
				kind: row.kind,
				invoice: false,
			})),
		...bills.coming,
	].sort((one, other) => (one.on < other.on ? -1 : 1));

	/**
	 * What was promised for a day already gone, with the card purchases left out.
	 *
	 * A planned purchase charged to a card is already inside the invoice that is in the same
	 * block, so listing both shows the same money twice. A purchase is confirmed on the
	 * records screen, which is where somebody goes to argue with one.
	 */
	const lateRecords = (late.data ?? []).filter(
		(row) => !open.has(row.accountId) || accountKind(row.accountId) !== "credit",
	);

	// What answering the whole block would move, so the dialog says it rather than asking
	// somebody to trust a count. Both in the currency of the space, at the rate stored on each
	// record, which is what every other total on this screen does. A transfer is in neither.
	const lateGoing = Math.abs(addUpInBase(lateRecords.filter((row) => row.kind === "expense")));
	const lateArriving = addUpInBase(lateRecords.filter((row) => row.kind === "income"));

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
							// Consolidated, the sentence is about the spaces being added rather
							// than about the one that happens to be open: it said "you are a
							// Logger in this space" over a total that was several spaces, and
							// said nothing at all when the open one was the person's own.
							consolidated
								? narrowedSomewhere
									? t("dashboard.yoursOnlySomewhere", { day: dayAndMonth(today) })
									: t("dashboard.asOf", { day: dayAndMonth(today) })
								: mine.seesOwnRowsOnly
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
						    answers, and a zero here reads as the first one. The question is asked
						    of the same spaces the figure is made of: reading the open space here
						    and every space beside it would say "no saving rule" over a figure
						    made of four of them. */}
						<div className="border-line lg:border-l lg:pl-6">
							{(putAside?.expected ?? 0) > 0 ? (
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
				{shownCards.length > 0 || vouchers.length > 0 ? (
					<div className="mt-4 divide-y divide-line border-line border-t">
						{shownCards.map((card) => (
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
									{/* The invoice that closed and is still owed, said on the card's own
									    line, because it is the one thing about a card somebody has to
									    act on and the line above it is about the one still open. */}
									{card.unpaid && card.unpaid.left > 0 ? (
										<p className="text-sm text-seal">
											<Value amount={card.unpaid.left} currency={card.account.currency} />{" "}
											{t("dashboard.invoiceStillOwed", {
												day: dayAndMonth(card.unpaid.dueOn),
											})}
										</p>
									) : null}
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
								currency={voucher.currency}
								today={today}
							/>
						))}
					</div>
				) : null}
			</Panel>

			{confirmedAll > 0 ? (
				<Callout tone="neutral">{t("dashboard.confirmedLate", { count: confirmedAll })}</Callout>
			) : null}

			{/* Late first, because it is the only thing on this screen that is already wrong. */}
			{lateRecords.length > 0 || bills.toAnswer.length > 0 ? (
				<Callout
					tone="problem"
					title={t("dashboard.late")}
					action={
						// From two upwards. With one record its own button is already the shortest path.
						mayUpdate && lateRecords.length > 1 ? (
							<Button size="small" variant="secondary" onClick={() => setAskingAll(true)}>
								{t("dashboard.confirmAllLate", { count: lateRecords.length })}
							</Button>
						) : null
					}
				>
					{/* The bills above the promises, because an invoice past its due day is costing
					    money every day it waits while a record is only waiting for a yes. */}
					{bills.toAnswer.length > 0 ? (
						<ul className="mt-1 space-y-2">
							{bills.toAnswer.map((row) => (
								<li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2">
									<span className="min-w-0">
										<span className="font-mono text-quiet text-xs">{dayAndMonth(row.dueOn)}</span>{" "}
										{row.description}{" "}
										<span className="text-quiet text-xs">{t("dashboard.lateInvoice")}</span>
									</span>
									<span className="flex items-center gap-2">
										<Value amount={row.amount} currency={row.currency} tone="auto" />
										{mayPay ? (
											<Link to={ROUTES.invoices} search={{ cartao: row.accountId }}>
												<Button size="small" variant="secondary">
													{t("invoice.pay")}
												</Button>
											</Link>
										) : null}
									</span>
								</li>
							))}
						</ul>
					) : null}
					<ul className="mt-1 space-y-2">
						{lateRecords.map((row) => (
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
									mayUpdate={mayUpdate}
									onSettle={() => settle.mutate(row.id)}
									label={t("dashboard.received")}
								/>
							))}
						</ul>
					</>
				) : null}
			</Panel>

			{/* Where every card stands, one panel each.
			    The line under the big number says what a card will charge and offers to pay
			    it, which is the answer somebody wants in one second. This is the rest of the
			    same question, which they want the moment the answer is not comfortable: when
			    the invoice closes, how many days that is, whether the one before it is still
			    owed, and how much of the limit is left. Every one of these figures was
			    already worked out by the model and reached no screen. */}
			{shownCards.length > 0 ? (
				<Panel title={t("dashboard.cardsTitle")}>
					<div className="grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
						{shownCards.map((card) => (
							<CardStandingBlock key={card.account.id} card={card} mayPay={mayPay} today={today} />
						))}
					</div>
				</Panel>
			) : null}

			<div className="grid gap-4 lg:grid-cols-2">
				<Panel title={t("dashboard.monthSoFar")}>
					{thisMonth.isPending ? (
						<Skeleton lines={2} />
					) : (
						// One column on a telephone. Three figures across a narrow screen leaves
						// about ninety pixels each, and an amount does not wrap, so they ran into
						// one another.
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
							<Figure
								label={t("reports.income")}
								amount={(thisMonth.data?.income ?? 0) + (thisMonth.data?.benefits ?? 0)}
								currency={currency}
								detail={
									(thisMonth.data?.benefits ?? 0) > 0
										? t("reports.ofWhichBenefits", {
												amount: money(thisMonth.data?.benefits ?? 0),
											})
										: undefined
								}
							/>
							<Figure
								label={t("reports.expense")}
								amount={-(thisMonth.data?.expense ?? 0)}
								currency={currency}
								tone="auto"
							/>
							<Figure
								label={t("dashboard.leftOver")}
								amount={thisMonth.data?.left ?? 0}
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
											    question somebody has when a number surprises them. The name
											    is the one the address uses, which it did not until now: this
											    link carried accountId and the screen read nothing at all. */}
											<Link
												to={ROUTES.transactions}
												search={{ conta: account.id, mes: EVERY_MONTH }}
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

			{/* The one stop between the button and the writes, because nothing in the interface
			    undoes a confirmation. It says what moves, and on which days, before it moves. */}
			<Dialog
				open={askingAll}
				onOpenChange={(next) => !next && setAskingAll(false)}
				title={t("dashboard.confirmAllTitle", { count: lateRecords.length })}
				description={t("dashboard.confirmAllDescription")}
				closeLabel={t("actions.close")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setAskingAll(false)}>
							{t("actions.cancel")}
						</Button>
						<Button
							variant="primary"
							onClick={() => {
								settleAllLate.mutate(lateRecords.map((row) => row.id));
								setAskingAll(false);
							}}
						>
							{t("dashboard.confirmAllAction")}
						</Button>
					</>
				}
			>
				<p className="text-sm">
					{t("dashboard.confirmAllTotals", {
						going: money(lateGoing),
						arriving: money(lateArriving),
					})}
				</p>
				<p className="mt-2 text-quiet text-sm">{t("dashboard.confirmAllKeepsTheDay")}</p>
				<p className="mt-2 text-quiet text-sm">{t("dashboard.confirmAllIsFinal")}</p>
			</Dialog>
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
	/**
	 * The currency the amount is in, which is the record's own or the card's.
	 *
	 * Every row here used to be labelled with the currency of the space, the way the totals
	 * above them were until this release, so a hotel booked in dollars read as reais. The
	 * block of what is late, a few lines up, has read each record's own all along.
	 */
	currency: string;
	kind: string;
	invoice: boolean;
};

/**
 * Where one card stands, in the four sentences somebody asks for in that order.
 *
 * What it will charge, when it closes and when that is, whether the one before it is still
 * owed, and how much of the limit is left. Every figure comes from the model: `closesOn`,
 * `daysToClose` and `dueOn` from `invoiceStateOf`, and `available` from the invoices
 * repository, which is the limit less what is owed and less what the instalments will
 * charge later. None of them reached a screen before this.
 */
function CardStandingBlock({
	card,
	mayPay,
	today,
}: {
	card: CardStanding;
	mayPay: boolean;
	today: CalendarDate;
}) {
	const { t } = useTranslation();
	const currency = card.account.currency;

	/** When the open invoice closes, said as a day and as a count of days. */
	const closing =
		card.open.daysToClose <= 0
			? t("dashboard.closesToday")
			: t("dashboard.closesIn", {
					day: dayAndMonth(card.open.closesOn),
					count: card.open.daysToClose,
				});

	return (
		<div className="min-w-0 border-line border-t pt-3">
			<p className="truncate font-medium text-ink">{card.account.name}</p>

			<p className="mt-1 text-xl">
				<Value amount={-card.open.charged} currency={currency} face="serif" tone="auto" />
			</p>
			<p className="text-quiet text-sm">{closing}</p>
			<p className="text-quiet text-sm">
				{t("dashboard.dueOnDay", { day: dayAndMonth(card.open.dueOn) })}
			</p>

			{/* The one before it, when it closed and was not paid. It is the only thing about
			    a card that is already wrong rather than merely coming, so it is the one line
			    here drawn in the colour of a problem. */}
			{card.unpaid && card.unpaid.left > 0 ? (
				<p className="mt-1 text-seal text-sm">
					{t("dashboard.oneBefore", {
						state: t(`invoice.standing.${card.unpaid.standing}`),
						day: dayAndMonth(card.unpaid.dueOn),
					})}{" "}
					<Value amount={card.unpaid.left} currency={currency} />
				</p>
			) : null}

			{card.later > 0 ? (
				<p className="text-quiet text-sm">
					<Value amount={card.later} currency={currency} /> {t("dashboard.inPartsAfter")}
				</p>
			) : null}

			{/* The headroom, and only where the bank's limit was written down. Guessing at one
			    would be inventing the one figure somebody checks before paying at a till. */}
			<p className="mt-1 text-quiet text-sm">
				{card.available === null ? (
					t("dashboard.noLimitYet")
				) : (
					<>
						{t("dashboard.limitLeft")} <Value amount={card.available} currency={currency} />
					</>
				)}
			</p>

			<div className="mt-2 flex flex-wrap gap-2">
				{mayPay && (card.open.left > 0 || (card.unpaid?.left ?? 0) > 0) ? (
					<Link to={ROUTES.invoices} search={{ cartao: card.account.id }}>
						<Button size="small" variant="secondary">
							{t("invoice.pay")}
						</Button>
					</Link>
				) : null}
				<Link to={ROUTES.invoices} search={{ cartao: card.account.id }}>
					<Button size="small" variant="quiet">
						{t("invoice.see")}
					</Button>
				</Link>
			</div>

			{/* Said out loud once per card, because a day that has gone is the thing somebody
			    scanning this block would otherwise have to work out from a date. */}
			{card.open.late ? (
				<p className="sr-only">{t("dashboard.invoiceLate", { day: dayAndMonth(today) })}</p>
			) : null}
		</div>
	);
}

function DueRow({
	row,
	mayUpdate,
	onSettle,
	label,
}: {
	row: Due;
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
				<Value amount={row.amount} currency={row.currency} tone="auto" />
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
	currency,
	today,
}: {
	accountId: string;
	name: string;
	/** The currency of the card, which is the one every other line in this panel uses. */
	currency: string;
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
							<Value amount={state.data.left} currency={currency} /> {t("dashboard.ofQuota")}{" "}
							<Value amount={state.data.quota} currency={currency} /> {t("dashboard.thisPeriod")}
						</>
					) : (
						t("dashboard.noQuota")
					)}
				</p>
				{/* When the next allowance lands, because the figure above has to last until that
				    day and said nothing about how far off it is. A card that does not carry loses
				    what is left on that day, which is the opposite of reassuring, so it gets a
				    sentence of its own rather than the neutral one. */}
				{state.data ? (
					<p className="text-quiet text-sm">
						{t(state.data.carries ? "dashboard.landsIn" : "dashboard.landsInAndGoes", {
							day: dayAndMonth(state.data.landsOn),
							count: state.data.daysToLanding,
						})}
					</p>
				) : null}
			</div>
		</div>
	);
}
