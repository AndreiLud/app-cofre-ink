// Adding or correcting one card, always starting from the account it reaches.
//
// A card used to be added from a list of cards, which put two ways of saying the same
// thing on one screen: an account of the credit card kind, and a card. Starting from the
// account removes the choice and answers the only hard question by itself, which is
// which account the new card spends from.
//
// The kind offered is narrowed to what that account can actually be part of. A credit
// account carries a credit card or a multiple one, a voucher carries a benefit card, and
// a balance carries the rest. The repository still refuses anything else; this only
// stops the combination from being offered.

import type { Account, Card, CardKind } from "@cofre/storage";
import { Button, Callout, Dialog, Field, Select } from "@cofre/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCofre } from "../storage/CofreProvider.tsx";

/** Adding a card to an account, or correcting one that exists. */
export type CardTarget = { mode: "add"; account: Account } | { mode: "edit"; card: Card } | null;

export type CardDialogProps = {
	target: CardTarget;
	spaceId: string;
	accounts: Account[];
	onClose: () => void;
};

/** Which of the two accounts each kind asks for. The repository decides for real. */
const NEEDS: Record<CardKind, { credit: boolean; debit: boolean }> = {
	credit: { credit: true, debit: false },
	debit: { credit: false, debit: true },
	multiple: { credit: true, debit: true },
	benefit: { credit: false, debit: true },
	prepaid: { credit: false, debit: true },
};

/** The side of a card that this account can be: the invoice, or the balance. */
function sideOf(account: Account): "credit" | "debit" {
	return account.kind === "credit" ? "credit" : "debit";
}

function kindsFor(account: Account): CardKind[] {
	if (account.kind === "credit") return ["credit", "multiple"];
	// A benefit is money somebody else put there, and it never comes with a credit line.
	if (account.kind === "voucher") return ["benefit"];
	return ["debit", "multiple", "prepaid"];
}

/**
 * A card spends a current account far more often than it spends the cash in a pocket,
 * and the list is alphabetical, so the first one is not the likely one. A benefit card
 * is the other way round: it spends the voucher it belongs to.
 */
function likelyBalance(balances: readonly Account[], of: CardKind): Account | undefined {
	const wanted = of === "benefit" ? "voucher" : "checking";
	return balances.find((account) => account.kind === wanted) ?? balances[0];
}

/**
 * The two sides a kind needs, with the account this was opened from pinned to the side
 * it can be. Written outside the component because the effect that fills the form uses
 * it, and a function rebuilt on every render would make that effect run on every render.
 */
function sidesFor(
	next: CardKind,
	anchor: Account | null,
	open: readonly Account[],
): { credit: string; debit: string } {
	const wants = NEEDS[next];
	const invoices = open.filter((account) => account.kind === "credit");
	const balances = open.filter((account) => account.kind !== "credit");
	const holds = anchor !== null && sideOf(anchor) === "credit" ? anchor : null;
	const spends = anchor !== null && sideOf(anchor) === "debit" ? anchor : null;
	return {
		credit: wants.credit ? (holds?.id ?? invoices[0]?.id ?? "") : "",
		debit: wants.debit ? (spends?.id ?? likelyBalance(balances, next)?.id ?? "") : "",
	};
}

