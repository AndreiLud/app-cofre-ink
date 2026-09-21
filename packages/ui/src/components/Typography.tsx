import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type SectionTitleProps = {
	children: ReactNode;
	/** Sits at the right end of the rule, for a filter or an action. */
	action?: ReactNode;
	className?: string;
};

/**
 * The label that opens a block. In this direction a section is announced by a small
 * label over a rule, not by a card with a shadow.
 */
export function SectionTitle({ children, action, className }: SectionTitleProps) {
	return (
		<div
			className={cn(
				"flex items-baseline justify-between gap-4 border-b border-rule pb-2",
				className,
			)}
		>
			<h2 className="font-sans text-sm font-semibold text-ink">{children}</h2>
			{action}
		</div>
	);
}

export type InsightTitleProps = {
	children: ReactNode;
	/** The supporting sentence, one line, that explains the number. */
	detail?: ReactNode;
	className?: string;
};

/**
 * Every chart is opened by a sentence that states the finding, never by the name of
 * an axis. The detail line carries the comparison that makes the finding readable.
 */
export function InsightTitle({ children, detail, className }: InsightTitleProps) {
	return (
		<div className={cn("space-y-1", className)}>
			<p className="font-serif text-xl leading-tight text-ink">{children}</p>
			{detail ? <p className="text-sm text-graphite">{detail}</p> : null}
		</div>
	);
}
