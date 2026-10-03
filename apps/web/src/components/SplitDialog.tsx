// Dividing one expense between the people of the space.
//
// Three ways to divide, and the parts are shown before anything is written, because
// the whole point is agreeing on a number. Whoever paid is named out loud: in a shared
// space the person who writes a record down is often not the person whose money it was.

import type { Transaction, User } from "@cofre/storage";
import { Button, Callout, Dialog, Field, Segmented, Select } from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { readShare } from "../lib/amounts.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { Value } from "./Value.tsx";

export type SplitDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	record: Transaction | null;
	people: User[];
};

type Method = "evenly" | "shares" | "income";

export function SplitDialog({ open, onOpenChange, record, people }: SplitDialogProps) {
	const { t } = useTranslation();
	const { session, user, currentSpace } = useCofre();
	const queries = useQueryClient();

	const [method, setMethod] = useState<Method>("evenly");
	const [paidBy, setPaidBy] = useState("");
	const [weights, setWeights] = useState<Record<string, string>>({});
	const [problem, setProblem] = useState<string | null>(null);

	const existing = useQuery({
		queryKey: ["splits", record?.id],
		enabled: Boolean(session && record && open),
		queryFn: () => session?.sharing.splitsOf(record?.id ?? "") ?? [],
	});

	useEffect(() => {
		if (!open) return;
		setProblem(null);
		setMethod("evenly");
		setPaidBy(record?.paidBy ?? record?.createdBy ?? user?.id ?? "");
		setWeights(Object.fromEntries(people.map((person) => [person.id, "1"])));
	}, [open, record, people, user]);

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["splits"] });
		void queries.invalidateQueries({ queryKey: ["sharing"] });
		void queries.invalidateQueries({ queryKey: ["transactions"] });
	};

	const complain = (error: unknown) => setProblem(sayWhy(error, t));

	const save = useMutation({
		mutationFn: async () => {
			if (!session || !record) return [];
			return session.sharing.split({
				transactionId: record.id,
				method,
				userIds: people.map((person) => person.id),
				// Each share by the person it was typed for, and only for the one method that
				// reads them. A list in the order this screen reads people in was a list the
				// space read in another order.
				//
				// The fields that fill these in are only drawn for the shares method, and the
				// weights are reset to one each on every open, so dividing evenly or by income
				// shipped a full map of weights that nobody had seen and nobody had meant. It
				// changed nothing today, because the division ignores them, and it is a map of
				// numbers somebody did not choose travelling with every split.
				shares:
					method === "shares"
						? Object.fromEntries(
								people.map((person) => [person.id, readShare(weights[person.id] ?? "1")]),
							)
						: undefined,
				paidBy,
			});
		},
		onSuccess: () => {
			onOpenChange(false);
			invalidate();
		},
		onError: complain,
	});

	const clear = useMutation({
		mutationFn: async () => session?.sharing.clearSplit(record?.id ?? ""),
		onSuccess: () => {
			onOpenChange(false);
			invalidate();
		},
		onError: complain,
	});

	/**
	 * Whoever is holding the screen is "you", in the language the screen is speaking.
	 *
	 * The name stored for somebody who started in browser mode is the word "Você" or
	 * "You", written once when the profile was made, so a person who started in
	 * Portuguese saw "Você" sitting in the middle of the English interface.
	 */
	const nameOf = (userId: string) => {
		if (userId === user?.id) return t("members.you");
		return people.find((person) => person.id === userId)?.name ?? t("members.someone");
	};

	const parts = existing.data ?? [];

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("sharing.splitTitle")}
			description={t("sharing.splitDescription", { description: record?.description ?? "" })}
			closeLabel={t("actions.close")}
			footer={
				<>
					{parts.length > 0 ? (
						<Button variant="quiet" onClick={() => clear.mutate()}>
							{t("sharing.clearSplit")}
						</Button>
					) : null}
					<Button variant="quiet" onClick={() => onOpenChange(false)}>
						{t("actions.cancel")}
					</Button>
					<Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
						{t("actions.save")}
					</Button>
				</>
			}
		>
			<div className="space-y-4">
				{/* A part of a plan is divided with the whole plan, and the screen says so before
				    anything is written: the other parts change too. */}
				{record?.installmentCount && record.installmentCount > 1 ? (
					<p className="text-sm text-quiet">
						{t("sharing.wholePlan", {
							number: record.installmentNumber ?? 1,
							parts: record.installmentCount,
						})}
					</p>
				) : null}
				<Segmented
					label={t("sharing.method")}
					value={method}
					onChange={setMethod}
					options={[
						{ value: "evenly", label: t("sharing.evenly") },
						{ value: "shares", label: t("sharing.shares") },
						{ value: "income", label: t("sharing.income") },
					]}
				/>

				<Select
					label={t("sharing.paidBy")}
					hint={t("sharing.paidByHint")}
					value={paidBy}
					onChange={(event) => setPaidBy(event.target.value)}
					options={people.map((person) => ({ value: person.id, label: nameOf(person.id) }))}
				/>

				{method === "shares" ? (
					<div className="space-y-3">
						<p className="text-sm text-quiet">{t("sharing.sharesHint")}</p>
						{people.map((person) => (
							<Field
								key={person.id}
								label={nameOf(person.id)}
								value={weights[person.id] ?? "1"}
								onChange={(event) => setWeights({ ...weights, [person.id]: event.target.value })}
								numeric={true}
								inputMode="numeric"
							/>
						))}
					</div>
				) : null}

				{method === "income" ? (
					<p className="text-sm text-quiet">{t("sharing.incomeHint")}</p>
				) : null}

				{parts.length > 0 ? (
					<div className="space-y-1 border-t border-line pt-3">
						<p className="text-sm font-medium text-ink">{t("sharing.currently")}</p>
						<ul className="space-y-1">
							{parts.map((part) => (
								<li key={part.id} className="flex justify-between text-sm text-quiet">
									<span>{nameOf(part.userId)}</span>
									{/* In the currency of the space. A share is divided out of what the
									    record was worth in it, and the balances between people are
									    read in it too, so labelling a share with the currency
									    somebody typed said the wrong word over the right number. */}
									<Value
										amount={part.amount}
										currency={currentSpace?.baseCurrency ?? "BRL"}
										tone="neutral"
									/>
								</li>
							))}
						</ul>
					</div>
				) : null}

				{problem ? <Callout tone="problem">{problem}</Callout> : null}
			</div>
		</Dialog>
	);
}
