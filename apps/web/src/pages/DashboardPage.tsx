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
	addMonthsToMonth,
	addUpInBase,
	againstAUsualMonth,
	amountToPay,
	billsFallingDue,
	type CalendarDate,
	type CardsTogether,
	canSpendThisMonth,
	cardsByUrgency,
	cardsTogether,
	currenciesOf,
	dateInMonth,
	type InvoiceState,
	isBenefit,
	lastDayOfMonth,
	leftAgainstUsual,
	limitsNearBreaking,
	moneyOnHand,
	monthOf,
	noticesFor,
	parseCalendarMonth,
	SOON_DAYS,
	spendableNow,
	spendableThisMonth,
	todayIn,
	USUAL_WINDOW,
	worthByAccount,
} from "@cofre/core";
import type { CardStanding, GoalProgress, Transaction } from "@cofre/storage";
import { roleSeesOwnRowsOnly } from "@cofre/storage";
import {
	Button,
	buttonClasses,
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
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Findings } from "../components/Findings.tsx";
import { HoldingMoveDialog } from "../components/HoldingMoveDialog.tsx";
import { MoveDialog, type MoveStart, movesOutOf } from "../components/MoveDialog.tsx";
import { Value } from "../components/Value.tsx";
import { VoucherAmount } from "../components/VoucherAmount.tsx";
import { estimateBehind, HOLDINGS, shortDay } from "../lib/holdings.ts";
import {
	type HoldingStart,
	intoGoalHolding,
	intoGoalStart,
	saveNowHolding,
	saveNowStart,
} from "../lib/putAside.ts";
import { EVERY_MONTH } from "../lib/recordFilters.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";

