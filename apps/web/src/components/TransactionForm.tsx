// Writing down what happened.
//
// The three kinds are on screen at once rather than behind a menu, because choosing
// between them is the decision, not a detail of it. Everything else on the form
// changes with that choice: a transfer needs a destination, a card purchase can be
// split, and neither makes sense for the other.

import { parseMoney } from "@cofre/core";
import type { Account, Transaction, TransactionKind } from "@cofre/storage";
import { Button, Callout, Dialog, Field, Segmented, Select } from "@cofre/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCofre } from "../storage/CofreProvider.tsx";

export type TransactionFormProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	accounts: Account[];
	spaceId: string;
	/** Given when an existing record is being changed instead of written. */
	editing?: Transaction | null;
	/** The day the form opens on, which is today where the space lives. */
	today: string;
};

export function TransactionForm({
	open,
	onOpenChange,
	accounts,
	spaceId,
	editing,
	today,
}: TransactionFormProps) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();

	const [kind, setKind] = useState<TransactionKind>("expense");
	const [amount, setAmount] = useState("");
	const [happenedOn, setHappenedOn] = useState(today);
	const [description, setDescription] = useState("");
	const [accountId, setAccountId] = useState("");
	const [counterAccountId, setCounterAccountId] = useState("");
	const [installments, setInstallments] = useState("1");
	const [planned, setPlanned] = useState(false);
	const [notes, setNotes] = useState("");
	const [problem, setProblem] = useState<string | null>(null);

	const usable = accounts.filter((account) => account.archivedAt === null);
	const chosen = usable.find((account) => account.id === accountId);
	const canSplit = kind === "expense" && chosen?.kind === "credit";

	// Opening the form is what resets it, so a half typed record is never inherited.
	useEffect(() => {
		if (!open) return;
		setProblem(null);
		if (editing) {
			setKind(editing.kind);
			setAmount(String(Math.abs(editing.amount) / 100).replace(".", ","));
			setHappenedOn(editing.happenedOn);
			setDescription(editing.description);
			setAccountId(editing.accountId);
			setCounterAccountId(editing.counterAccountId ?? "");
			setPlanned(editing.status === "planned");
			setNotes(editing.notes ?? "");
			setInstallments("1");
			return;
		}
		setKind("expense");
		setAmount("");
		setHappenedOn(today);
		setDescription("");
		setAccountId(usable[0]?.id ?? "");
		setCounterAccountId("");
		setInstallments("1");
		setPlanned(false);
		setNotes("");
	}, [open, editing, today, usable[0]?.id]);

	const save = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");

			const parsed = parseMoney(amount, { currency: chosen?.currency ?? "BRL" });
			if (parsed.amount <= 0) {
				throw new Error(t("transactions.amountMissing"));
			}

			if (editing) {
				return session.transactions.update(editing.id, {
					amount: parsed.amount,
					happenedOn,
					description,
					accountId,
					counterAccountId: kind === "transfer" ? counterAccountId : null,
					status: planned ? "planned" : "settled",
					notes: notes.trim() === "" ? null : notes.trim(),
				});
			}

			return session.transactions.create({
				spaceId,
				kind,
				amount: parsed.amount,
				happenedOn,
				description,
				accountId,
				counterAccountId: kind === "transfer" ? counterAccountId : null,
				status: planned ? "planned" : "settled",
				notes: notes.trim() === "" ? null : notes.trim(),
				installments: canSplit ? Number(installments) : 1,
			});
		},
		onSuccess: () => {
			onOpenChange(false);
			void queries.invalidateQueries({ queryKey: ["transactions"] });
			void queries.invalidateQueries({ queryKey: ["balances"] });
		},
		onError: (error: unknown) => setProblem(error instanceof Error ? error.message : String(error)),
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		save.mutate();
	}

	const accountOptions = usable.map((account) => ({ value: account.id, label: account.name }));

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={editing ? t("transactions.edit") : t("transactions.create")}
			description={t("transactions.createDescription")}
			closeLabel={t("actions.cancel")}
			footer={
				<>
					<Button variant="quiet" onClick={() => onOpenChange(false)}>
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
						onChange={setKind}
						options={[
							{ value: "expense", label: t("transactionKind.expense") },
							{ value: "income", label: t("transactionKind.income") },
							{ value: "transfer", label: t("transactionKind.transfer") },
						]}
					/>
				)}

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
						label={t("transactions.day")}
						type="date"
						value={happenedOn}
						onChange={(event) => setHappenedOn(event.target.value)}
						required={true}
					/>
				</div>

				<Field
					label={t("transactions.description")}
					value={description}
					onChange={(event) => setDescription(event.target.value)}
					placeholder={t("transactions.descriptionPlaceholder")}
					required={true}
				/>

				<div className="grid gap-4 md:grid-cols-2">
					<Select
						label={kind === "transfer" ? t("transactions.from") : t("transactions.account")}
						value={accountId}
						onChange={(event) => setAccountId(event.target.value)}
						options={accountOptions}
					/>
					{kind === "transfer" ? (
						<Select
							label={t("transactions.to")}
							value={counterAccountId}
							onChange={(event) => setCounterAccountId(event.target.value)}
							options={[
								{ value: "", label: t("transactions.pickAccount") },
								...accountOptions.filter((option) => option.value !== accountId),
							]}
						/>
					) : null}
					{canSplit ? (
						<Select
							label={t("transactions.installments")}
							value={installments}
							onChange={(event) => setInstallments(event.target.value)}
							hint={t("transactions.installmentsHint")}
							options={Array.from({ length: 24 }, (_unused, index) => ({
								value: String(index + 1),
								label:
									index === 0
										? t("transactions.inFull")
										: t("transactions.timesOf", { count: index + 1 }),
							}))}
						/>
					) : null}
				</div>

				<label className="flex items-start gap-3 text-sm">
					<input
						type="checkbox"
						checked={planned}
						onChange={(event) => setPlanned(event.target.checked)}
						className="mt-1 size-4 accent-[var(--ink)]"
					/>
					<span>
						<span className="font-medium text-ink">{t("transactions.planned")}</span>
						<span className="block text-graphite">{t("transactions.plannedHint")}</span>
					</span>
				</label>

				<Field
					label={t("transactions.notes")}
					value={notes}
					onChange={(event) => setNotes(event.target.value)}
					placeholder={t("transactions.notesPlaceholder")}
				/>

				{problem ? <Callout tone="problem">{problem}</Callout> : null}
			</form>
		</Dialog>
	);
}