export function CardDialog({ target, spaceId, accounts, onClose }: CardDialogProps) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();

	const [kind, setKind] = useState<CardKind>("credit");
	const [name, setName] = useState("");
	const [lastFour, setLastFour] = useState("");
	const [creditAccountId, setCreditAccountId] = useState("");
	const [debitAccountId, setDebitAccountId] = useState("");
	const [problem, setProblem] = useState<string | null>(null);

	const open = accounts.filter((account) => account.archivedAt === null);
	const invoices = open.filter((account) => account.kind === "credit");
	const balances = open.filter((account) => account.kind !== "credit");

	const anchor = target?.mode === "add" ? target.account : null;
	const offered = anchor ? kindsFor(anchor) : [kind];
	const needs = NEEDS[kind];

	// Opening is what fills the form, so a half typed card is never inherited.
	useEffect(() => {
		if (!target) return;
		setProblem(null);
		if (target.mode === "edit") {
			setKind(target.card.kind);
			setName(target.card.name);
			setLastFour(target.card.lastFour ?? "");
			setCreditAccountId(target.card.creditAccountId ?? "");
			setDebitAccountId(target.card.debitAccountId ?? "");
			return;
		}
		const first = kindsFor(target.account)[0] ?? "debit";
		setKind(first);
		// The account it belongs to is the name somebody would type anyway.
		setName(target.account.name);
		setLastFour("");
		const sides = sidesFor(
			first,
			target.account,
			accounts.filter((account) => account.archivedAt === null),
		);
		setCreditAccountId(sides.credit);
		setDebitAccountId(sides.debit);
	}, [target, accounts]);

	const save = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			const links = {
				lastFour: lastFour.trim() === "" ? null : lastFour.trim(),
				creditAccountId: needs.credit ? creditAccountId : null,
				debitAccountId: needs.debit ? debitAccountId : null,
			};
			// The kind never changes, so correcting a card touches the name, the digits
			// and the accounts, and a card that became another kind is a new card.
			if (target?.mode === "edit") return session.cards.update(target.card.id, { name, ...links });
			return session.cards.create({ spaceId, kind, name, ...links });
		},
		onSuccess: () => {
			void queries.invalidateQueries({ queryKey: ["cards"] });
			void queries.invalidateQueries({ queryKey: ["transactions"] });
			onClose();
		},
		onError: (error: unknown) => {
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
		},
	});

	function submit(event: FormEvent) {
		event.preventDefault();
		save.mutate();
	}

	// Saying why the button would refuse beats letting somebody press it and read a
	// rule they could not have known about.
	const missing =
		needs.credit && invoices.length === 0
			? t("cards.needsCreditAccount")
			: needs.debit && balances.length === 0
				? t("cards.needsDebitAccount")
				: null;

	// The side the account this came from already fills is not asked about again. When a
	// card is being corrected there is no such account, so both sides are asked.
	// The account is named in the line under the title rather than in the title itself:
	// half the accounts in this country are already called cartao something, and a
	// heading reading "Cartao de Cartao de credito" is nobody's idea of clear.
	const title = target?.mode === "edit" ? t("cards.edit") : t("cards.addTo");

	const filled = anchor === null ? null : sideOf(anchor);
	const showCredit = needs.credit && invoices.length > 0 && filled !== "credit";
	const showDebit = needs.debit && balances.length > 0 && filled !== "debit";

	return (
		<Dialog
			open={target !== null}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
			title={title}
			description={
				target?.mode === "edit"
					? t("cards.editDescription")
					: t("cards.addToDescription", { name: anchor?.name ?? "" })
			}
			closeLabel={t("actions.cancel")}
			footer={
				<>
					<Button variant="quiet" onClick={onClose}>
						{t("actions.cancel")}
					</Button>
					<Button
						variant="primary"
						onClick={() => save.mutate()}
						disabled={save.isPending || missing !== null}
					>
						{t("actions.save")}
					</Button>
				</>
			}
		>
			<form onSubmit={submit} className="space-y-4">
				{/* One kind to choose from is not a choice, so it is stated instead. */}
				{offered.length > 1 ? (
					<Select
						label={t("cards.kind")}
						hint={target?.mode === "edit" ? undefined : t("cards.kindHint")}
						value={kind}
						disabled={target?.mode === "edit"}
						onChange={(event) => {
							const next = event.target.value as CardKind;
							setKind(next);
							const sides = sidesFor(next, anchor, open);
							setCreditAccountId(sides.credit);
							setDebitAccountId(sides.debit);
						}}
						options={offered.map((value) => ({ value, label: t(`cardKind.${value}`) }))}
					/>
				) : (
					<p className="text-sm text-quiet">{t("cards.kindIs", { kind: t(`cardKind.${kind}`) })}</p>
				)}

				{missing ? <Callout tone="attention">{missing}</Callout> : null}

				<Field
					label={t("cards.name")}
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder={t("cards.namePlaceholder")}
					required={true}
				/>

				{/* Only the side the account it came from is not already filling. */}
				{showCredit ? (
					<Select
						label={t("cards.creditAccount")}
						hint={t("cards.creditAccountHint")}
						value={creditAccountId}
						onChange={(event) => setCreditAccountId(event.target.value)}
						options={invoices.map((account) => ({ value: account.id, label: account.name }))}
					/>
				) : null}
				{showDebit ? (
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
			</form>
		</Dialog>
	);
}
