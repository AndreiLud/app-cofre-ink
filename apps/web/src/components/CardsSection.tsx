// The cards of a space, under the accounts, because that is what they reach.
//
// The distinction this screen has to teach in one line is that the card is the plastic
// and the account is the money. So every row says what the card uses, in words: the
// invoice of one account, the balance of another, or both when it is a cartao multiplo.
// Nobody has to know the data model to read it.
//
// It lists and it corrects; it does not add. A card is added from the account it
// reaches, in the table above, because a second place to add one is a second way of
// saying the same thing and that is what made this screen confusing.

import type { Account, Card } from "@cofre/storage";
import { Button, Callout, Icon, Menu, MenuItem, MenuSeparator, Panel, Skeleton } from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCofre } from "../storage/CofreProvider.tsx";

export type CardsSectionProps = {
	spaceId: string;
	accounts: Account[];
	/** Correcting one opens the same dialog the accounts table opens to add one. */
	onEdit: (card: Card) => void;
};

export function CardsSection({ spaceId, accounts, onEdit }: CardsSectionProps) {
	const { t } = useTranslation();
	const { session } = useCofre();
	const queries = useQueryClient();

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

	const nameOf = (id: string | null) =>
		id === null ? "" : (accounts.find((account) => account.id === id)?.name ?? "");

	/** What the card uses, as a sentence, which is the whole point of this line. */
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

	const rows = cards.data ?? [];

	return (
		<Panel title={t("cards.title")} description={t("cards.explain")}>
			{problem ? <Callout tone="problem">{problem}</Callout> : null}

			{cards.isPending ? <Skeleton lines={2} /> : null}

			{/* Saying where they come from, once, in the only place somebody would look
			    for a button that is deliberately not here. */}
			{!cards.isPending && rows.length === 0 ? (
				<p className="max-w-[62ch] text-sm text-quiet">{t("cards.fromAccounts")}</p>
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
							<MenuItem onSelect={() => onEdit(card)}>{t("cards.edit")}</MenuItem>
							<MenuItem onSelect={() => archive.mutate(card)}>
								{card.archivedAt === null ? t("cards.archive") : t("cards.unarchive")}
							</MenuItem>
							<MenuSeparator />
							<MenuItem onSelect={() => remove.mutate(card.id)}>{t("actions.delete")}</MenuItem>
						</Menu>
					</li>
				))}
			</ul>
		</Panel>
	);
}
