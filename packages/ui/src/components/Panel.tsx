// A section of a screen, as an object rather than as a stretch of text.
//
// This is the piece that does the most for finding your way around. Before it, a screen
// was paragraphs and tables separated by hairlines, all on one surface, and the eye had
// nowhere to land. A panel is lighter than the page it sits on and has an edge, so a
// section reads as one thing that can be taken in or skipped over.
//
// The title and the action belong to the panel and not to the screen, which is what
// stops a screen from growing four headings that all look like the title of the screen.

import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type PanelProps = {
	/** Left out for a panel that is only a container, such as a list of rows. */
	title?: ReactNode;
	/** One line under the title. Anything longer belongs on the screen it explains. */
	description?: ReactNode;
	/** The one thing this section can do, at the top right where it is looked for. */
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	/** Removes the padding, for a panel whose child is a table that reaches the edges. */
	flush?: boolean;
};

export function Panel({ title, description, action, children, className, flush }: PanelProps) {
	return (
		<section
			className={cn(
				"rounded-md border border-line bg-panel",
				flush ? "overflow-hidden" : "p-4 sm:p-5",
				className,
			)}
		>
			{title || action ? (
				<div
					className={cn(
						"flex flex-wrap items-start justify-between gap-3",
						flush ? "border-b border-line px-4 py-3 sm:px-5" : "",
						children && !flush ? "mb-4" : "",
					)}
				>
					<div className="min-w-0">
						{title ? <h2 className="font-serif text-lg leading-tight">{title}</h2> : null}
						{description ? (
							<p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-quiet">{description}</p>
						) : null}
					</div>
					{action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
				</div>
			) : null}
			{children}
		</section>
	);
}
