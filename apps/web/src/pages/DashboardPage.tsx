// What the person sees first, answering two of the four questions it exists for: how
// much there is, and what falls due in the next days.

import { addDays, todayIn } from "@cofre/core";
import { Button, EmptyState, InsightTitle, SectionTitle, Skeleton } from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Value } from "../components/Value.tsx";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

export function DashboardPage() {
	const { t } = useTranslation();
	const { session, currentSpace, spaces } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");

	const accounts = useQuery({
		queryKey: ["accounts", spaceId],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.accounts.list(spaceId) ?? [],
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

	const settle = useMutation({
		mutationFn: async (id: string) => session?.transactions.settle(id),
		onSuccess: () => {
			void queries.invalidateQueries({ queryKey: ["transactions"] });
			void queries.invalidateQueries({ queryKey: ["balances"] });
		},
	});

	if (!currentSpace) return null;

	const open = (accounts.data ?? []).map((account) => account.id);
	const visible = (balances.data ?? []).filter((balance) => open.includes(balance.accountId));
	const settled = visible.reduce((sum, balance) => sum + balance.settled, 0);
	const projected = visible.reduce((sum, balance) => sum + balance.projected, 0);

	const nameOf = (accountId: string) =>
		accounts.data?.find((account) => account.id === accountId)?.name ?? "";

	// Oldest first here: what falls due soonest is what needs attention first.
	const falling = [...(upcoming.data ?? [])].sort((left, right) =>
		left.happenedOn < right.happenedOn ? -1 : 1,
	);

	return (
		<div className="space-y-10">
			<section className="space-y-3">
				<InsightTitle
					level="h1"
					detail={
						projected === settled ? t("dashboard.nothingPending") : t("dashboard.projectedDetail")
					}
				>
					{t("dashboard.headline", { space: currentSpace.name })}
				</InsightTitle>

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

				{spaces.length > 1 ? (
					<p className="text-xs text-graphite">{t("dashboard.oneSpaceOnly")}</p>
				) : null}
			</section>

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

				{!accounts.isPending && (accounts.data ?? []).length === 0 ? (
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
					{(accounts.data ?? []).map((account) => {
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
