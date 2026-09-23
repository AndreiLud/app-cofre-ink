import { cn } from "../lib/cn.ts";

/** The colours a space can take. They never appear inside a chart. */
export const SPACE_COLOURS = {
	slate: "#4a5f7a",
	cedar: "#2e6b4f",
	clay: "#a8571e",
	plum: "#6b3f6e",
	sea: "#1f6b70",
	rose: "#9c3a5a",
} as const;

export type SpaceColour = keyof typeof SPACE_COLOURS;

export type SpaceMarkProps = {
	name: string;
	colour: SpaceColour;
	/** Says out loud which space this is, since colour alone is never the message. */
	description?: string;
	className?: string;
};

/**
 * Shows which space the person is in. The dot carries the colour, the name carries
 * the meaning, and both are always together so colour is never the only signal.
 */
export function SpaceMark({ name, colour, description, className }: SpaceMarkProps) {
	return (
		// It can be made narrow. A space called "Casa da praia com a familia" in a header
		// that also holds five controls has to give way somewhere, and the last letters
		// of the name are the cheapest thing in that row to lose.
		<span className={cn("inline-flex min-w-0 items-center gap-2 text-sm text-ink", className)}>
			<span
				aria-hidden="true"
				className="size-2.5 shrink-0 rounded-full"
				style={{ backgroundColor: SPACE_COLOURS[colour] }}
			/>
			<span className="truncate font-medium">{name}</span>
			{description ? <span className="sr-only">{description}</span> : null}
		</span>
	);
}

/**
 * The line under the top bar, tinted with the colour of the current space.
 *
 * Laid like a stroke rather than ruled like a border: it carries its full weight across
 * the middle and lifts at both ends, which is what a pen does and what a border never
 * does. The same one pixel of height, so nothing below it moves.
 */
export function SpaceRule({ colour, className }: { colour: SpaceColour; className?: string }) {
	const ink = SPACE_COLOURS[colour];
	return (
		<div
			aria-hidden="true"
			className={cn("h-px w-full", className)}
			style={{
				backgroundImage: `linear-gradient(to right, transparent, ${ink} 8%, ${ink} 92%, transparent)`,
			}}
		/>
	);
}
