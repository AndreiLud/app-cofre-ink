// What is on a benefit card, wherever a list of accounts shows a figure per account.

import type { CalendarDate } from "@cofre/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCofre } from "../storage/CofreProvider.tsx";
import { Value } from "./Value.tsx";

/**
 * What is on a benefit card, which is worked out and never read off a balance.
 *
 * The same request as the line on the overview, by the same key, so it is one read and the
 * screens cannot answer differently. Registry 0043 says what is on a card is never a balance
 * on any screen, and the accounts screen read the balance: since nothing is written when an
 * allowance lands, that is roughly the negative of what has been eaten, so the overview said
 * 900 and the accounts screen said minus 56 about the same card. A card with no allowance
 * written down says so instead of showing a figure.
 */
export function VoucherAmount({
	accountId,
	currency,
	today,
	known,
}: {
	accountId: string;
	currency: string;
	today: CalendarDate;
	/**
	 * Whether this person reads the household's rows at all.
	 *
	 * The model answers nothing about a benefit card to somebody who only sees their own
	 * records, on purpose, because what is on the card is made of every lunch on it. Nothing is
	 * not the same as no allowance written down, so for them this draws nothing at all, rather
	 * than telling a Registrador that the allowance is missing on a card that has one.
	 */
	known: boolean;
}) {
	const { session } = useCofre();
	const state = useQuery({
		queryKey: ["benefit", accountId, today],
		enabled: Boolean(session) && known,
		queryFn: () => session?.accounts.benefitLeft(accountId, today) ?? null,
	});

	const { t } = useTranslation();
	// Nothing while the answer is on its way either, so the sentence about a missing
	// allowance is never the first thing a card says about itself.
	if (!known || state.isPending) return null;
	if (!state.data) return <span className="text-quiet text-sm">{t("dashboard.quotaMissing")}</span>;
	return <Value amount={state.data.left} currency={currency} tone="auto" />;
}
