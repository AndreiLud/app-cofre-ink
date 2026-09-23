// A line over months: where the money is going.
//
// Two shapes of question are asked with this one drawing. Does the balance stay above
// zero, which is why the zero line is drawn whenever anything is below it, and did one
// line keep up with another, which is why more than one can be shown at a time.
//
// It is drawn with coordinates and no measurement of the window, like every other chart
// here, so it scales by itself and never lags a frame behind the layout.

import { cn } from "../../lib/cn.ts";
import { type ChartSize, TwoShapes } from "./shapes.tsx";

export type LineTone = "ink" | "cedar" | "seal" | "amber" | "graphite";

export type LineSeries = {
	key: string;
	label: string;
	tone: LineTone;
	/** One value per label, in minor units. */
	points: readonly number[];
	/** Drawn as a dotted line, for the one that is a comparison rather than the answer. */
	dotted?: boolean;
};

export type LineChartProps = {
	labels: readonly string[];
	series: readonly LineSeries[];
	description: string;
	/** Turns a value into words, for the two numbers written on the drawing. */
	format?: (value: number) => string;
	className?: string;
};

const WIDE: ChartSize = { width: 720, height: 200 };
const NARROW: ChartSize = { width: 360, height: 220 };
const PADDING = 8;
/** Room under the line for the first and last label. */
const FOOT = 18;

const STROKE: Record<LineTone, string> = {
	ink: "stroke-ink",
	cedar: "stroke-cedar",
	seal: "stroke-seal",
	amber: "stroke-amber",
	graphite: "stroke-quiet",
};

function Drawing({
	labels,
	series,
	description,
	format,
	className,
	size,
}: LineChartProps & { size: ChartSize }) {
	const WIDTH = size.width;
	const HEIGHT = size.height;

	const every = series.flatMap((one) => [...one.points]);
	const highest = Math.max(0, ...every);
	const lowest = Math.min(0, ...every);
	const span = Math.max(1, highest - lowest);

	const step = labels.length > 1 ? (WIDTH - PADDING * 2) / (labels.length - 1) : 0;
	const plot = HEIGHT - FOOT;
	const yOf = (value: number) => PADDING + (plot - PADDING * 2) * (1 - (value - lowest) / span);

	const zero = yOf(0);
	const first = labels[0] ?? "";
	const last = labels[labels.length - 1] ?? "";

	return (
		<svg
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			className={cn("h-auto w-full", className)}
			role="img"
			aria-label={description}
			preserveAspectRatio="xMidYMid meet"
		>
			{/* The two ends of the scale, written rather than drawn as an axis: two
			    numbers are read faster than a ladder of ticks. */}
			{format ? (
				<>
					<text x={0} y={PADDING + 4} className="fill-quiet text-[10px]">
						{format(highest)}
					</text>
					<text x={0} y={plot - 2} className="fill-quiet text-[10px]">
						{format(lowest)}
					</text>
				</>
			) : null}

			<text x={0} y={HEIGHT - 4} className="fill-quiet text-[10px]">
				{first}
			</text>
			<text x={WIDTH} y={HEIGHT - 4} textAnchor="end" className="fill-quiet text-[10px]">
				{last}
			</text>

			{/* The line that matters when anything is under it. */}
			{lowest < 0 ? (
				<line
					x1={0}
					x2={WIDTH}
					y1={zero}
					y2={zero}
					className="stroke-seal"
					strokeWidth={1}
					strokeDasharray="4 4"
				/>
			) : null}

			{series.map((one) => {
				const points = one.points
					.map((value, index) => `${PADDING + index * step},${yOf(value)}`)
					.join(" ");

				return (
					<g key={one.key}>
						<polyline
							points={points}
							fill="none"
							strokeWidth={2}
							strokeLinejoin="round"
							strokeLinecap="round"
							strokeDasharray={one.dotted ? "5 4" : undefined}
							className={STROKE[one.tone]}
						/>
						{/* The last point, because the end of the line is the answer. */}
						{one.points.length > 0 ? (
							<circle
								cx={PADDING + (one.points.length - 1) * step}
								cy={yOf(one.points[one.points.length - 1] ?? 0)}
								r={3}
								className={cn(STROKE[one.tone], "fill-panel")}
								strokeWidth={2}
							/>
						) : null}
					</g>
				);
			})}
		</svg>
	);
}

export function LineChart(props: LineChartProps) {
	return (
		<TwoShapes
			narrow={NARROW}
			wide={WIDE}
			draw={(size, shown) => (
				<Drawing {...props} size={size} className={cn(props.className, shown)} />
			)}
		/>
	);
}
