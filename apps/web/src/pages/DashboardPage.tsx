// What the person sees first, answering two of the four questions it exists for: how
// much there is, and what falls due in the next days.

import { addDays, monthOf, noticesFor, todayIn } from "@cofre/core";
import { Button, EmptyState, InsightTitle, SectionTitle, Segmented, Skeleton } from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Findings } from "../components/Findings.tsx";
import { Value } from "../components/Value.tsx";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

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

	// Four lines is what somebody reads. The rest is one click away and stays open.
	const [all, setAll] = useState(false);

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
	const shown = all ? found.length : 4;

	const money = (value: unknown) =>
		new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
			style: "currency",
			currency: currentSpace.baseCurrency,
		}).format(Number(value) / 100);

	return (
		<div className="space-y-10">
			<section className="space-y-3">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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

					{spaces.length > 1 ? (
						<Segmented
							className="sm:w-auto"
							label={t("dashboard.across")}
							value={across}
							onChange={setAcross}
							options={[
								{ value: "space", label: t("reports.thisSpace") },
								{ value: "everything", label: t("reports.everySpace") },
							]}
						/>
					) : null}
				</div>

				{balances.isPending ? (
					<Skeleton lines={2} />
				) : (
					<p className="font-mono text-3xl tabular-nums">
						<Value amount={settled} currency={currentSpace.baseCurrency} tone="auto" />
					</p>
				)}

				{projected !== settled ? (
					<p className="text-sm text-graphite">
						{t("dashboard.afterPending")}{" "}
						<Value amount={projected} currency={currentSpace.baseCurrency} tone="auto" />
					</p>
				) : null}

				{spaces.length > 1 && !consolidated ? (
					<p className="text-xs text-graphite">{t("dashboard.oneSpaceOnly")}</p>
				) : null}
			</section>

			{notices.length > 0 || found.length > 0 ? (
				<section className="space-y-3">
					<SectionTitle
						action={
							found.length > shown ? (
								<button
									type="button"
									className="text-sm text-graphite hover:text-ink"
									onClick={() => setAll(true)}
								>
									{t("dashboard.seeEverything", { count: found.length - shown })}
								</button>
							) : null
						}
					>
						{t("dashboard.attention")}
					</SectionTitle>

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
											: "border-rule text-graphite"
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

					<Findings findings={found} money={money} limit={shown} />
				</section>
			) : null}

			<section className="space-y-4">
				<SectionTitle
					action={
						<Link to={ROUTES.transactions} className="text-sm text-graphite hover:text-ink">
							{t("dashboard.seeTransactions")}
						</Link>
					}
				>
					{t("dashboard.dueSoon")}
				</SectionTitle>

				{upcoming.isPending ? <Skeleton lines={2} /> : null}

				{!upcoming.isPending && falling.length === 0 ? (
					<p className="text-sm text-graphite">{t("dashboard.nothingDue")}</p>
				) : null}

				<ul className="divide-y divide-rule">
					{falling.map((row) => (
						<li key={row.id} className="flex items-baseline justify-between gap-4 py-2">
							<span className="flex min-w-0 items-baseline gap-3">
								<span className="font-mono text-xs text-graphite">
									{row.happenedOn.slice(8)}/{row.happenedOn.slice(5, 7)}
								</span>
								<span className="truncate text-sm text-ink">{row.description}</span>
								<span className="hidden text-xs text-graphite md:inline">
									{nameOf(row.accountId)}
								</span>
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
			</section>

			<section className="space-y-4">
				<SectionTitle
					action={
						<Link to={ROUTES.accounts} className="text-sm text-graphite hover:text-ink">
							{t("dashboard.seeAccounts")}
						</Link>
					}
				>
					{t("dashboard.whereItIs")}
				</SectionTitle>

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

				<ul className="divide-y divide-rule">
					{shownAccounts.map((account) => {
						const balance = visible.find((entry) => entry.accountId === account.id);
						return (
							<li key={account.id} className="flex items-baseline justify-between gap-4 py-2">
								<span>
									<span className="text-sm text-ink">{account.name}</span>
									{t(`accountKind.${account.kind}`) === account.name ? null : (
										<span className="ml-2 text-xs text-graphite">
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
			</section>
		</div>
	);
}
