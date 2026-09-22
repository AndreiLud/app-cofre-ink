// The things that happen again: rent, the subscription, the salary.
//
// Writing one of these is a promise about days that have not arrived, so what it puts
// on the calendar is always planned and never counts as money that moved. Stopping a
// series takes those promises back and leaves everything that already happened.

import { nextOccurrence, parseMoney } from "@cofre/core";
import type { Recurrence, TransactionKind } from "@cofre/storage";
import {
	Button,
	Callout,
	Dialog,
	Field,
	Icon,
	Menu,
	MenuItem,
	MenuSeparator,
	Segmented,
	Select,
	Skeleton,
} from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCofre } from "../storage/CofreProvider.tsx";
import { Value } from "./Value.tsx";

export type RecurrencesSectionProps = {
	spaceId: string;
	today: string;
};

export function RecurrencesSection({ spaceId, today }: RecurrencesSectionProps) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();

	const [isOpen, setOpen] = useState(false);
	const [editing, setEditing] = useState<Recurrence | null>(null);
	const [kind, setKind] = useState<TransactionKind>("expense");
	const [description, setDescription] = useState("");
	const [amount, setAmount] = useState("");
	const [accountId, setAccountId] = useState("");
	const [categoryId, setCategoryId] = useState("");
	const [frequency, setFrequency] = useState<"weekly" | "monthly" | "yearly">("monthly");
	const [startsOn, setStartsOn] = useState(today);
	const [problem, setProblem] = useState<string | null>(null);

	const accounts = useQuery({
		queryKey: ["accounts", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.accounts.list(spaceId) ?? [],
	});

	const categories = useQuery({
		queryKey: ["categories", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.categories.list(spaceId) ?? [],
	});

	const series = useQuery({
		queryKey: ["recurrences", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.recurrences.list(spaceId) ?? [],
	});

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["recurrences"] });
		void queries.invalidateQueries({ queryKey: ["transactions"] });
		void queries.invalidateQueries({ queryKey: ["balances"] });
		void queries.invalidateQueries({ queryKey: ["advice"] });
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
			if (!session) throw new Error("no session");
			const parsed = parseMoney(amount, { currency: "BRL" });
			if (parsed.amount <= 0) throw new Error(t("transactions.amountMissing"));

			if (editing) {
				return session.recurrences.update(editing.id, {
					description,
					amount: parsed.amount,
					accountId,
					categoryId: categoryId === "" ? null : categoryId,
					frequency,
					startsOn,
				});
			}
			return session.recurrences.create({
				spaceId,
				description,
				kind,
				amount: parsed.amount,
				accountId,
				categoryId: categoryId === "" ? null : categoryId,
				frequency,
				startsOn,
			});
		},
		onSuccess: async () => {
			setOpen(false);
			setProblem(null);
			// Writing the series is only half of it: what it owes goes on the calendar
			// straight away, so the person sees what they just promised.
			await session?.recurrences.materialize({ spaceId });
			invalidate();
		},
		onError: complain,
	});

	const pause = useMutation({
		mutationFn: async (one: Recurrence) =>
			session?.recurrences.update(one.id, { paused: one.pausedAt === null }),
		onSuccess: async () => {
			await session?.recurrences.materialize({ spaceId });
			invalidate();
		},
		onError: complain,
	});

	const remove = useMutation({
		mutationFn: async (id: string) => session?.recurrences.remove(id),
		onSuccess: invalidate,
		onError: complain,
	});

	const usable = (accounts.data ?? []).filter((account) => account.archivedAt === null);
	const sorted = (categories.data ?? []).filter((category) =>
		kind === "income" ? category.kind === "income" : category.kind === "expense",
	);

	function open(one: Recurrence | null) {
		setEditing(one);
		setKind(one?.kind ?? "expense");
		setDescription(one?.description ?? "");
		setAmount(one ? String(one.amount / 100).replace(".", ",") : "");
		setAccountId(one?.accountId ?? usable[0]?.id ?? "");
		setCategoryId(one?.categoryId ?? "");
		setFrequency(one?.frequency ?? "monthly");
		setStartsOn(one?.startsOn ?? today);
		setProblem(null);
		setOpen(true);
	}

	function submit(event: FormEvent) {
		event.preventDefault();
		save.mutate();
	}

	const rows = series.data ?? [];
	const nameOfAccount = (id: string) =>
		accounts.data?.find((account) => account.id === id)?.name ?? "";

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-4">
				<p className="max-w-[60ch] text-sm text-graphite">{t("recurrences.explain")}</p>
				<Button size="small" variant="secondary" onClick={() => open(null)}>
					{t("recurrences.create")}
				</Button>
			</div>

			{problem ? <Callout tone="problem">{problem}</Callout> : null}

			{series.isPending ? <Skeleton lines={2} /> : null}

			{!series.isPending && rows.length === 0 ? (
				<p className="text-sm text-graphite">{t("recurrences.empty")}</p>
			) : null}

			<ul className="divide-y divide-rule">
				{rows.map((one) => {
					const next =
						one.pausedAt === null
							? nextOccurrence(
									{
										frequency: one.frequency,
										intervalCount: one.intervalCount,
										startsOn: one.startsOn,
										endsOn: one.endsOn,
										dayOfMonth: one.dayOfMonth,
										monthOfYear: one.monthOfYear,
									},
									today,
								)
							: null;

					return (
						<li key={one.id} className="flex items-baseline justify-between gap-4 py-2">
							<span className="flex min-w-0 flex-col">
								<span
									className={one.pausedAt === null ? "text-sm text-ink" : "text-sm text-graphite"}
								>
									{one.description}
								</span>
								<span className="text-xs text-graphite">
									{t(`recurrences.every.${one.frequency}`)}
									{", "}
									{nameOfAccount(one.accountId)}
									{one.pausedAt !== null
										? `, ${t("recurrences.paused")}`
										: next
											? `, ${t("recurrences.next", { day: `${next.slice(8)}/${next.slice(5, 7)}` })}`
											: `, ${t("recurrences.ended")}`}
								</span>
							</span>
							<span className="flex shrink-0 items-center gap-3">
								<Value
									amount={one.kind === "expense" ? -one.amount : one.amount}
									currency={one.currency}
									tone="auto"
								/>
								<Menu
									align="end"
									trigger={
										<Button size="small" variant="quiet" aria-label={t("recurrences.actions")}>
											<Icon name="settings" />
										</Button>
									}
								>
									<MenuItem onSelect={() => open(one)}>{t("recurrences.edit")}</MenuItem>
									<MenuItem onSelect={() => pause.mutate(one)}>
										{one.pausedAt === null ? t("recurrences.pause") : t("recurrences.resume")}
									</MenuItem>
									<MenuSeparator />
									<MenuItem onSelect={() => remove.mutate(one.id)}>{t("actions.delete")}</MenuItem>
								</Menu>
							</span>
						</li>
					);
				})}
			</ul>

			<Dialog
				open={isOpen}
				onOpenChange={setOpen}
				title={editing ? t("recurrences.edit") : t("recurrences.create")}
				description={t("recurrences.createDescription")}
				closeLabel={t("actions.cancel")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setOpen(false)}>
							{t("actions.cancel")}
						</Button>
						<Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
							{t("actions.save")}
						</Button>
					</>
				}
			>
				<form onSubmit={submit} className="space-y-4">
					{editing ? null : (
						<Segmented
							label={t("transactions.kind")}
							value={kind}
							onChange={(next) => {
								setKind(next);
								setCategoryId("");
							}}
							options={[
								{ value: "expense", label: t("transactionKind.expense") },
								{ value: "income", label: t("transactionKind.income") },
							]}
						/>
					)}

					<Field
						label={t("transactions.description")}
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						placeholder={t("recurrences.descriptionPlaceholder")}
						required={true}
					/>

					<div className="grid gap-4 md:grid-cols-2">
						<Field
							label={t("transactions.amount")}
							hint={t("fields.amountHint")}
							value={amount}
							onChange={(event) => setAmount(event.target.value)}
							numeric={true}
							inputMode="decimal"
							placeholder="0,00"
							required={true}
						/>
						<Field
							label={t("recurrences.startsOn")}
							hint={t("recurrences.startsOnHint")}
							type="date"
							value={startsOn}
							onChange={(event) => setStartsOn(event.target.value)}
							required={true}
						/>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<Select
							label={t("recurrences.frequency")}
							value={frequency}
							onChange={(event) =>
								setFrequency(event.target.value as "weekly" | "monthly" | "yearly")
							}
							options={[
								{ value: "weekly", label: t("recurrences.every.weekly") },
								{ value: "monthly", label: t("recurrences.every.monthly") },
								{ value: "yearly", label: t("recurrences.every.yearly") },
							]}
						/>
						<Select
							label={t("transactions.account")}
							value={accountId}
							onChange={(event) => setAccountId(event.target.value)}
							options={usable.map((account) => ({ value: account.id, label: account.name }))}
						/>
					</div>

					<Select
						label={t("transactions.category")}
						value={categoryId}
						onChange={(event) => setCategoryId(event.target.value)}
						options={[
							{ value: "", label: t("transactions.noCategory") },
							...sorted
								.filter((category) => category.parentId === null)
								.flatMap((parent) => [
									{ value: parent.id, label: parent.name },
									...sorted
										.filter((child) => child.parentId === parent.id)
										.map((child) => ({ value: child.id, label: `  ${child.name}` })),
								]),
						]}
					/>

					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</form>
			</Dialog>
		</div>
	);
}
