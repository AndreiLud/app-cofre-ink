// What the person sees first, answering two of the four questions it exists for: how
// much there is, and what falls due in the next days.

import { addDays, monthOf, noticesFor, todayIn } from "@cofre/core";
import { Button, EmptyState, InsightTitle, Panel, Segmented, Skeleton } from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Findings } from "../components/Findings.tsx";
import { Value } from "../components/Value.tsx";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

/** Lines about the months behind, here. The rest of them have a screen of their own. */
const SHOWN = 4;

export function DashboardPage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace, spaces } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");

	// One life, more than one space. The consolidated view adds them together, and it
	// only exists when there is more than one to add.
	const [across, setAcross] = useState<"space" | "everything">("space");
	const consolidated = across === "everything" && spaces.length > 1;

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
		queryKey: ["balances", "everywhere", spaces.map((space) => space.id).join(",")],
		enabled: Boolean(session) && consolidated,
		queryFn: async () => {
			if (!session) return [];
			const lists = await Promise.all(
				spaces.map((space) => session.transactions.balances(space.id)),
			);
			return lists.flat();
		},
	});

	const balances = useQuery({
		queryKey: ["balances", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.transactions.balances(spaceId) ?? [],
	});

	const upcoming = useQuery({
		queryKey: ["transactions", spaceId, "upcoming", today],
		enabled: Boolean(session && currentSpace),
		queryFn: () =>
			session?.transactions.list({
				spaceId,
				status: "planned",
				from: today,
				to: addDays(today, 15),
				limit: 20,
			}) ?? [],
	});

	// What needs attention is worked out from what is already true, never stored, so it
	// cannot go stale and cannot pile up into a list nobody opens.
	const month = monthOf(today);

	const limits = useQuery({
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

	const categories = useQuery({
		queryKey: ["categories", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.categories.list(spaceId) ?? [],
	});

	// What the months behind have to say. It reads a fair amount, so it runs after the
	// balance rather than beside it, and a space with no history simply says nothing.
	const findings = useQuery({
		queryKey: ["advice", spaceId, today],
		enabled: Boolean(session && currentSpace) && balances.isSuccess,
		queryFn: () => session?.advice.findings({ spaceId, today }) ?? [],
	});

	const settle = useMutation({
		mutationFn: async (id: string) => session?.transactions.settle(id),
		onSuccess: () => {
			void queries.invalidateQueries({ queryKey: ["transactions"] });
			void queries.invalidateQueries({ queryKey: ["balances"] });
			void queries.invalidateQueries({ queryKey: ["advice"] });
		},
	});

	if (!currentSpace) return null;

	const shownAccounts = consolidated ? (everywhere.data ?? []) : (accounts.data ?? []);
	const shownBalances = consolidated ? (balancesEverywhere.data ?? []) : (balances.data ?? []);

	const open = shownAccounts.map((account) => account.id);
	const visible = shownBalances.filter((balance) => open.includes(balance.accountId));
	const settled = visible.reduce((sum, balance) => sum + balance.settled, 0);
	const projected = visible.reduce((sum, balance) => sum + balance.projected, 0);

	const nameOf = (accountId: string) =>
		shownAccounts.find((account) => account.id === accountId)?.name ?? "";

	// Oldest first here: what falls due soonest is what needs attention first.
	const falling = [...(upcoming.data ?? [])].sort((left, right) =>
		left.happenedOn < right.happenedOn ? -1 : 1,
	);

	const nameOfLimit = (limit: {
		scope: string;
		priority: string | null;
		categoryId: string | null;
	}) => {
		if (limit.scope === "total") return t("budget.everything");
		if (limit.scope === "priority") return t(`priority.${limit.priority ?? "important"}`);
		return categories.data?.find((category) => category.id === limit.categoryId)?.name ?? "";
	};

	const notices = noticesFor({
		today,
		budgets: (limits.data ?? []).map((limit) => ({
			name: nameOfLimit(limit),
			spent: limit.progress.spent,
			limit: limit.progress.limit,
			state: limit.progress.state,
		})),
		bills: falling.map((row) => ({
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
			currency: currentSpace.baseCurrency,
		}).format(Number(value) / 100);

	return (
		<div className="space-y-5">
			{/* The one number this screen exists for, on its own surface and at a size
			    nothing else on the page comes near. Everything under it is detail. */}
			<Panel className="border-accent/30 bg-gradient-to-b from-accentSoft/60 to-panel">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<InsightTitle
						level="h1"
						detail={
							projected === settled ? t("dashboard.nothingPending") : t("dashboard.projectedDetail")
						}
					>
						{consolidated
							? t("dashboard.headlineEverywhere")
							: t("dashboard.headline", { space: currentSpace.name })}
					</InsightTitle>

					{/* At the top, with the sentence it changes, because it says what the
					    number below is counting. */}
					{spaces.length > 1 ? (
						<div className="w-full max-w-60 sm:w-auto">
							<Segmented
								label={t("dashboard.across")}
								value={across}
								onChange={setAcross}
								options={[
									{ value: "space", label: t("reports.thisSpace") },
									{ value: "everything", label: t("reports.everySpace") },
								]}
							/>
						</div>
					) : null}
				</div>

				{balances.isPending ? (
					<Skeleton lines={2} className="mt-4" />
				) : (
					<p className="mt-4 font-mono text-4xl leading-none tabular-nums sm:text-[2.75rem]">
						<Value amount={settled} currency={currentSpace.baseCurrency} tone="auto" />
					</p>
				)}

				<div className="mt-3 space-y-1">
					{projected !== settled ? (
						<p className="text-sm text-quiet">
							{t("dashboard.afterPending")}{" "}
							<Value amount={projected} currency={currentSpace.baseCurrency} tone="auto" />
						</p>
					) : null}
					{spaces.length > 1 && !consolidated ? (
						<p className="text-xs text-quiet">{t("dashboard.oneSpaceOnly")}</p>
					) : null}
				</div>
			</Panel>

			{notices.length > 0 || found.length > 0 ? (
				<Panel
					title={t("dashboard.attention")}
					// It used to lengthen the list in place. What somebody wants after
					// reading three lines about their money is not four more lines: it is
					// the screen that says what shape the money is in and where the three
					// lines came from.
					action={
						<Link to={ROUTES.advisor}>
							<Button size="small" variant="quiet">
								{t("dashboard.seeMore")}
							</Button>
						</Link>
					}
				>
					{/* Today first, because a bill due today is not a pattern, it is today. */}
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

					<Findings findings={found} money={money} limit={SHOWN} />
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
				{upcoming.isPending ? <Skeleton lines={2} /> : null}

				{!upcoming.isPending && falling.length === 0 ? (
					<p className="text-sm text-quiet">{t("dashboard.nothingDue")}</p>
				) : null}

				<ul className="divide-y divide-line">
					{falling.map((row) => (
						<li key={row.id} className="flex items-baseline justify-between gap-4 py-2">
							<span className="flex min-w-0 items-baseline gap-3">
								<span className="font-mono text-xs text-quiet">
									{row.happenedOn.slice(8)}/{row.happenedOn.slice(5, 7)}
								</span>
								<span className="truncate text-sm text-ink">{row.description}</span>
								<span className="hidden text-xs text-quiet md:inline">{nameOf(row.accountId)}</span>
							</span>
							<span className="flex shrink-0 items-center gap-3">
								<Value amount={row.amount} currency={row.currency} tone="auto" />
								<Button size="small" variant="secondary" onClick={() => settle.mutate(row.id)}>
									{t("actions.markPaid")}
								</Button>
							</span>
						</li>
					))}
				</ul>
			</Panel>

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
				{accounts.isPending ? <Skeleton lines={3} /> : null}

				{!accounts.isPending && shownAccounts.length === 0 ? (
					<EmptyState
						icon="wallet"
						title={t("accounts.emptyTitle")}
						description={t("accounts.emptyBody")}
						action={
							<Link to={ROUTES.accounts}>
								<Button variant="primary">{t("accounts.create")}</Button>
							</Link>
						}
					/>
				) : null}

				<ul className="divide-y divide-line">
					{shownAccounts.map((account) => {
						const balance = visible.find((entry) => entry.accountId === account.id);
						return (
							<li key={account.id} className="flex items-baseline justify-between gap-4 py-2">
								<span>
									<span className="text-sm text-ink">{account.name}</span>
									{t(`accountKind.${account.kind}`) === account.name ? null : (
										<span className="ml-2 text-xs text-quiet">
											{t(`accountKind.${account.kind}`)}
										</span>
									)}
								</span>
								<Value
									amount={balance?.settled ?? account.initialBalance}
									currency={account.currency}
									tone="auto"
								/>
							</li>
						);
					})}
				</ul>
			</Panel>
		</div>
	);
}
