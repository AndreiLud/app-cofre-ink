// Every amount on screen goes through here, so the privacy mode and the locale are
// never forgotten in one corner of one screen.

import { money } from "@cofre/core";
import { Amount, type AmountFace, type AmountTone } from "@cofre/ui";
import { useTranslation } from "react-i18next";
import { type Language, LOCALE_OF } from "../i18n/index.ts";
import { useCofre } from "../storage/CofreProvider.tsx";

export type ValueProps = {
	/** Minor units, as everything in this project. */
	amount: number;
	currency?: string;
	tone?: AmountTone;
	/** The serif is for the one figure a screen exists to show. Columns stay monospace. */
	face?: AmountFace;
	withoutSymbol?: boolean;
	className?: string;
};

export function Value({
	amount,
	currency = "BRL",
	tone = "neutral",
	face,
	withoutSymbol,
	className,
}: ValueProps) {
	const { i18n } = useTranslation();
	const { amountsHidden } = useCofre();
	const locale = LOCALE_OF[(i18n.resolvedLanguage ?? "pt") as Language];

	return (
		<Amount
			value={money(amount, currency)}
			locale={locale}
			tone={tone}
			face={face}
			hidden={amountsHidden}
			withoutSymbol={withoutSymbol}
			className={className}
		/>
	);
}
