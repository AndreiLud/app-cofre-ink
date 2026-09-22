// Which days money leaves.
//
// A month as a grid of days, each one as dark as the money that left it. The point is
// not the exact number, which the table beside it gives, but the shape: the weekends,
// the day the bills fall, the week that went wrong.

import { cn } from "../../lib/cn.ts";

export type HeatDay = {
	/** The day of the month, from 1. */
	day: number;
	amount: number;
};

export type HeatMapProps = {
	days: readonly HeatDay[];
	daysInMonth: number;
	/** The weekday of the first day, Sunday being zero. */
	firstWeekday: number;
	description: string;
	format: (amount: number) => string;
	className?: string;
};

/** Monday first, as a month is read in Brazil and in most of Europe. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const CELL = 44;
const GAP = 4;

export function HeatMap({
	days,
	daysInMonth,
	firstWeekday,
	description,
	format,
	className,
}: HeatMapProps) {
	const byDay = new Map(days.map((one) => [one.day, one.amount]));
	const most = Math.max(1, ...days.map((one) => one.amount));
	const blanks = Math.max(0, ORDER.indexOf(firstWeekday));

	const cells = Array.from({ length: daysInMonth }, (_unused, index) => {
		const day = index + 1;
		const position = blanks + index;
		return {
			day,
			amount: byDay.get(day) ?? 0,
			column: position % 7,
			row: Math.floor(position / 7),
		};
	});

	const rows = Math.max(1, ...cells.map((cell) => cell.row + 1));
	const width = 7 * CELL + 6 * GAP;
	const height = rows * CELL + (rows - 1) * GAP;

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			className={cn("h-auto w-full max-w-md", className)}
			role="img"
			aria-label={description}
			preserveAspectRatio="xMidYMid meet"
		>
			<g>
				{cells.map((cell) => {
					const x = cell.column * (CELL + GAP);
					const y = cell.row * (CELL + GAP);
					// A day with nothing keeps its outline, so the month stays a month.
					const weight = cell.amount === 0 ? 0 : 0.15 + (cell.amount / most) * 0.75;
					return (
						<g key={cell.day}>
							<title>{`${cell.day}: ${format(cell.amount)}`}</title>
							<rect
								x={x}
								y={y}
								width={CELL}
								height={CELL}
								className="fill-ink stroke-rule"
								fillOpacity={weight}
								strokeWidth={1}
							/>
							<text
								x={x + 5}
								y={y + 14}
								className={cn(
									"font-mono text-[11px]",
									weight > 0.5 ? "fill-paper" : "fill-graphite",
								)}
							>
								{cell.day}
							</text>
						</g>
					);
				})}
			</g>
		</svg>
	);
}
