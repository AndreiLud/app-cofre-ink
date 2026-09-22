// Correcting one card, and letting it go.
//
// It does not add one. A card is added where an account is added, in "Nova conta",
// because a card is one of the things that screen can add and a second door onto the
// same form is a second door to keep in step. This is what the menu of an account opens
// for a card that already reaches it.
//
// The kind is not here either. A card that became another kind would leave every record
// it already wrote pointing at an invoice it no longer charges, so the honest move is to
// let it go and add the card that actually exists.

import type { Account, Card, CardKind } from "@cofre/storage";
import { Button, Callout, Dialog, Field, Select } from "@cofre/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCofre } from "../storage/CofreProvider.tsx";

export type CardDialogProps = {
	/** The card being looked after, or nothing when the dialog is closed. */
	card: Card | null;
	accounts: Account[];
	onClose: () => void;
};

/** Which of the two accounts each kind has. The repository decides for real. */
const NEEDS: Record<CardKind, { credit: boolean; debit: boolean }> = {
	credit: { credit: true, debit: false },
	debit: { credit: false, debit: true },
	multiple: { credit: true, debit: true },
	benefit: { credit: false, debit: true },
	prepaid: { credit: false, debit: true },
};

export function CardDialog({ card, accounts, onClose }: CardDialogProps) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();

	const [name, setName] = useState("");
	const [lastFour, setLastFour] = useState("");
	const [creditAccountId, setCreditAccountId] = useState("");
	const [debitAccountId, setDebitAccountId] = useState("");
	const [problem, setProblem] = useState<string | null>(null);

	const open = accounts.filter((account) => account.archivedAt === null);
	const invoices = open.filter((account) => account.kind === "credit");
	const balances = open.filter((account) => account.kind !== "credit");
	const needs = card === null ? NEEDS.credit : NEEDS[card.kind];

	// Opening is what fills the form, so a half typed correction is never inherited.
	useEffect(() => {
		if (!card) return;
		setProblem(null);
		setName(card.name);
		setLastFour(card.lastFour ?? "");
		setCreditAccountId(card.creditAccountId ?? "");
		setDebitAccountId(card.debitAccountId ?? "");
	}, [card]);

	function complain(error: unknown) {
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
	}

	const save = useMutation({
		mutationFn: async () => {
			if (!session || !card) throw new Error("nothing to save");
			return session.cards.update(card.id, {
				name,
				lastFour: lastFour.trim() === "" ? null : lastFour.trim(),
				creditAccountId: needs.credit ? creditAccountId : null,
				debitAccountId: needs.debit ? debitAccountId : null,
			});
		},
		onSuccess: () => {
			void queries.invalidateQueries({ queryKey: ["cards"] });
			void queries.invalidateQueries({ queryKey: ["transactions"] });
			onClose();
		},
		onError: complain,
	});

	/**
	 * Removing one takes the card and nothing else: the records it was on keep their
	 * account, their amount and the invoice they were charged to.
	 */
	const change = useMutation({
		mutationFn: async (what: "archive" | "remove") => {
			if (!session || !card) throw new Error("nothing to change");
			if (what === "remove") return session.cards.remove(card.id);
			return card.archivedAt === null
				? session.cards.archive(card.id)
				: session.cards.unarchive(card.id);
		},
		onSuccess: () => {
			void queries.invalidateQueries({ queryKey: ["cards"] });
			void queries.invalidateQueries({ queryKey: ["transactions"] });
			onClose();
		},
		onError: complain,
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		save.mutate();
	}

	return (
		<Dialog
			open={card !== null}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
			title={t("cards.edit")}
			description={t("cards.editDescription")}
			closeLabel={t("actions.cancel")}
			footer={
				<>
					<Button variant="quiet" onClick={onClose}>
						{t("actions.cancel")}
					</Button>
					<Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
						{t("actions.save")}
					</Button>
				</>
			}
		>
			<form onSubmit={submit} className="space-y-4">
				<p className="text-sm text-quiet">
					{t("cards.kindIs", { kind: t(`cardKind.${card?.kind ?? "credit"}`) })}
				</p>

				<Field
					label={t("cards.name")}
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder={t("cards.namePlaceholder")}
					required={true}
				/>

				{needs.credit && invoices.length > 0 ? (
					<Select
						label={t("cards.creditAccount")}
						hint={t("cards.creditAccountHint")}
						value={creditAccountId}
						onChange={(event) => setCreditAccountId(event.target.value)}
						options={invoices.map((account) => ({ value: account.id, label: account.name }))}
					/>
				) : null}
				{needs.debit && balances.length > 0 ? (
					<Select
						label={t("cards.debitAccount")}
						hint={t("cards.debitAccountHint")}
						value={debitAccountId}
						onChange={(event) => setDebitAccountId(event.target.value)}
						options={balances.map((account) => ({ value: account.id, label: account.name }))}
					/>
				) : null}

				<Field
					label={t("cards.lastFour")}
					hint={t("cards.lastFourHint")}
					value={lastFour}
					onChange={(event) => setLastFour(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
					inputMode="numeric"
					placeholder="1234"
				/>

				{problem ? <Callout tone="problem">{problem}</Callout> : null}

				<div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
					<Button
						variant="secondary"
						size="small"
						disabled={change.isPending}
						onClick={() => change.mutate("archive")}
					>
						{card?.archivedAt === null ? t("cards.archive") : t("cards.unarchive")}
					</Button>
					<Button
						variant="destructive"
						size="small"
						disabled={change.isPending}
						onClick={() => change.mutate("remove")}
					>
						{t("cards.removeAction")}
					</Button>
					<span className="text-xs text-quiet">{t("cards.removeKeeps")}</span>
				</div>
			</form>
		</Dialog>
	);
}
