// Where the money went, drawn as one picture.
//
// Hand drawn in SVG rather than by a chart library, for three reasons. The picture has
// to look like the rest of the product, which a library theme never quite does. The
// bundle of an application somebody installs on a phone is not the place for a
// megabyte of charting engine. And every chart here ships with a table beside it
// anyway, so the drawing is decoration over data that is already readable.
//
// It scales with its box: the coordinates are a viewBox, so the browser does the
// resizing and nothing has to listen to the window.

import { cn } from "../../lib/cn.ts";

export type FlowSide = { key: string; label: string; amount: number };

export type FlowChartProps = {
	sources: readonly FlowSide[];
	destinations: readonly FlowSide[];
	/** Read out instead of the drawing, so it says the finding and not the shape. */
	description: string;
	/** Formats an amount for the labels, so this file holds no locale. */
	format: (amount: number) => string;
	className?: string;
};

const WIDTH = 720;
const HEIGHT = 420;
const COLUMN = 150;
const GAP = 6;
/** Below this a node would be a hairline, and a flow nobody can see is a flow missing. */
const LEAST = 5;
/** A label needs room to sit in. What has none is in the table under the drawing. */
const LABEL_AT = 18;
const AMOUNT_AT = 36;

type Placed = FlowSide & { top: number; height: number };

function place(items: readonly FlowSide[], total: number): Placed[] {
	const usable = HEIGHT - GAP * Math.max(0, items.length - 1);
	const raw = items.map((item) => (total === 0 ? 0 : (item.amount / total) * usable));

	// Small flows are given a floor and the rest give up the difference in proportion,
	// so the picture keeps its shape while the slivers stay visible.
	const owed = raw.reduce((sum, height) => sum + Math.max(0, LEAST - height), 0);
	const roomy = raw.reduce((sum, height) => sum + (height > LEAST ? height : 0), 0);

	let cursor = 0;
	return items.map((item, index) => {
		const height = raw[index] ?? 0;
		const adjusted =
			height <= LEAST ? LEAST : roomy === 0 ? height : height - owed * (height / roomy);
		const placed = { ...item, top: cursor, height: Math.max(1, adjusted) };
		cursor += placed.height + GAP;
		return placed;
	});
}

export function FlowChart({
	sources,
	destinations,
	description,
	format,
	className,
}: FlowChartProps) {
	const total = Math.max(
		sources.reduce((sum, one) => sum + one.amount, 0),
		destinations.reduce((sum, one) => sum + one.amount, 0),
	);

	const left = place(sources, total);
	const right = place(destinations, total);

	// Every source pours into every destination in proportion, which is the truthful
	// reading when money is not earmarked: a salary does not pay the rent and nothing
	// else, it pays a share of everything.
	const ribbons: { key: string; path: string }[] = [];
	const cursors = new Map<string, number>();

	for (const source of left) {
		let offset = 0;
		for (const destination of right) {
			const share = total === 0 ? 0 : destination.amount / total;
			const height = source.height * share;
			const startTop = source.top + offset;
			const endTop = destination.top + (cursors.get(destination.key) ?? 0);

			ribbons.push({
				key: `${source.key}${destination.key}`,
				path: ribbon(startTop, startTop + height, endTop, endTop + height),
			});

			offset += height;
			cursors.set(destination.key, (cursors.get(destination.key) ?? 0) + height);
		}
	}

	return (
		<svg
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			className={cn("h-auto w-full", className)}
			role="img"
			aria-label={description}
			preserveAspectRatio="xMidYMid meet"
		>
			{/* The drawing speaks through the label on the svg above, so nothing inside it needs a name of its own. */}
			<g className="text-accent">
				{/* The ribbons carry the shape of the answer, so they are a tint of the
				    one colour this interface uses rather than a shade of the text. At
				    twelve per cent of ink they all but vanished on a lighter surface. */}
				{ribbons.map((one) => (
					<path key={one.key} d={one.path} fill="currentColor" opacity={0.22} />
				))}

				{left.map((one) => (
					<g key={one.key}>
						<title>{`${one.label}: ${format(one.amount)}`}</title>
						<rect x={0} y={one.top} width={10} height={one.height} fill="currentColor" />
						{one.height >= LABEL_AT ? (
							<text
								x={16}
								y={one.top + one.height / 2 - (one.height >= AMOUNT_AT ? 8 : 0)}
								dominantBaseline="middle"
								className="fill-ink text-[13px]"
							>
								{one.label}
							</text>
						) : null}
						{one.height >= AMOUNT_AT ? (
							<text
								x={16}
								y={one.top + one.height / 2 + 9}
								dominantBaseline="middle"
								className="fill-quiet font-mono text-[11px]"
							>
								{format(one.amount)}
							</text>
						) : null}
					</g>
				))}

				{right.map((one) => (
					<g key={one.key}>
						<title>{`${one.label}: ${format(one.amount)}`}</title>
						<rect x={WIDTH - 10} y={one.top} width={10} height={one.height} fill="currentColor" />
						{one.height >= LABEL_AT ? (
							<text
								x={WIDTH - 16}
								y={one.top + one.height / 2 - (one.height >= AMOUNT_AT ? 8 : 0)}
								textAnchor="end"
								dominantBaseline="middle"
								className="fill-ink text-[13px]"
							>
								{one.label}
							</text>
						) : null}
						{one.height >= AMOUNT_AT ? (
							<text
								x={WIDTH - 16}
								y={one.top + one.height / 2 + 9}
								textAnchor="end"
								dominantBaseline="middle"
								className="fill-quiet font-mono text-[11px]"
							>
								{format(one.amount)}
							</text>
						) : null}
					</g>
				))}
			</g>
		</svg>
	);

	function ribbon(fromTop: number, fromBottom: number, toTop: number, toBottom: number): string {
		const x0 = 10;
		const x1 = WIDTH - 10;
		const bend = x0 + COLUMN;
		const bendBack = x1 - COLUMN;
		return [
			`M ${x0} ${fromTop}`,
			`C ${bend} ${fromTop} ${bendBack} ${toTop} ${x1} ${toTop}`,
			`L ${x1} ${toBottom}`,
			`C ${bendBack} ${toBottom} ${bend} ${fromBottom} ${x0} ${fromBottom}`,
			"Z",
		].join(" ");
	}
}
