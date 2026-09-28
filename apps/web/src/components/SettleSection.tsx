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
import { sayWhy } from "../lib/sayWhy.ts";
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
	 * This one used to answer "your role does not allow that" to everything that was not
	 * a rule, so a dropped connection while marking a payment told somebody their role
	 * was the problem. On a server it was worse than a bad guess: a rule arrives there
	 * with its name in a different field, so the branch that would have caught it never
	 * ran and the wrong sentence was the only sentence.
	 */
	const complain = (error: unknown) => setProblem(sayWhy(error, t));

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
		if (userId === user?.id) return t("members.you");
		return people.find((person) => person.id === userId)?.name ?? t("members.someone");
	};

	/**
	 * Who pays whom, as a sentence rather than as a name dropped into a slot.
	 *
	 * "{{from}} pays {{to}}" with "You" in the first slot comes out as "You pays João",
	 * because English conjugates and a template cannot. Portuguese does not care, and
	 * gets its own key anyway so the two files stay the same shape.
	 */
	const saying = (from: string, to: string) => {
		// Both slots, and not only the first. "João pays You" is the same defect read from
		// the other end, and a capitalised pronoun in the middle of a sentence besides.
		const mine = to === user?.id;
		if (from === user?.id) return t("sharing.paymentFromYou", { to: nameOf(to) });
		if (mine) return t("sharing.paymentToYou", { from: nameOf(from) });
		return t("sharing.payment", { from: nameOf(from), to: nameOf(to) });
	};

	/**
	 * Who is up and who is down, as a sentence rather than as a name beside a verb.
	 *
	 * "You owes" and "You is owed" were the same defect as "You pays": English conjugates
	 * and a name dropped in front of a third person verb does not. The row of whoever is
	 * reading is the one row they are certain to read, and it is shown exactly when they
	 * are not square, because a person with nothing outstanding is left out of the list.
	 */
	const standing = (userId: string, amount: number) => {
		if (userId === user?.id) {
			return amount > 0 ? t("sharing.youAreOwed") : t("sharing.youOwe");
		}
		return amount > 0 ? t("sharing.isOwed") : t("sharing.owes");
	};

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
							{standing(balance.userId, balance.amount)}{" "}
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
