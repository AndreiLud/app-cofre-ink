// The cards of a space, under the accounts, because that is what they reach.
//
// The distinction this panel has to teach in one line is that the card is the plastic
// and the account is the money. So every line says what the card uses, in words: the
// invoice of one account, the balance of another, or both when it is a cartao multiplo.
// Nobody has to know the data model to read it.
//
// It only shows. A card is made with the account it belongs to, and looked after from
// the menu of that account in the table above. A second place to change the same thing
// is a second thing to keep in step, and it is what made this screen confusing.

import type { Account, Card } from "@cofre/storage";
import { Panel, Skeleton } from "@cofre/ui";
import { useTranslation } from "react-i18next";

export type CardsSectionProps = {
	accounts: Account[];
	cards: Card[];
	loading: boolean;
};

export function CardsSection({ accounts, cards, loading }: CardsSectionProps) {
	const { t } = useTranslation();

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

	return (
		<Panel title={t("cards.title")} description={t("cards.explain")}>
			{loading ? <Skeleton lines={2} /> : null}

			{/* Saying where they come from, once, in the only place somebody would look
			    for a button that is deliberately not here. */}
			{!loading && cards.length === 0 ? (
				<p className="max-w-[62ch] text-sm text-quiet">{t("cards.fromAccounts")}</p>
			) : null}

			<ul className="divide-y divide-line">
				{cards.map((card) => (
					<li key={card.id} className="py-2.5">
						<span className={`text-sm ${card.archivedAt ? "text-quiet line-through" : "text-ink"}`}>
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
					</li>
				))}
			</ul>

			{cards.length > 0 ? (
				<p className="mt-3 text-xs text-quiet">{t("cards.managedFromAccounts")}</p>
			) : null}
		</Panel>
	);
}
