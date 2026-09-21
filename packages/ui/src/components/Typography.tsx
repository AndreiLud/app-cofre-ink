import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

/** Every screen has exactly one level one heading, and it says where you are. */
export type HeadingLevel = "h1" | "h2" | "h3";

export type SectionTitleProps = {
	children: ReactNode;
	/** Sits at the right end of the rule, for a filter or an action. */
	action?: ReactNode;
	/** The page title of a screen is level one, a block inside it is level two. */
	level?: HeadingLevel;
	className?: string;
};

/**
 * The label that opens a block. In this direction a section is announced by a small
 * label over a rule, not by a card with a shadow.
 */
export function SectionTitle({ children, action, level = "h2", className }: SectionTitleProps) {
	const Heading = level;
	return (
		<div
			className={cn(
				"flex items-baseline justify-between gap-4 border-b border-rule pb-2",
				className,
			)}
		>
			<Heading className="font-sans text-sm font-semibold text-ink">{children}</Heading>
			{action}
		</div>
	);
}

export type InsightTitleProps = {
	children: ReactNode;
	/** The supporting sentence, one line, that explains the number. */
	detail?: ReactNode;
	/** On the first block of a screen this sentence is the page title. */
	level?: HeadingLevel | "p";
	className?: string;
};

/**
 * Every chart is opened by a sentence that states the finding, never by the name of
 * an axis. The detail line carries the comparison that makes the finding readable.
 */
export function InsightTitle({ children, detail, level = "p", className }: InsightTitleProps) {
	const Heading = level;
	return (
		<div className={cn("space-y-1", className)}>
			<Heading className="font-serif text-xl leading-tight text-ink">{children}</Heading>
			{detail ? <p className="text-sm text-graphite">{detail}</p> : null}
		</div>
	);
}
