// The cards of a space, under the accounts, because that is what they reach.
//
// The distinction this screen has to teach in one line is that the card is the plastic
// and the account is the money. So every row says what the card uses, in words: the
// invoice of one account, the balance of another, or both when it is a cartao multiplo.
// Nobody has to know the data model to read it.

import type { Account, Card, CardKind } from "@cofre/storage";
import {
	Button,
	Callout,
	Dialog,
	Field,
	Icon,
	Menu,
	MenuItem,
	MenuSeparator,
	Panel,
	Select,
	Skeleton,
} from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCofre } from "../storage/CofreProvider.tsx";

export type CardsSectionProps = {
	spaceId: string;
	spaceName: string;
	accounts: Account[];
};

const KINDS: CardKind[] = ["credit", "debit", "multiple", "benefit", "prepaid"];

/** Which of the two accounts each kind asks for. The repository decides for real. */
const NEEDS: Record<CardKind, { credit: boolean; debit: boolean }> = {
	credit: { credit: true, debit: false },
	debit: { credit: false, debit: true },
	multiple: { credit: true, debit: true },
	benefit: { credit: false, debit: true },
	prepaid: { credit: false, debit: true },
};

export function CardsSection({ spaceId, spaceName, accounts }: CardsSectionProps) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();

	const [isOpen, setOpen] = useState(false);
	const [editing, setEditing] = useState<Card | null>(null);
	const [kind, setKind] = useState<CardKind>("credit");
	const [name, setName] = useState("");
	const [lastFour, setLastFour] = useState("");
	const [creditAccountId, setCreditAccountId] = useState("");
	const [debitAccountId, setDebitAccountId] = useState("");
	const [problem, setProblem] = useState<string | null>(null);

	const cards = useQuery({
		queryKey: ["cards", spaceId, "includingArchived"],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.cards.list(spaceId, { includeArchived: true }) ?? [],
	});

	const invalidate = () => {
		void queries.invalidateQueries({ queryKey: ["cards"] });
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

	const invoices = accounts.filter(
		(account) => account.kind === "credit" && account.archivedAt === null,
	);
	const balances = accounts.filter(
		(account) => account.kind !== "credit" && account.archivedAt === null,
	);
	const needs = NEEDS[kind];

	/**
	 * A card spends a current account far more often than it spends the cash in a
	 * pocket, and the list is alphabetical, so the first one is not the likely one. A
	 * benefit card is the other way round: it spends the voucher it belongs to.
	 */
	function likelyBalance(of: CardKind) {
		const wanted = of === "benefit" ? "voucher" : "checking";
		return balances.find((account) => account.kind === wanted) ?? balances[0];
	}

	const save = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			const links = {
				lastFour: lastFour.trim() === "" ? null : lastFour.trim(),
				creditAccountId: needs.credit ? creditAccountId : null,
				debitAccountId: needs.debit ? debitAccountId : null,
			};
			// The kind never changes, so editing touches the name, the digits and the
			// accounts, and a card that became another kind is a new card.
			if (editing) return session.cards.update(editing.id, { name, ...links });
			return session.cards.create({ spaceId, kind, name, ...links });
		},
		onSuccess: () => {
			setOpen(false);
			setProblem(null);
			invalidate();
		},
		onError: complain,
	});

	const archive = useMutation({
		mutationFn: async (card: Card) =>
			card.archivedAt === null
				? session?.cards.archive(card.id)
				: session?.cards.unarchive(card.id),
		onSuccess: invalidate,
		onError: complain,
	});

	const remove = useMutation({
		mutationFn: async (id: string) => session?.cards.remove(id),
		onSuccess: invalidate,
		onError: complain,
	});

	function open(card: Card | null) {
		setEditing(card);
		setKind(card?.kind ?? "credit");
		setName(card?.name ?? "");
		setLastFour(card?.lastFour ?? "");
		setCreditAccountId(card?.creditAccountId ?? invoices[0]?.id ?? "");
		setDebitAccountId(card?.debitAccountId ?? likelyBalance(card?.kind ?? "credit")?.id ?? "");
		setProblem(null);
		setOpen(true);
	}

	function submit(event: FormEvent) {
		event.preventDefault();
		save.mutate();
	}

	const nameOf = (id: string | null) =>
		id === null ? "" : (accounts.find((account) => account.id === id)?.name ?? "");

	/** What the card uses, as a sentence, which is the whole point of this column. */
	function uses(card: Card): string {
		const parts: string[] = [];
		if (card.creditAccountId) {
			parts.push(t("cards.usesCredit", { name: nameOf(card.creditAccountId) }));
		}
		if (card.debitAccountId) {
			parts.push(t("cards.usesDebit", { name: nameOf(card.debitAccountId) }));
		}
		return parts.join(", ");
	}

	// Saying why the button would refuse beats letting somebody press it and read a
	// rule they could not have known about.
	const missing =
		needs.credit && invoices.length === 0
			? t("cards.needsCreditAccount")
			: needs.debit && balances.length === 0
				? t("cards.needsDebitAccount")
				: null;

	const rows = cards.data ?? [];

	return (
		<Panel
			title={t("cards.title")}
			description={t("cards.explain")}
			action={
				<Button size="small" variant="secondary" onClick={() => open(null)}>
					{t("cards.create")}
				</Button>
			}
		>
			{cards.isPending ? <Skeleton lines={2} /> : null}

			{!cards.isPending && rows.length === 0 ? (
				<p className="text-sm text-quiet">{t("cards.emptyBody")}</p>
			) : null}

			<ul className="divide-y divide-line">
				{rows.map((card) => (
					<li key={card.id} className="flex items-baseline justify-between gap-4 py-2.5">
						<span className="min-w-0">
							<span
								className={`text-sm ${card.archivedAt ? "text-quiet line-through" : "text-ink"}`}
							>
								{card.name}
							</span>
							{card.lastFour ? (
								<span className="ml-2 font-mono text-xs text-quiet">
									{t("cards.digits", { digits: card.lastFour })}
								</span>
							) : null}
							<span className="block text-xs text-quiet">
								{t(`cardKind.${card.kind}`)}
								{uses(card) === "" ? "" : `: ${uses(card)}`}
							</span>
						</span>
						<Menu
							align="end"
							trigger={
								<Button size="small" variant="quiet" aria-label={t("cards.actions")}>
									<Icon name="settings" />
								</Button>
							}
						>
							<MenuItem onSelect={() => open(card)}>{t("cards.edit")}</MenuItem>
							<MenuItem onSelect={() => archive.mutate(card)}>
								{card.archivedAt === null ? t("cards.archive") : t("cards.unarchive")}
							</MenuItem>
							<MenuSeparator />
							<MenuItem onSelect={() => remove.mutate(card.id)}>{t("actions.delete")}</MenuItem>
						</Menu>
					</li>
				))}
			</ul>

			<Dialog
				open={isOpen}
				onOpenChange={setOpen}
				title={editing ? t("cards.edit") : t("cards.create")}
				description={t("cards.createDescription", { space: spaceName })}
				closeLabel={t("actions.cancel")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setOpen(false)}>
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
					<Select
						label={t("cards.kind")}
						hint={editing ? undefined : t("cards.kindHint")}
						value={kind}
						disabled={editing !== null}
						onChange={(event) => {
							const next = event.target.value as CardKind;
							setKind(next);
							// A benefit card spends the voucher and a debit card spends the
							// current account, so the likely answer changes with the kind.
							setDebitAccountId(likelyBalance(next)?.id ?? "");
						}}
						options={KINDS.map((value) => ({ value, label: t(`cardKind.${value}`) }))}
					/>
					{missing ? <Callout tone="attention">{missing}</Callout> : null}
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
				</form>
			</Dialog>
		</Panel>
	);
}
