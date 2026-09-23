// Something on the screen that is not on the screen yet.
//
// A screen with sixteen things on it and no order is harder to use than a screen with
// four things and a way to the other twelve. This is that way, and it is the native
// element rather than a state and a button, because the browser already gives that
// element a keyboard, a role, an announcement and a place in the find on page.
//
// What goes in here is what somebody does rarely, never what they do first. A thing
// nobody can find is worse than a thing in a list, so the summary says what is inside
// in the words of the person, not "avançado".

import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Icon } from "./Icon.tsx";

export type DisclosureProps = {
	/** What is inside, in words. Never a category name nobody uses out loud. */
	summary: ReactNode;
	/** One line under it, for what the person gains by opening it. */
	hint?: ReactNode;
	children: ReactNode;
	/** Open from the start, for when what is inside is already set up. */
	open?: boolean;
	className?: string;
};

export function Disclosure({ summary, hint, children, open, className }: DisclosureProps) {
	return (
		<details className={cn("group rounded-md border border-line bg-panel", className)} open={open}>
			<summary className="flex cursor-pointer list-none items-start gap-3 rounded-md px-4 py-3 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:px-5">
				{/* The triangle the browser draws is hidden above, because it sits on the
				    wrong side in one engine and cannot be styled in another. */}
				<Icon
					name="chevronDown"
					className="mt-0.5 shrink-0 text-quiet transition-transform group-open:rotate-180"
				/>
				<span className="min-w-0">
					<span className="font-serif text-lg leading-tight text-ink">{summary}</span>
					{hint ? <span className="block text-sm leading-relaxed text-quiet">{hint}</span> : null}
				</span>
			</summary>
			<div className="space-y-4 border-t border-line px-4 py-4 sm:px-5">{children}</div>
		</details>
	);
}
