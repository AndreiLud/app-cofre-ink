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
		<span className={cn("inline-flex items-center gap-2 text-sm text-ink", className)}>
			<span
				aria-hidden="true"
				className="size-2.5 shrink-0 rounded-full"
				style={{ backgroundColor: SPACE_COLOURS[colour] }}
			/>
			<span className="font-medium">{name}</span>
			{description ? <span className="sr-only">{description}</span> : null}
		</span>
	);
}

/** The hairline under the top bar, tinted with the colour of the current space. */
export function SpaceRule({ colour, className }: { colour: SpaceColour; className?: string }) {
	return (
		<div
			aria-hidden="true"
			className={cn("h-px w-full", className)}
			style={{ backgroundColor: SPACE_COLOURS[colour] }}
		/>
	);
}
