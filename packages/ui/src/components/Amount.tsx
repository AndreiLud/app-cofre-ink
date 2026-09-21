import { formatMoney, type Money, maskMoney } from "@cofre/core/money";
import { cn } from "../lib/cn.ts";

export type AmountTone = "auto" | "neutral" | "positive" | "negative";

export type AmountProps = {
	value: Money;
	locale?: string;
	tone?: AmountTone;
	/** Hides the digits, for the privacy mode and for recording a demo. */
	hidden?: boolean;
	withoutSymbol?: boolean;
	alwaysSign?: boolean;
	className?: string;
};

function toneClass(tone: AmountTone, amount: number): string {
	const resolved =
		tone === "auto" ? (amount > 0 ? "positive" : amount < 0 ? "negative" : "neutral") : tone;
	if (resolved === "positive") return "text-cedar";
	if (resolved === "negative") return "text-seal";
	return "text-ink";
}

/**
 * The only way an amount reaches the screen. Monospaced and tabular so a column of
 * numbers lines up, and never coloured as the single carrier of meaning: the sign and
 * the label say the same thing.
 */
export function Amount({
	value,
	locale,
	tone = "neutral",
	hidden = false,
	withoutSymbol = false,
	alwaysSign = false,
	className,
}: AmountProps) {
	const options = { locale, withoutSymbol, alwaysSign };
	const text = hidden ? maskMoney(value, options) : formatMoney(value, options);
	return (
		<span
			className={cn(
				"font-mono tabular-nums whitespace-nowrap",
				toneClass(tone, value.amount),
				className,
			)}
			data-hidden={hidden ? "true" : undefined}
		>
			{text}
		</span>
	);
}
