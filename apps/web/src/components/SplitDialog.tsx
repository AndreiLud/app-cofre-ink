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
	const { session, user } = useCofre();
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

	const complain = (error: unknown) => {
		const rule =
			error !== null && typeof error === "object" && "rule" in error
				? String((error as { rule: unknown }).rule)
				: null;
		setProblem(
			rule === null
				? error instanceof Error
					? error.message
					: String(error)
				: t(`rules.${rule}`, { defaultValue: t("rules.unknown") }),
		);
	};

	const save = useMutation({
		mutationFn: async () => {
			if (!session || !record) return [];
			return session.sharing.split({
				transactionId: record.id,
				method,
				userIds: people.map((person) => person.id),
				weights: people.map((person) => Number(weights[person.id] ?? "1")),
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

	const nameOf = (userId: string) =>
		people.find((person) => person.id === userId)?.name ?? t("members.someone");

	const parts = existing.data ?? [];

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("sharing.splitTitle")}
			description={t("sharing.splitDescription", { description: record?.description ?? "" })}
			closeLabel={t("actions.cancel")}
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
					options={people.map((person) => ({ value: person.id, label: person.name }))}
				/>

				{method === "shares" ? (
					<div className="space-y-3">
						<p className="text-sm text-quiet">{t("sharing.sharesHint")}</p>
						{people.map((person) => (
							<Field
								key={person.id}
								label={person.name}
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
									<Value amount={part.amount} currency={record?.currency ?? "BRL"} tone="neutral" />
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
