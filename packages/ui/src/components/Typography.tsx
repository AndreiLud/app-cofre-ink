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
 * The title of a screen, and the action that belongs to the screen as a whole.
 *
 * Inside a screen a section is a panel and carries its own title, so this one is only
 * ever used once: at the top, saying where you are. It used to be used for every block
 * as well, which is how a screen ended up with five headings of the same weight and no
 * way to tell which one was the screen.
 */
export function SectionTitle({ children, action, level = "h2", className }: SectionTitleProps) {
	const Heading = level;
	return (
		<div
			className={cn(
				"flex flex-wrap items-center justify-between gap-3",
				// The title of a screen sits above a rule, the way the head of a page does
				// on anything that was printed. It is the screen and not a block, so it is
				// the one place in the product that earns a line of its own.
				level === "h1" ? "border-b border-line pb-3" : "",
				className,
			)}
		>
			<Heading
				className={cn(
					"min-w-0 font-serif text-ink",
					level === "h1" ? "text-2xl leading-tight" : "text-lg leading-tight",
				)}
			>
				{children}
			</Heading>
			{action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
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
			{detail ? <p className="text-sm text-quiet">{detail}</p> : null}
		</div>
	);
}
