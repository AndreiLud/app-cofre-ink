// A ranking with a bar behind each line.
//
// Not a chart with axes: a list that happens to carry its own proportion. It reads as
// a list on a phone and as a chart on a screen, which is the same thing a pie chart
// promises and never delivers.

import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";

export type BarListItem = {
	key: string;
	label: ReactNode;
	/** Shown at the right end of the line, already formatted. */
	value: ReactNode;
	amount: number;
	/** A tone from the palette, when the line carries a meaning of its own. */
	tone?: "ink" | "cedar" | "seal" | "ochre" | "amber";
};

export type BarListProps = {
	items: readonly BarListItem[];
	className?: string;
};

const TONES = {
	ink: "bg-ink",
	cedar: "bg-cedar",
	seal: "bg-seal",
	ochre: "bg-ochre",
	amber: "bg-amber",
};

export function BarList({ items, className }: BarListProps) {
	const most = Math.max(1, ...items.map((item) => item.amount));

	return (
		<ul className={cn("space-y-2", className)}>
			{items.map((item) => (
				<li key={item.key} className="space-y-1">
					<div className="flex items-baseline justify-between gap-4 text-sm">
						<span className="min-w-0 truncate text-ink">{item.label}</span>
						<span className="shrink-0 text-quiet">{item.value}</span>
					</div>
					<div className="h-1.5 w-full bg-line/60">
						<div
							className={cn("h-full", TONES[item.tone ?? "ink"])}
							style={{ width: `${Math.max(1, Math.round((item.amount / most) * 100))}%` }}
						/>
					</div>
				</li>
			))}
		</ul>
	);
}
