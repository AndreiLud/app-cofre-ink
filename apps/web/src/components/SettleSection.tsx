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
	/**
	 * Whether this person may record a payment between two people.
	 *
	 * Everybody reads who owes whom, because a debt nobody can see is not a debt. Only
	 * the three roles the model lets write a settlement are offered the buttons: a Viewer
	 * and a Logger were shown them and refused afterwards, one of the two in silence.
	 */
	maySettle: boolean;
};

export function SettleSection({
	spaceId,
	people,
	currency,
	timezone,
	maySettle,
}: SettleSectionProps) {
	const { t } = useTranslation();
	const { session, user } = useCofre();
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

	/**
	 * What went wrong, in the language of the screen.
	 *
	 * A refusal from the permission model arrives as an English sentence meant for
	 * whoever wrote the code, and it used to go straight onto the screen.
	 */
	const complain = (error: unknown) => {
		if (error !== null && typeof error === "object" && "rule" in error) {
			const rule = String((error as { rule: unknown }).rule);
			setProblem(t(`rules.${rule}`, { defaultValue: t("rules.unknown") }));
			return;
		}
		setProblem(t("rules.notAllowedHere"));
	};

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
		onError: complain,
	});

	const forget = useMutation({
		mutationFn: async (id: string) => session?.sharing.forgetSettlement(id),
		onSuccess: () => {
			setProblem(null);
			void queries.invalidateQueries({ queryKey: ["sharing"] });
		},
		// It had none at all, so a refusal here happened in complete silence: the row
		// stayed, nothing was said, and the only way to know was to reload.
		onError: complain,
	});

	/** Whoever is holding the screen is "you", in the language the screen is speaking. */
	const nameOf = (userId: string) => {
		if (userId === user?.id) return t("members.you", { name: user?.name ?? "" });
		return people.find((person) => person.id === userId)?.name ?? t("members.someone");
	};

	/**
	 * Who pays whom, as a sentence rather than as a name dropped into a slot.
	 *
	 * "{{from}} pays {{to}}" with "You" in the first slot comes out as "You pays João",
	 * because English conjugates and a template cannot. Portuguese does not care, and
	 * gets its own key anyway so the two files stay the same shape.
	 */
	const saying = (from: string, to: string) =>
		from === user?.id
			? t("sharing.paymentFromYou", { to: nameOf(to) })
			: t("sharing.payment", { from: nameOf(from), to: nameOf(to) });

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
									{saying(payment.fromUserId, payment.toUserId)}{" "}
									<Value amount={payment.amount} currency={currency} tone="neutral" />
								</span>
								{maySettle ? (
									<Button
										size="small"
										variant="secondary"
										onClick={() => settle.mutate(payment)}
										disabled={settle.isPending}
									>
										{t("sharing.markPaid")}
									</Button>
								) : null}
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
									{saying(one.fromUserId, one.toUserId)}{" "}
									<Value amount={one.amount} currency={one.currency} tone="neutral" />
								</span>
								{maySettle ? (
									<Button size="small" variant="quiet" onClick={() => forget.mutate(one.id)}>
										{t("sharing.undoPayment")}
									</Button>
								) : null}
							</li>
						))}
					</ul>
				</div>
			) : null}
		</Panel>
	);
}