/** Lines about the months behind, here. The rest of them have a screen of their own. */
const SHOWN = 4;

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
	/** The currencies the spaces count in, which "Todos" adds together. */
	const currencies = currenciesOf(spaces.map((space) => ({ currency: space.baseCurrency })));

	// Answering the whole overdue block at once. There is no undoing a confirmation, so the
	// dialog is not decoration: it is the only stop between the button and the writes.
	const [askingAll, setAskingAll] = useState(false);
	const [confirmedAll, setConfirmedAll] = useState(0);
	const confirmedMessage = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (confirmedAll > 0) confirmedMessage.current?.focus();
	}, [confirmedAll]);
	/** The record somebody said did not happen, waiting for the question before it goes. */
	const [dropping, setDropping] = useState<Transaction | null>(null);
	/**
	 * Money being moved from here: onto a benefit card, into the account of the savings rule,
	 * or into the account of a goal. In the space it belongs to, which in "Todos" is the space
	 * of the card and not the one that happens to be open.
	 */
	/** Whether the cards folded into one line in "Onde o dinheiro está" are opened. */
	const [cardsOpen, setCardsOpen] = useState(false);
	const [moving, setMoving] = useState<{ spaceId: string; start: MoveStart } | null>(null);
	/** Guardar on a holding, when the rule or a goal is kept in one. */
	const [puttingIn, setPuttingIn] = useState<HoldingStart | null>(null);

	const mine = useWhatIMayDo(spaceId);
	const mayUpdate = mine.mayCall("transactions.settle");
	const maySettleAll = mine.mayCall("transactions.settleMany");
	const mayDrop = mine.mayCall("transactions.remove");
	const mayMakeAnAccount = mine.mayCall("accounts.create");
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

	// Which spaces show this person only their own records. The role is held per space and
	// the space row does not carry it, so the member lists are what answers. Read for every
	// space, because a benefit card is decided by the role in its own space: in "Todos", a
	// card from a space where this person is a logger said its allowance was missing,
	// because the role read was the one of the space that happened to be open.
	const narrowed = useQuery({
		queryKey: ["narrowedEverywhere", spaces.map((space) => space.id).join(","), user?.id],
		enabled: Boolean(session && user),
		queryFn: async (): Promise<Record<string, boolean>> => {
			if (!session) return {};
			const lists = await Promise.all(spaces.map((space) => session.members.list(space.id)));
			return Object.fromEntries(
				spaces.map((space, index) => [
					space.id,
					roleSeesOwnRowsOnly(lists[index]?.find((one) => one.userId === user?.id)?.role ?? null),
				]),
			);
		},
	});
	/** Whether a space shows this person only their own rows, or nothing while it is not known. */
	const narrowedIn = (id: string): boolean | undefined => narrowed.data?.[id];

	// What the investment accounts are actually worth, which is the price somebody typed
	// and not the money that was moved into them.
	// In "Todos", the holdings of every space: read from the open one only, what everything
	// added up to depended on which space happened to be open.
	const holdings = useQuery({
		queryKey: consolidated
			? [HOLDINGS, "everywhere", spaces.map((space) => space.id).join(",")]
			: [HOLDINGS, spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: async () => {
			if (!session) return [];
			if (!consolidated) return session.investments.list(spaceId);
			const lists = await Promise.all(spaces.map((space) => session.investments.list(space.id)));
			return lists.flat();
		},
	});

	const cards = useQuery({
		queryKey: ["invoices", "standing", spaceId, today],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.invoices.standing(spaceId, today) ?? [],
	});

	/** What falls due in the next days, soonest first, cut at the near end and not the far one. */
	const upcoming = useQuery({
		queryKey: ["transactions", spaceId, "upcoming", today, consolidated],
		enabled: Boolean(session && currentSpace),
		queryFn: async () => {
			if (!session) return [];
			const of = (id: string) =>
				session.transactions.list({
					spaceId: id,
					// Still to come, and not the status alone: a record dated ahead is written as a
					// fact now and its day holds it back.
					stillToComeOn: today,
					from: today,
					to: addDays(today, SOON_DAYS),
					order: "oldestFirst",
					limit: 50,
				});
			// "Todos" reads every space, as its figures do: the rent of a space nobody opened
			// today falls due all the same (part 2, J.8.3 of 2.0.0).
			if (!consolidated) return of(spaceId);
			const lists = await Promise.all(spaces.map((space) => of(space.id)));
			return lists.flat().sort((one, other) => (one.happenedOn < other.happenedOn ? -1 : 1));
		},
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
				stillToComeOn: today,
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
						stillToComeOn: todayIn(space.timezone),
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
			if (!session) return { expected: 0, put: 0, rules: 0, accountIds: [] as string[] };
			const each = await Promise.all(
				spaces.map((space) =>
					session.goals.savings({ spaceId: space.id, month: monthOf(todayIn(space.timezone)) }),
				),
			);
			const goalsOfEach = await Promise.all(spaces.map((space) => session.goals.list(space.id)));
			return {
				expected: each.reduce((total, one) => total + (one?.expected ?? 0), 0),
				put: each.reduce((total, one) => total + (one?.put ?? 0), 0),
				rules: each.filter((one) => one?.rule).length,
				// Where every space puts money aside, which this figure leaves out.
				accountIds: [
					...each.map((one) => one?.rule?.accountId ?? null),
					...goalsOfEach.flat().map((goal) => goal.accountId),
				].filter((id): id is string => id !== null),
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

	/**
	 * The month so far, which is up to today and not up to the last day of the month.
	 *
	 * A record dated ahead is a fact held back by its day, so a total to the end of the month
	 * counted the rent of the twenty fifth on the second.
	 */
	// Under "Todos", every space this person can read, which is what a report with no space is,
	// as Relatórios reads it: the month so far, what weighed most and the usual month were read
	// from the open space alone under a heading about all of them.
	const reportsOf = consolidated ? undefined : spaceId;
	const thisMonth = useQuery({
		queryKey: ["reports", reportsOf ?? "everywhere", "totals", month, today],
		enabled: Boolean(session && currentSpace),
		queryFn: () =>
			session?.reports.totals({
				spaceId: reportsOf,
				from: `${month}-01` as CalendarDate,
				to: today,
			}) ?? null,
	});

	const categories = useQuery({
		queryKey: ["categories", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.categories.list(spaceId) ?? [],
	});

	// The rest of "O mês até agora" as proposal 3 drew it: the months a usual one is made
	// of, read the way the month screen reads them, and what weighed most so far.
	const monthsBefore = useQuery({
		queryKey: ["reports", "byMonth", reportsOf ?? "everywhere", month, today],
		enabled: Boolean(session && currentSpace),
		queryFn: () =>
			session?.reports.byMonth({
				spaceId: reportsOf,
				from: dateInMonth(addMonthsToMonth(month, -USUAL_WINDOW), 1),
				to: today,
			}) ?? [],
	});
	const heaviest = useQuery({
		queryKey: ["reports", reportsOf ?? "everywhere", "byCategory", month, today],
		enabled: Boolean(session && currentSpace),
		queryFn: () =>
			session?.reports.byCategory({
				spaceId: reportsOf,
				from: `${month}-01` as CalendarDate,
				to: today,
			}) ?? [],
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

	/**
	 * What each investment account is worth, by the prices somebody typed.
	 *
	 * Not in a space where this person sees only their own records: their balance there is
	 * made of their own rows and the holdings are the household's, so the two together were
	 * neither their number nor the household's. Their investment account counts what they
	 * themselves moved into it.
	 */
	const spaceOfAccount = new Map(shownAccounts.map((account) => [account.id, account.spaceId]));
	const counting = (holdings.data ?? []).filter(
		(holding) => !narrowedIn(spaceOfAccount.get(holding.accountId) ?? spaceId),
	);
	const worth = worthByAccount(counting);
	/** The oldest day an estimate inside an investment account stops at, when it is behind. */
	const behindIn = (accountId: string) =>
		estimateBehind(
			counting.filter((holding) => holding.accountId === accountId),
			today,
		);

	const counted = { accounts: shownAccounts, balances: visible, worth };
	const have = moneyOnHand(counted);

	// A benefit card's leftover is the whole card, made of every lunch on it whoever ate it,
	// so there is no line to draw for somebody who can see none of them. The model answers
	// nothing for them, and drawing the line anyway would say the allowance is not written
	// down when it is.
	// Decided by the space of each card, and only once that is known: nothing is drawn while
	// the roles are on their way, rather than a line that may be wrong for a moment.
	const vouchers = shownAccounts.filter(
		(account) => account.kind === "voucher" && narrowedIn(account.spaceId) === false,
	);

	// Putting money aside from here, in the space that is open: the rule and the goals are
	// read for it alone, and so are the accounts the money may come from.
	const mayMoveHere = mine.mayCall("transactions.create");
	const accountsHere = shownAccounts.filter((account) => account.spaceId === spaceId);
	const saveNow = mayMoveHere
		? saveNowStart(savings.data, accountsHere, i18n.resolvedLanguage, t)
		: null;
	const putIntoGoal = (goal: GoalProgress) =>
		mayMoveHere ? intoGoalStart(goal, accountsHere, i18n.resolvedLanguage, t) : null;
	// Kept in a holding: Guardar on it, which is a movement of the holding as well.
	const mayPutIn = mayMoveHere && mine.mayCall("investments.move");
	const holdingsHere = (holdings.data ?? []).filter((holding) => holding.spaceId === spaceId);
	const saveNowIn = mayPutIn
		? saveNowHolding(savings.data, holdingsHere, accountsHere, i18n.resolvedLanguage)
		: null;
	const putIntoGoalHolding = (goal: GoalProgress) =>
		mayPutIn ? intoGoalHolding(goal, holdingsHere, accountsHere, i18n.resolvedLanguage) : null;

	/** Whether any of the spaces being added together is narrowed to this person's rows. */
	const narrowedSomewhere = Object.values(narrowed.data ?? {}).some(Boolean);

	/**
	 * Money still to arrive and still to leave before the month ends, which is the household's
	 * money only. A lunch on a benefit card dated next week is not money leaving the bank, and
	 * counting it took what was left to spend down by what the allowance pays for.
	 */
	const rest = (consolidated ? (restEverywhere.data ?? []) : (restOfMonth.data ?? [])).filter(
		(row) => !onABenefitCard(row.accountId),
	);
	/**
	 * The cards, the one to deal with first at the top: late, then closed and owed, then
	 * something on the open invoice, then nothing. They came in the order the database sorted
	 * names, which put a late card below one with nothing on it.
	 */
	const shownCards = cardsByUrgency(
		(consolidated ? (cardsEverywhere.data ?? []) : (cards.data ?? [])).map((card) => ({
			...card,
			name: card.account.name,
			// An invoice is summed in the currency of its space, so that is the one that says
			// whether two cards can be added together.
			currency: spaces.find((space) => space.id === card.account.spaceId)?.baseCurrency ?? currency,
		})),
		today,
		i18n.resolvedLanguage,
	);
	/** Every card added up, for the single line three cards or more become. */
	const together = cardsTogether(shownCards, today);

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
	 *
	 * By the one rule for what falls due, to the end of the month and with the late counted.
	 * An invoice holding a purchase in another currency with no rate for the day has no honest
	 * figure, and the rule sets it apart rather than folding it into what is left to spend; the
	 * block for that card says so instead.
	 */
	const invoicesDue = billsFallingDue({
		today,
		until: endOfMonth,
		records: [],
		invoices: shownCards.flatMap((card) =>
			[card.open, ...card.owing].map((state) => ({
				card: card.account.name,
				accountId: card.account.id,
				month: state.month,
				dueOn: state.dueOn,
				left: state.left,
				withoutRate: state.withoutRate,
				scheduled: state.scheduled,
				scheduledOn: state.scheduledOn,
				scheduledBy: state.scheduledBy,
			})),
		),
		spendable: 0,
	}).total;
	const fallingDue = goingOut + invoicesDue;

	const putAside = consolidated ? savingsEverywhere.data : savings.data;
	const stillToSave = Math.max(0, (putAside?.expected ?? 0) - (putAside?.put ?? 0));
	/** Whether any of the spaces the figure is made of has a rule, which nothing above says. */
	const hasARule = consolidated
		? (savingsEverywhere.data?.rules ?? 0) > 0
		: Boolean(savings.data?.rule);
	/** Read, so "no rule" is an answer and not a figure still on its way. */
	const ruleKnown = consolidated ? savingsEverywhere.isSuccess : savings.isSuccess;
	// Without the savings accounts the rule and the goals put money in, or moving money into
	// one of them would raise what is left to spend by what was just put aside.
	const asideIn = consolidated
		? (savingsEverywhere.data?.accountIds ?? [])
		: [savings.data?.rule?.accountId ?? null, ...(goals.data ?? []).map((goal) => goal.accountId)];
	const left = canSpendThisMonth({
		spendable: spendableThisMonth(counted, asideIn),
		comingIn,
		fallingDue,
		stillToSave,
	});

	/**
	 * Every invoice a card is still owing, as one bill each, with the card it belongs to.
	 *
	 * The one still taking purchases, and every one that closed and was not paid. The closed
	 * ones are what somebody has to act on, and they were on no list here at all; then they
	 * were, one of them, the newest, while the headroom of the card counted all of them.
	 */
	const invoiceBills = shownCards.flatMap((card) =>
		[card.open, ...card.owing]
			.filter((state) => state !== null)
			.map((state) => ({
				id: `invoice:${card.account.id}:${state.month}`,
				card: card.account.name,
				accountId: card.account.id,
				month: state.month,
				dueOn: state.dueOn,
				left: state.left,
				withoutRate: state.withoutRate,
				scheduled: state.scheduled,
				scheduledBy: state.scheduledBy,
				on: state.dueOn,
				description: t("dashboard.invoiceOf", { card: card.account.name }),
				amount: -state.left,
				// An invoice is summed in the currency of the space, from each purchase at the
				// rate written down with it, which is also how this row reaches the figure
				// above. It used to carry the currency of the card's account and be added into
				// a total in the base currency anyway.
				currency,
				kind: "expense" as const,
				invoice: true,
				// A payment dated ahead is not paid yet, so the bill stays here and says when the
				// money leaves, and offers payment only for what that payment does not cover.
				scheduledOn: state.scheduled > 0 ? state.scheduledOn : null,
				payable: amountToPay(state) > 0,
				cardAccountId: card.account.id,
				cardSpaceId: card.account.spaceId,
			})),
	);

	/**
	 * What falls due in the next days, by the one rule for it (`billsFallingDue`, decision 14 of
	 * 2.0.0), which the check up reads too: money out still to come that is not already on an
	 * invoice, never a lunch on a benefit card and never a move, and every invoice on its due
	 * day. A bill past its due day is late and is answered above; one with a purchase in another
	 * currency and no rate is set apart, and the block of its card says so.
	 */
	const upcomingRows = (upcoming.data ?? []).map((row) => ({
		id: row.id,
		on: row.happenedOn,
		description: row.description,
		amount: row.amount,
		currency: row.currency,
		kind: row.kind,
		invoice: false,
		repeats: row.recurrenceId !== null,
		spaceId: row.spaceId,
	}));
	const bills = billsFallingDue({
		today,
		until: addDays(today, SOON_DAYS),
		// Weighed in the currency of the space, from the figure at the rate of the day.
		records: (upcoming.data ?? []).map((row, index) => ({
			description: row.description,
			amount: Math.abs(row.amountInBase),
			day: row.happenedOn,
			kind: row.kind,
			status: row.status,
			invoiceMonth: row.invoiceMonth,
			onCardWithCycle: cardWithCycle(row.accountId),
			onBenefitCard: onABenefitCard(row.accountId),
			shown: upcomingRows[index],
		})),
		invoices: invoiceBills,
		spendable: spendableNow(counted),
	});

	/** What leaves, a card invoice as one bill on the day it falls due, soonest first. */
	type DueLine = (typeof invoiceBills)[number] | (typeof upcomingRows)[number];
	const goingSoon: DueLine[] = bills.coming.flatMap((bill): DueLine[] => {
		if (bill.invoice) return [bill.invoice];
		return bill.record?.shown ? [bill.record.shown] : [];
	});
	/** What comes in, which is listed and never weighed against anything. */
	const comingSoon: DueLine[] = upcomingRows.filter((row) => row.kind === "income");
	const dues: DueLine[] = [...goingSoon, ...comingSoon].sort((one, other) =>
		one.on < other.on ? -1 : 1,
	);
	/** Whether what falls due is still being read: the records, and the cards the invoices are of. */
	const duesPending =
		upcoming.isPending || (consolidated ? cardsEverywhere.isPending : cards.isPending);
	/** Whether where the money is is still being read: the accounts, what they hold and the holdings. */
	const wherePending =
		holdings.isPending ||
		(consolidated
			? everywhere.isPending || balancesEverywhere.isPending
			: accounts.isPending || balances.isPending);
	/** The invoices past their due day, which the block of late things answers. */
	const toAnswer = bills.late.flatMap((bill) => (bill.invoice ? [bill.invoice] : []));

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

	/** A credit card with a closing day and a due day, whose invoice holds what it marks. */
	function cardWithCycle(id: string): boolean {
		const account = shownAccounts.find((one) => one.id === id);
		return account?.kind === "credit" && account.closingDay !== null && account.dueDay !== null;
	}

	/** By the core's own list of which kinds of account are a benefit and not money. */
	function onABenefitCard(id: string): boolean {
		const kind = shownAccounts.find((account) => account.id === id)?.kind;
		return kind !== undefined && isBenefit(kind);
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
		// The bills of the one rule, and nothing else: a purchase on a card is its invoice, money
		// coming in never falls due, and each invoice says so on its due day. The late ones are
		// in the block of what is late, above this one.
		bills: bills.coming.map((bill) => ({
			description:
				bill.kind === "invoice" ? t("dashboard.invoiceOf", { card: bill.subject }) : bill.subject,
			amount: bill.amount,
			happenedOn: bill.dueOn,
		})),
		// Every card about to close, which was never handed over, so the notice was written and
		// never shown.
		invoicesClosing: shownCards
			.filter((card) => !card.cycleMissing)
			.map((card) => ({
				name: card.account.name,
				closesOn: card.open.closesOn,
				month: new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
					month: "long",
					timeZone: "UTC",
				}).format(new Date(`${card.open.month}-01T00:00:00Z`)),
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

	const moneyIn = (value: unknown, inCurrency: string) =>
		new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			style: "currency",
			currency: inCurrency,
		}).format(Number(value) / 100);
	const money = (value: unknown) => moneyIn(value, currency);

	/**
	 * What a usual month leaves over against this one, the benefit counted as income as it is
	 * everywhere income is read. Nothing until three months are closed: the middle of two is
	 * not a usual month.
	 */
	const againstUsual = againstAUsualMonth({
		month,
		today,
		months: (monthsBefore.data ?? []).map((one) => ({
			month: one.month,
			income: one.income + one.benefits,
			expense: one.expense,
		})),
	});
	const usualLeft = againstUsual ? leftAgainstUsual(againstUsual) : null;
	/** The three categories that weighed most so far, money nobody sorted included. */
	const weighedMost = (heaviest.data ?? [])
		.map((one) => ({ ...one, total: Math.abs(one.total) }))
		.filter((one) => one.total > 0)
		.sort((one, other) => other.total - one.total)
		.slice(0, 3);
	/** The limits broken or close to it, the worst two. */
	const nearLimits = limitsNearBreaking(
		(budgets.data ?? []).map((one) => ({
			budgetId: one.id,
			limit: one.progress.limit,
			spent: one.progress.spent,
		})),
	).slice(0, 2);
	const limitNamed = (budgetId: string) => {
		const found = (budgets.data ?? []).find((one) => one.id === budgetId);
		return found ? nameOfLimit(found) : "";
	};
	const usualSentence = usualLeft
		? usualLeft.usualLeft >= 0
			? {
					better: t("dashboard.usualOverBetter", { usual: money(usualLeft.usualLeft) }),
					worse: t("dashboard.usualOverWorse", { usual: money(usualLeft.usualLeft) }),
					same: t("dashboard.usualOverSame", { usual: money(usualLeft.usualLeft) }),
					tooEarly: t("dashboard.usualOverEarly", { usual: money(usualLeft.usualLeft) }),
				}[usualLeft.verdict]
			: {
					better: t("dashboard.usualShortBetter", { usual: money(-usualLeft.usualLeft) }),
					worse: t("dashboard.usualShortWorse", { usual: money(-usualLeft.usualLeft) }),
					same: t("dashboard.usualShortSame", { usual: money(-usualLeft.usualLeft) }),
					tooEarly: t("dashboard.usualShortEarly", { usual: money(-usualLeft.usualLeft) }),
				}[usualLeft.verdict]
		: null;

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

				{/* Every figure below is written in the currency of the open space. Spaces that
				    count in different ones add numbers that are not one amount, and that is
				    said rather than left to be read as euros and reais together. */}
				{consolidated && currencies.length > 1 ? (
					<Callout tone="problem">
						{t("dashboard.currenciesDiffer", { list: currencies.join(", ") })}
					</Callout>
				) : null}

				{/* The four questions the product brief promises an answer to, on one line.
				    Not before everything they add up is in: the balances of every space in
				    "Todos", the holdings, the cards, what is left of the month and the saving rule.
				    It showed the total without the holdings for a moment and then with them, and
				    what was left to spend without the invoices due this month until the cards came,
				    two answers to one question a second apart. */}
				{balances.isPending ||
				holdings.isPending ||
				cards.isPending ||
				restOfMonth.isPending ||
				savings.isPending ||
				(consolidated &&
					(everywhere.isPending ||
						balancesEverywhere.isPending ||
						cardsEverywhere.isPending ||
						restEverywhere.isPending ||
						savingsEverywhere.isPending)) ? (
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
							{/* A rule of ten per cent before anything came in asks for nothing yet,
							    and it is still a rule. */}
							{hasARule ? (
								<Figure
									label={t("dashboard.stillToSave")}
									amount={stillToSave}
									currency={currency}
								/>
							) : (
								<div className="min-w-0">
									<p className="text-quiet text-sm">{t("dashboard.stillToSave")}</p>
									{ruleKnown ? (
										<p className="mt-1 text-quiet text-sm">{t("dashboard.noRuleShort")}</p>
									) : null}
								</div>
							)}
						</div>
					</div>
				)}

				{/* What is owed and what is allowed, each on a line of its own, because
				    neither of them is the money somebody has. Three cards or more are one line, the
				    open invoices, the closed ones and the late ones added up, because a band of four
				    card lines pushed the answer to "what can I spend" off a telephone screen; the
				    list of them is further down. The same for three benefit cards or more. */}
				{shownCards.length > 0 || vouchers.length > 0 ? (
					<div className="mt-4 divide-y divide-line border-line border-t">
						{shownCards.length >= 3 ? (
							<CardsTogetherLine together={together} currency={currency} />
						) : (
							shownCards.map((card) => (
								<div
									key={card.account.id}
									className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
								>
									<div className="min-w-0">
										<p className="truncate">{card.account.name}</p>
										{card.cycleMissing ? (
											<p className="text-ochre text-sm">{t("dashboard.cardWithoutCycle")}</p>
										) : (
											<p className="text-quiet text-sm">
												<Value amount={card.open.charged} currency={card.currency} />{" "}
												{t("dashboard.onTheInvoiceDue", { day: dayAndMonth(card.open.dueOn) })}
												{card.later > 0 ? (
													<>
														{", "}
														<Value amount={card.later} currency={card.currency} />{" "}
														{t("dashboard.inPartsAfter")}
													</>
												) : null}
											</p>
										)}
										{/* What closed and is still owed, said on the card's own line, because it
										    is the one thing about a card somebody has to act on and the line
										    above it is about the one still open. Every one of them, summed:
										    answering with the newest hid the older debt while the headroom of
										    the card went on counting it. Late only once the due day has gone. */}
										<OwedLines owing={card.owing} currency={card.currency} />
									</div>
									{card.cycleMissing ? null : (
										<InvoiceLink
											spaceId={card.account.spaceId}
											accountId={card.account.id}
											month={firstToPay(card).month}
											owed={amountToPay(firstToPay(card)) > 0}
										/>
									)}
								</div>
							))
						)}
						{vouchers.length >= 3 ? (
							<VouchersTogetherLine vouchers={vouchers} today={today} currency={currency} />
						) : (
							vouchers.map((voucher) => (
								<VoucherLine
									key={voucher.id}
									accountId={voucher.id}
									spaceId={voucher.spaceId}
									name={voucher.name}
									currency={voucher.currency}
									today={today}
									onTopUp={
										shownAccounts.some(
											(account) => account.spaceId === voucher.spaceId && movesOutOf(account),
										)
											? () =>
													setMoving({
														spaceId: voucher.spaceId,
														start: {
															toId: voucher.id,
															title: t("move.topUpTitle", { name: voucher.name }),
															description: t("move.topUpDescription"),
														},
													})
											: undefined
									}
								/>
							))
						)}
					</div>
				) : null}
			</Panel>

			{/* Where the focus goes when the dialog that confirmed them closes: it fell to the body
			    of the page, and somebody on a keyboard started again from the top. */}
			{confirmedAll > 0 ? (
				<Callout tone="neutral" ref={confirmedMessage} focusable={true}>
					{t("dashboard.confirmedLate", { count: confirmedAll })}
				</Callout>
			) : null}

			{/* Late first, because it is the only thing on this screen that is already wrong. */}
			{lateRecords.length > 0 || toAnswer.length > 0 ? (
				<Callout
					tone="problem"
					title={t("dashboard.late")}
					action={
						// From two upwards. With one record its own button is already the shortest path.
						maySettleAll && lateRecords.length > 1 ? (
							<Button size="small" variant="secondary" onClick={() => setAskingAll(true)}>
								{t("dashboard.confirmAllLate", { count: lateRecords.length })}
							</Button>
						) : null
					}
				>
					{/* The bills above the promises, because an invoice past its due day is costing
					    money every day it waits while a record is only waiting for a yes. */}
					{toAnswer.length > 0 ? (
						<ul className="mt-1 space-y-2">
							{toAnswer.map((row) => (
								<li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2">
									<span className="min-w-0">
										<span className="font-mono text-quiet text-xs">{dayAndMonth(row.dueOn)}</span>{" "}
										{row.description}{" "}
										<span className="text-quiet text-xs">{t("dashboard.lateInvoice")}</span>
									</span>
									<span className="flex items-center gap-2">
										<Value amount={row.amount} currency={row.currency} tone="auto" />
										<InvoiceLink
											spaceId={row.cardSpaceId}
											accountId={row.accountId}
											month={row.month}
											owed={row.payable}
										/>
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
											{/* Saying it did not happen deletes the record, so it is the delete
											    permission and not the update one. The two hold the same roles
											    today, so this gate agreed with the refusal behind it by
											    accident, and would have stopped agreeing the day they parted. */}
											{mayDrop ? (
												<Button size="small" variant="quiet" onClick={() => setDropping(row)}>
													{t("dashboard.didNotHappen")}
												</Button>
											) : null}
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
						<Link
							to={ROUTES.advisor}
							className={buttonClasses({ variant: "quiet", size: "small" })}
						>
							{t("dashboard.seeMore")}
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
							{/* The check up reads one space, the one open, whatever "Todos" adds up. */}
							{consolidated ? (
								<p className="mb-2 text-quiet text-xs">
									{t("dashboard.findingsOfSpace", { space: currentSpace.name })}
								</p>
							) : null}
							<Findings findings={found} money={money} limit={SHOWN} />
						</div>
					) : null}
				</Panel>
			) : null}

			<Panel
				title={t("dashboard.dueSoon")}
				// Where the check up sends somebody about what falls due.
				id="vence"
				action={
					<Link
						to={ROUTES.transactions}
						className={buttonClasses({ variant: "quiet", size: "small" })}
					>
						{t("dashboard.seeTransactions")}
					</Link>
				}
			>
				{/* The records and the invoices of the cards: with the records alone, the list
				    said "Nada previsto" over an invoice due in five days until the cards came. */}
				{duesPending ? <Skeleton lines={3} /> : null}
				{!duesPending && dues.length === 0 ? (
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
									spaceId={spaceId}
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
									spaceId={spaceId}
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
				<Panel title={t("dashboard.cardsTitle")} id="cartoes">
					<ul className="divide-y divide-line border-line border-t">
						{shownCards.map((card) => (
							<CardRow key={card.account.id} card={card} />
						))}
					</ul>
					{/* What every card holds together, open and owed. Never the limits added up:
					    a limit is a card's and two of them are not one bigger card. */}
					{shownCards.length >= 2 && together.currency !== null ? (
						<p className="border-line border-t pt-2 text-sm">
							{t("dashboard.cardsTotal", {
								open: moneyIn(together.open, together.currency),
								owed: moneyIn(together.closed + together.overdue, together.currency),
							})}
						</p>
					) : null}
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
					{/* The three figures alone were a third of what proposal 3 drew: against a usual
					    month, what weighed most, and the limits about to give. */}
					{usualSentence ? <p className="mt-3 text-quiet text-sm">{usualSentence}</p> : null}
					{weighedMost.length > 0 ? (
						<div className="mt-4">
							<p className="text-quiet text-sm">{t("dashboard.weighedMost")}</p>
							<ul className="mt-1 divide-y divide-line border-line border-t">
								{weighedMost.map((one) => (
									<li
										key={one.categoryId ?? "none"}
										className="flex items-baseline justify-between gap-3 py-2"
									>
										<span className="min-w-0">{one.name ?? t("reports.noCategory")}</span>
										<Value amount={one.total} currency={currency} />
									</li>
								))}
							</ul>
						</div>
					) : null}
					{nearLimits.map((risk) => (
						<p key={risk.budgetId} className="mt-3 text-sm">
							{t(risk.state === "over" ? "dashboard.limitOver" : "dashboard.limitClose", {
								name: limitNamed(risk.budgetId),
								spent: money(risk.spent),
								limit: money(risk.limit),
							})}
						</p>
					))}
				</Panel>

				<Panel title={t("dashboard.savingAndGoals")}>
					{/* The answer always comes back, rule or not, so whether there is a rule is
					    the rule itself. Asked of the answer, "no rule" never showed and the
					    sentence said the rule asked for nothing. And nothing while it is read,
					    which used to say "no rule" to everybody who had one. */}
					{savings.data?.rule ? (
						<p>
							{t("dashboard.ruleAsks")} <Value amount={savings.data.expected} currency={currency} />
							. {t("dashboard.savedSoFar")} <Value amount={savings.data.put} currency={currency} />.
						</p>
					) : savings.isSuccess ? (
						<p className="text-quiet text-sm">{t("dashboard.noRule")}</p>
					) : null}
					{saveNow ? (
						<Button
							size="small"
							variant="secondary"
							className="mt-2"
							onClick={() => setMoving({ spaceId, start: saveNow })}
						>
							{t("move.saveNow")}
						</Button>
					) : saveNowIn ? (
						<Button
							size="small"
							variant="secondary"
							className="mt-2"
							onClick={() => setPuttingIn(saveNowIn)}
						>
							{t("move.saveNow")}
						</Button>
					) : null}
					{(goals.data ?? []).length > 0 ? (
						<ul className="mt-3 divide-y divide-line border-line border-t">
							{(goals.data ?? []).slice(0, 3).map((goal) => {
								const intoGoal = putIntoGoal(goal);
								const intoGoalHolding = intoGoal ? null : putIntoGoalHolding(goal);
								return (
									<li
										key={goal.id}
										className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
									>
										<span className="min-w-0 truncate">{goal.name}</span>
										<span className="flex items-baseline gap-3">
											<span className="text-quiet text-sm">
												<Value amount={goal.saved} currency={currency} /> {t("dashboard.ofTarget")}{" "}
												<Value amount={goal.targetAmount} currency={currency} />
											</span>
											{intoGoal ? (
												<Button
													size="small"
													variant="quiet"
													onClick={() => setMoving({ spaceId, start: intoGoal })}
												>
													{t("move.intoGoal")}
												</Button>
											) : intoGoalHolding ? (
												<Button
													size="small"
													variant="quiet"
													onClick={() => setPuttingIn(intoGoalHolding)}
												>
													{t("move.intoGoal")}
												</Button>
											) : null}
										</span>
									</li>
								);
							})}
						</ul>
					) : null}
				</Panel>
			</div>

			<Panel
				title={t("dashboard.whereItIs")}
				action={
					<Link to={ROUTES.accounts} className={buttonClasses({ variant: "quiet", size: "small" })}>
						{t("dashboard.seeAccounts")}
					</Link>
				}
			>
				{/* With what each account holds: the investment accounts read R$ 0,00 until the
				    holdings came. */}
				{wherePending ? <Skeleton lines={4} /> : null}
				{!wherePending && shownAccounts.length === 0 && ready ? (
					<EmptyState
						icon="wallet"
						title={t("accounts.emptyTitle")}
						description={mayMakeAnAccount ? t("accounts.emptyBody") : t("accounts.emptyForYou")}
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
				) : null}

				{(wherePending ? [] : GROUPS).map((group) => {
					const found = shownAccounts.filter((account) => group.kinds.includes(account.kind));
					if (found.length === 0) return null;
					// Cards in the order somebody has to deal with them, and three or more of them as
					// one line with what they owe together, which a button opens into a line each.
					const cardOrder = shownCards.map((card) => card.account.id);
					const rows =
						group.key === "cards"
							? [...found].sort(
									(left, right) =>
										(cardOrder.indexOf(left.id) + 1 || cardOrder.length + 1) -
										(cardOrder.indexOf(right.id) + 1 || cardOrder.length + 1),
								)
							: found;
					const folded = group.key === "cards" && rows.length >= 3;
					const owedTogether = rows.reduce(
						(total, account) =>
							total + (visible.find((one) => one.accountId === account.id)?.settled ?? 0),
						0,
					);
					return (
						<div key={group.key} className="mb-4 last:mb-0">
							<p className="text-quiet text-sm">{t(`dashboard.group.${group.key}`)}</p>
							{folded ? (
								<div className="mt-1 flex items-baseline justify-between gap-4 border-line border-t py-2">
									<span className="min-w-0">
										{t("dashboard.cardsCount", { count: rows.length })}
									</span>
									<span className="flex items-baseline gap-3">
										<Value amount={owedTogether} currency={currency} tone="auto" />
										<Button
											size="small"
											variant="quiet"
											aria-expanded={cardsOpen}
											onClick={() => setCardsOpen(!cardsOpen)}
										>
											{cardsOpen ? t("dashboard.hideEachCard") : t("dashboard.showEachCard")}
										</Button>
									</span>
								</div>
							) : null}
							{folded && !cardsOpen ? null : (
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
													{/* What is on a benefit card is worked out and never read off a
												    balance, which is registry 0043. This row read the balance,
												    and since nothing is written when an allowance lands that is
												    roughly the negative of what has been eaten, so one card
												    showed two unrelated numbers on one screen. */}
													{account.kind === "voucher" ? (
														<VoucherAmount
															accountId={account.id}
															currency={account.currency}
															today={today}
															known={narrowedIn(account.spaceId) === false}
														/>
													) : (
														<span className="text-right">
															<Value amount={amount} currency={account.currency} tone="auto" />
															{account.kind === "investment" && behindIn(account.id) ? (
																<span className="block text-quiet text-xs">
																	{t("investments.estimatedThrough", {
																		day: shortDay(
																			behindIn(account.id) ?? today,
																			i18n.resolvedLanguage,
																		),
																	})}
																</span>
															) : null}
														</span>
													)}
												</Link>
											</li>
										);
									})}
								</ul>
							)}
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

			{/* "It did not happen" deletes the record, and it deleted it with nothing asked: one
			    press beside "It happened" and it was gone, an occurrence of a series for good,
			    because a series does not write again what somebody removed. The question the list
			    asks before deleting, in the same words. */}
			<Dialog
				open={dropping !== null}
				onOpenChange={(next) => !next && setDropping(null)}
				title={t("transactions.deleteTitle")}
				description={t("transactions.deleteDescription")}
				closeLabel={t("actions.close")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setDropping(null)}>
							{t("actions.cancel")}
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								if (dropping) drop.mutate(dropping.id);
								setDropping(null);
							}}
						>
							{t("actions.delete")}
						</Button>
					</>
				}
			>
				<p className="text-sm">
					{t("transactions.deleteOne", { description: dropping?.description ?? "" })}
				</p>
				{dropping?.recurrenceId ? (
					<p className="mt-2 text-quiet text-sm">{t("transactions.deleteOccurrence")}</p>
				) : null}
				<p className="mt-2 text-quiet text-sm">{t("transactions.deleteForever")}</p>
			</Dialog>

			<MoveDialog
				open={moving !== null}
				onOpenChange={(next) => !next && setMoving(null)}
				spaceId={moving?.spaceId ?? spaceId}
				accounts={shownAccounts.filter((account) => account.spaceId === moving?.spaceId)}
				today={today}
				start={moving?.start}
			/>
			<HoldingMoveDialog
				open={puttingIn !== null}
				onOpenChange={(next) => !next && setPuttingIn(null)}
				spaceId={spaceId}
				holding={puttingIn?.holding ?? null}
				kind="in"
				accounts={accountsHere}
				today={today}
				amount={puttingIn?.amount}
			/>
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
	/** Written by a series, which the line says. */
	repeats?: boolean;
	/** On a record: its space, whose role decides whether it may be said to have happened. */
	spaceId?: string;
	/** On an invoice: the day a payment already written for it leaves the bank. */
	scheduledOn?: string | null;
	/** On an invoice: whether anything is left that no payment covers yet. */
	payable?: boolean;
	/** On an invoice: the card, its space and the invoice, for the way to it. */
	cardAccountId?: string;
	cardSpaceId?: string;
	month?: string;
};

/**
 * What a card still owes on invoices that have closed, on its line at the top.
 *
 * Two lines and two tones. What fell due and was not paid is the one thing about a card
 * that is already wrong, so it is drawn in the colour of a problem, every invoice of it
 * summed. The invoice that has closed and is not due yet is simply owed, so it is said in
 * the ordinary colour with the day it falls due.
 */
function OwedLines({ owing, currency }: { owing: readonly InvoiceState[]; currency: string }) {
	const { t } = useTranslation();
	const late = owing.filter((state) => state.late);
	const waiting = owing.filter((state) => !state.late);
	return (
		<>
			{late.length > 0 ? (
				<p className="text-sm text-seal">
					<Value
						amount={late.reduce((total, state) => total + state.left, 0)}
						currency={currency}
					/>{" "}
					{late.length === 1
						? t("dashboard.invoiceStillOwed", { day: dayAndMonth(late[0]?.dueOn ?? "") })
						: t("dashboard.invoicesStillOwed", { count: late.length })}
				</p>
			) : null}
			{waiting.map((state) => (
				<p key={state.month} className="text-quiet text-sm">
					<Value amount={state.left} currency={currency} />{" "}
					{t("dashboard.invoiceClosedNotDue", { day: dayAndMonth(state.dueOn) })}
				</p>
			))}
		</>
	);
}

/** The invoice a card's button opens: the oldest one still owed, or the open one. */
function firstToPay(card: { open: InvoiceState; owing: readonly InvoiceState[] }): InvoiceState {
	return card.owing.find((state) => amountToPay(state) > 0) ?? card.open;
}

/**
 * Three cards or more as one line at the top: how many, what the open invoices hold, what
 * has closed and falls due, and what is late, each in its own tone, and the way to the list.
 * In more than one currency, which happens in "Todos", the sums are not said.
 */
function CardsTogetherLine({ together, currency }: { together: CardsTogether; currency: string }) {
	const { t } = useTranslation();
	const shown = together.currency ?? currency;
	return (
		<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
			<div className="min-w-0">
				<p>
					{t("dashboard.cardsCount", { count: together.count })}
					{together.currency === null ? (
						<span className="text-quiet text-sm"> {t("dashboard.cardsInCurrencies")}</span>
					) : (
						<>
							{": "}
							<Value amount={together.open} currency={shown} /> {t("dashboard.onOpenInvoices")}
						</>
					)}
				</p>
				{together.currency !== null && together.closed > 0 && together.closedDueOn ? (
					<p className="text-quiet text-sm">
						<Value amount={together.closed} currency={shown} />{" "}
						{t("dashboard.closedTogether", { day: dayAndMonth(together.closedDueOn) })}
					</p>
				) : null}
				{together.currency !== null && together.overdue > 0 ? (
					<p className="text-sm text-seal">
						<Value amount={together.overdue} currency={shown} /> {t("dashboard.overdueTogether")}
					</p>
				) : null}
			</div>
			<a href="#cartoes" className={buttonClasses({ variant: "secondary", size: "small" })}>
				{t("dashboard.seeCards")}
			</a>
		</div>
	);
}

/**
 * Three benefit cards or more as one line: how many, and what is left on them together, in
 * the one currency they share.
 */
function VouchersTogetherLine({
	vouchers,
	today,
	currency,
}: {
	vouchers: readonly { id: string; currency: string }[];
	today: CalendarDate;
	currency: string;
}) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const left = useQuery({
		queryKey: ["benefit", "together", vouchers.map((one) => one.id).join(","), today],
		enabled: Boolean(session),
		queryFn: async () => {
			if (!session) return null;
			const states = await Promise.all(
				vouchers.map((one) => session.accounts.benefitLeft(one.id, today)),
			);
			return states.reduce((total, state) => total + (state?.left ?? 0), 0);
		},
	});
	const one = new Set(vouchers.map((voucher) => voucher.currency)).size === 1;
	return (
		<div className="py-2">
			<p>
				{t("dashboard.vouchersCount", { count: vouchers.length })}
				{one && left.data !== undefined && left.data !== null ? (
					<>
						{": "}
						<Value amount={left.data} currency={vouchers[0]?.currency ?? currency} />{" "}
						{t("dashboard.leftOnVouchers")}
					</>
				) : null}
			</p>
		</div>
	);
}

/**
 * One card on one line of the list: what the open invoice holds, when it closes and falls
 * due, what has closed and is still owed, how much of the limit is left, and the way to it.
 * On a telephone the line breaks in two without cutting a figure. Rules between lines and no
 * boxes, which is registry 0023.
 */
function CardRow({ card }: { card: CardStanding & { currency: string } }) {
	const { t, i18n } = useTranslation();
	const currency = card.currency;
	const monthWord = (month: string) =>
		new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			month: "long",
			timeZone: "UTC",
		}).format(new Date(`${month}-01T00:00:00Z`));
	return (
		<li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
			<div className="min-w-0">
				<p className="font-medium text-ink">
					{card.account.name}
					{card.account.archivedAt !== null ? (
						<span className="text-quiet text-sm"> ({t("invoice.archivedMark")})</span>
					) : null}
				</p>
				{card.cycleMissing ? (
					<p className="text-ochre text-sm">
						{t("dashboard.cardWithoutCycle")}{" "}
						<Link to={ROUTES.accounts} className="underline">
							{t("invoice.goToAccounts")}
						</Link>
					</p>
				) : (
					<>
						<p className="text-sm">
							<Value amount={card.open.charged} currency={currency} />{" "}
							<span className="text-quiet">
								{t("dashboard.closesAndDue", {
									closes: dayAndMonth(card.open.closesOn),
									due: dayAndMonth(card.open.dueOn),
								})}
							</span>
						</p>
						<OwedLines owing={card.owing} currency={currency} />
						{/* A split invoice owes nothing more and is in none of the lines above, so the
						    list says it is in parts. */}
						{card.lastClosed?.standing === "inParts" ? (
							<p className="text-quiet text-sm">
								{t("dashboard.lastInParts", { month: monthWord(card.lastClosed.month) })}
							</p>
						) : null}
						{card.later > 0 ? (
							<p className="text-quiet text-sm">
								<Value amount={card.later} currency={currency} /> {t("dashboard.inPartsAfter")}
							</p>
						) : null}
						{card.open.withoutRate > 0 ? (
							<p className="text-seal text-sm">{t("dashboard.invoiceWithoutRate")}</p>
						) : null}
						<p className="text-quiet text-sm">
							{card.limitInAnotherCurrency ? (
								t("dashboard.limitInAnotherCurrency")
							) : card.available === null ? (
								t("dashboard.noLimitYet")
							) : (
								<>
									{t("dashboard.limitLeft")} <Value amount={card.available} currency={currency} />
								</>
							)}
						</p>
					</>
				)}
			</div>
			{card.cycleMissing ? null : (
				<InvoiceLink
					spaceId={card.account.spaceId}
					accountId={card.account.id}
					month={firstToPay(card).month}
					owed={amountToPay(firstToPay(card)) > 0}
				/>
			)}
		</li>
	);
}

/**
 * The way to one invoice of one card, from anywhere on this screen.
 *
 * It led to the invoice screen with no card named, or with the card and not the month, so
 * with two cards the button of the second opened the first, and the line of an invoice that
 * had closed opened the one still open. It says "Pagar fatura" only to somebody who may pay
 * in the space the card belongs to, which in "Todos" is not always the space that is open;
 * everybody else is offered the invoice to look at. An anchor dressed as a button, because a
 * button inside a link is two stops for one action.
 */
function InvoiceLink({
	spaceId,
	accountId,
	month,
	owed,
	variant = "secondary",
}: {
	spaceId: string;
	accountId: string;
	month: string;
	/** Whether anything on it is left to pay, without which there is nothing to pay. */
	owed: boolean;
	variant?: "secondary" | "quiet";
}) {
	const { t } = useTranslation();
	const pays = useWhatIMayDo(spaceId).mayCall("invoices.pay") && owed;
	return (
		<Link
			to={ROUTES.invoices}
			search={{ cartao: accountId, mes: month }}
			className={buttonClasses({ variant, size: "small" })}
		>
			{pays ? t("invoice.pay") : t("invoice.see")}
		</Link>
	);
}

function DueRow({
	row,
	spaceId,
	onSettle,
	label,
}: {
	row: Due;
	/** The space that is open, for a row that does not say its own. */
	spaceId: string;
	onSettle: () => void;
	label: string;
}) {
	const { t } = useTranslation();
	// By the role in the record's own space: in "Todos" this list holds every space, and a viewer
	// of one of them was offered a button the model then refused.
	const mayUpdate = useWhatIMayDo(row.spaceId ?? spaceId).mayCall("transactions.settle");
	return (
		<li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
			<span className="flex min-w-0 items-baseline gap-2">
				<span className="font-mono text-quiet text-xs">{dayAndMonth(row.on)}</span>
				<span className="truncate">{row.description}</span>
				{row.invoice ? <span className="text-quiet text-xs">{t("dashboard.oneBill")}</span> : null}
				{row.repeats ? (
					<span className="text-quiet text-xs">{t("transactions.repeats")}</span>
				) : null}
				{row.invoice && row.scheduledOn ? (
					<span className="text-quiet text-xs">
						{t("dashboard.paymentScheduled", { day: dayAndMonth(row.scheduledOn) })}
					</span>
				) : null}
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
				{row.invoice && row.cardAccountId && row.cardSpaceId && row.month ? (
					<InvoiceLink
						spaceId={row.cardSpaceId}
						accountId={row.cardAccountId}
						month={row.month}
						owed={row.payable !== false}
					/>
				) : null}
			</span>
		</li>
	);
}

/** What is left on one benefit card, which is worked out rather than stored. */
function VoucherLine({
	accountId,
	spaceId,
	name,
	currency,
	today,
	onTopUp,
}: {
	accountId: string;
	/** The space of the card, whose role decides whether money may be put on it. */
	spaceId: string;
	name: string;
	/** The currency of the card, which is the one every other line in this panel uses. */
	currency: string;
	today: CalendarDate;
	/** Putting money on the card by Pix, when there is an account it can come from. */
	onTopUp?: () => void;
}) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const mayTopUp = useWhatIMayDo(spaceId).mayCall("transactions.create");
	const state = useQuery({
		queryKey: ["benefit", accountId, today],
		enabled: Boolean(session),
		queryFn: () => session?.accounts.benefitLeft(accountId, today) ?? null,
	});

	return (
		<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
			<div className="min-w-0">
				<p className="truncate">{name}</p>
				{/* Nothing while the answer is on its way. The sentence about a missing allowance
				    was drawn while it was, so every owner saw it flash on a card that has one. */}
				{state.isPending ? null : (
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
				)}
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
			{/* The way money is put on a card that takes a top up. It was written as a transfer
			    on the form, which the application told people to do and then never read. */}
			{onTopUp && mayTopUp ? (
				<Button size="small" variant="secondary" onClick={onTopUp}>
					{t("move.topUp")}
				</Button>
			) : null}
		</div>
	);
}
