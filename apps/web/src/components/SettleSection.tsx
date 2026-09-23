// Who owes whom, and the shortest way to end it.
//
// This sits with the members of the space, because it is about people and not about
// money in an account. Paying somebody back does not change what the house spent, so it
// never shows up in the list of records or in any report about spending.

import { todayIn } from "@cofre/core";
import type { User } from "@cofre/storage";
import { Button, Callout, Panel, Skeleton } from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCofre } from "../storage/CofreProvider.tsx";
import { Value } from "./Value.tsx";

export type SettleSectionProps = {
	spaceId: string;
	people: User[];
	currency: string;
	timezone: string;
};

export function SettleSection({ spaceId, people, currency, timezone }: SettleSectionProps) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();
	const [problem, setProblem] = useState<string | null>(null);

	const balances = useQuery({
		queryKey: ["sharing", spaceId, "balances"],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.sharing.balances(spaceId) ?? [],
	});

	const suggested = useQuery({
		queryKey: ["sharing", spaceId, "suggested"],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.sharing.suggestSettlements(spaceId) ?? [],
	});

	const history = useQuery({
		queryKey: ["sharing", spaceId, "settlements"],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.sharing.settlements(spaceId) ?? [],
	});

	const settle = useMutation({
		mutationFn: async (payment: { fromUserId: string; toUserId: string; amount: number }) =>
			session?.sharing.settle({
				spaceId,
				...payment,
				happenedOn: todayIn(timezone),
			}),
		onSuccess: () => {
			setProblem(null);
			void queries.invalidateQueries({ queryKey: ["sharing"] });
		},
		onError: (error: unknown) => setProblem(error instanceof Error ? error.message : String(error)),
	});

	const forget = useMutation({
		mutationFn: async (id: string) => session?.sharing.forgetSettlement(id),
		onSuccess: () => void queries.invalidateQueries({ queryKey: ["sharing"] }),
	});

	const nameOf = (userId: string) =>
		people.find((person) => person.id === userId)?.name ?? t("members.someone");

	const rows = balances.data ?? [];
	const payments = suggested.data ?? [];
	const past = history.data ?? [];

	return (
		<Panel title={t("sharing.title")}>
			<p className="max-w-[60ch] text-sm text-quiet">{t("sharing.explain")}</p>

			{problem ? <Callout tone="problem">{problem}</Callout> : null}

			{balances.isPending ? <Skeleton lines={2} /> : null}

			{!balances.isPending && rows.length === 0 ? (
				<p className="text-sm text-quiet">{t("sharing.even")}</p>
			) : null}

			<ul className="divide-y divide-line">
				{rows.map((balance) => (
					<li
						key={balance.userId}
						className="flex items-baseline justify-between gap-4 py-2 text-sm"
					>
						<span className="text-ink">{nameOf(balance.userId)}</span>
						<span className="text-quiet">
							{balance.amount > 0 ? t("sharing.isOwed") : t("sharing.owes")}{" "}
							<Value amount={Math.abs(balance.amount)} currency={currency} tone="neutral" />
						</span>
					</li>
				))}
			</ul>

			{payments.length > 0 ? (
				<div className="space-y-2 border-t border-ink pt-3">
					<p className="text-sm font-medium text-ink">{t("sharing.toEndIt")}</p>
					<ul className="space-y-2">
						{payments.map((payment) => (
							<li
								key={`${payment.fromUserId}${payment.toUserId}`}
								className="flex flex-wrap items-center justify-between gap-3 text-sm"
							>
								<span className="text-quiet">
									{t("sharing.payment", {
										from: nameOf(payment.fromUserId),
										to: nameOf(payment.toUserId),
									})}{" "}
									<Value amount={payment.amount} currency={currency} tone="neutral" />
								</span>
								<Button
									size="small"
									variant="secondary"
									onClick={() => settle.mutate(payment)}
									disabled={settle.isPending}
								>
									{t("sharing.markPaid")}
								</Button>
							</li>
						))}
					</ul>
				</div>
			) : null}

			{past.length > 0 ? (
				<div className="space-y-1 border-t border-line pt-3">
					<p className="text-sm font-medium text-ink">{t("sharing.already")}</p>
					<ul className="divide-y divide-line">
						{past.map((one) => (
							<li key={one.id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
								<span className="text-quiet">
									<span className="font-mono text-xs">
										{one.happenedOn.slice(8)}/{one.happenedOn.slice(5, 7)}
									</span>{" "}
									{t("sharing.payment", {
										from: nameOf(one.fromUserId),
										to: nameOf(one.toUserId),
									})}{" "}
									<Value amount={one.amount} currency={one.currency} tone="neutral" />
								</span>
								<Button size="small" variant="quiet" onClick={() => forget.mutate(one.id)}>
									{t("sharing.undoPayment")}
								</Button>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</Panel>
	);
}
