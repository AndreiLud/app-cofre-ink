// A year as a shape: what came in and what went out, month by month.
//
// Two columns per month, side by side rather than stacked, because the question this
// answers is whether one is taller than the other. The drawing keeps its proportions
// when the box changes, so nothing is stretched and the labels stay readable.

import { cn } from "../../lib/cn.ts";

export type ColumnGroup = {
	key: string;
	label: string;
	income: number;
	expense: number;
};

export type ColumnChartProps = {
	groups: readonly ColumnGroup[];
	description: string;
	className?: string;
};

const WIDTH = 720;
const PLOT = 200;
const LABELS = 24;

export function ColumnChart({ groups, description, className }: ColumnChartProps) {
	const most = Math.max(1, ...groups.flatMap((group) => [group.income, group.expense]));
	const slot = WIDTH / Math.max(1, groups.length);
	const barWidth = Math.min(28, slot * 0.32);

	return (
		<svg
			viewBox={`0 0 ${WIDTH} ${PLOT + LABELS}`}
			className={cn("h-auto w-full", className)}
			role="img"
			aria-label={description}
			preserveAspectRatio="xMidYMid meet"
		>
			<g>
				{groups.map((group, index) => {
					const middle = index * slot + slot / 2;
					const income = (group.income / most) * PLOT;
					const expense = (group.expense / most) * PLOT;
					return (
						<g key={group.key}>
							<rect
								x={middle - barWidth - 2}
								y={PLOT - income}
								width={barWidth}
								height={Math.max(income, 1)}
								className="fill-cedar"
							/>
							<rect
								x={middle + 2}
								y={PLOT - expense}
								width={barWidth}
								height={Math.max(expense, 1)}
								className="fill-seal"
							/>
							<text
								x={middle}
								y={PLOT + 16}
								textAnchor="middle"
								className="fill-graphite text-[12px]"
							>
								{group.label}
							</text>
						</g>
					);
				})}
				<line
					x1={0}
					y1={PLOT}
					x2={WIDTH}
					y2={PLOT}
					className="stroke-rule"
					strokeWidth={1}
					vectorEffect="non-scaling-stroke"
				/>
			</g>
		</svg>
	);
}
