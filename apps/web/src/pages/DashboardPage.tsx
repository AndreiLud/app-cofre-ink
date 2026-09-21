// What the person sees first. Today it answers the first of the four questions, how
// much there is, because transactions arrive in phase 2 and the screen says so rather
// than pretending.

import { Button, EmptyState, InsightTitle, SectionTitle, Skeleton } from "@cofre/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Value } from "../components/Value.tsx";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

export function DashboardPage() {
	const { t } = useTranslation();
	const { session, currentSpace, spaces } = useCofre();

	const accounts = useQuery({
		queryKey: ["accounts", currentSpace?.id],
		enabled: Boolean(session && currentSpace),
		queryFn: () => session?.accounts.list(currentSpace?.id ?? "") ?? [],
	});

	const everywhere = useQuery({
		queryKey: ["accountsEverywhere"],
		enabled: Boolean(session) && spaces.length > 1,
		queryFn: () => session?.accounts.listEverywhere() ?? [],
	});

	if (!currentSpace) return null;

	const total = (accounts.data ?? []).reduce((sum, account) => sum + account.initialBalance, 0);
	const consolidated = (everywhere.data ?? []).reduce(
		(sum, account) => sum + account.initialBalance,
		0,
	);

	return (
		<div className="space-y-10">
			<section className="space-y-3">
				<InsightTitle detail={t("dashboard.openingOnly")}>
					{t("dashboard.headline", { space: currentSpace.name })}
				</InsightTitle>
				{accounts.isPending ? (
					<Skeleton lines={2} />
				) : (
					<p className="font-mono text-3xl tabular-nums">
						<Value amount={total} currency={currentSpace.baseCurrency} tone="auto" />
					</p>
				)}
				{spaces.length > 1 && everywhere.data ? (
					<p className="text-sm text-graphite">
						{t("dashboard.consolidated")}{" "}
						<Value amount={consolidated} currency={currentSpace.baseCurrency} />
					</p>
				) : null}
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
					{(accounts.data ?? []).map((account) => (
						<li key={account.id} className="flex items-baseline justify-between gap-4 py-2">
							<span>
								<span className="text-sm text-ink">{account.name}</span>
								{/* The kind is only worth saying when it adds to the name. */}
								{t(`accountKind.${account.kind}`) === account.name ? null : (
									<span className="ml-2 text-xs text-graphite">
										{t(`accountKind.${account.kind}`)}
									</span>
								)}
							</span>
							<Value amount={account.initialBalance} currency={account.currency} tone="auto" />
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
