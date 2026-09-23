// A button that looks like a button.
//
// The old ones were an outline in the same colour and weight as every rule and every
// input border on the page, so nothing on a screen announced itself as the thing to
// press. These have three clearly different weights, and a screen is allowed one of
// the first kind.

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";
export type ButtonSize = "small" | "medium";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: ButtonVariant;
	size?: ButtonSize;
	/** Rendered before the label, never as the only content of a button. */
	icon?: ReactNode;
};

const VARIANTS: Record<ButtonVariant, string> = {
	/**
	 * Filled, in the one colour that means "you can act on this". One per screen.
	 *
	 * The line inside the bottom edge is the whole of the letterpress: a shape pressed
	 * into paper is darker where the paper comes back up, and one pixel of that is the
	 * difference between a rectangle of colour and something that was put there.
	 */
	primary:
		"bg-accent text-accentInk border border-accent shadow-[inset_0_-1px_0_rgb(0_0_0/0.22)] hover:brightness-110 active:brightness-95 active:shadow-none",
	/** Raised off the panel, with an edge strong enough to read as an edge. */
	secondary: "bg-sunken text-ink border border-lineStrong hover:bg-accentSoft hover:border-accent",
	/** A word you can press. For anything that undoes, cancels or leaves. */
	quiet: "bg-transparent text-quiet border border-transparent hover:bg-sunken hover:text-ink",
	destructive: "bg-transparent text-seal border border-seal/50 hover:bg-seal/10 hover:border-seal",
};

const SIZES: Record<ButtonSize, string> = {
	small: "h-9 px-3 text-sm gap-1.5",
	/** Forty four pixels is what a thumb needs, and a mouse does not mind it. */
	medium: "h-11 px-4 text-sm gap-2",
};

/**
 * What a button is wearing, for the things that cannot be one.
 *
 * A link that leaves the application is a link and has to be an anchor: putting a
 * button inside one is two controls in the same place, and a screen reader reads it as
 * such. This hands the clothes over so that the anchor looks like the row it sits in
 * without the recipe being written down twice.
 */
export function buttonClasses(
	options: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {},
): string {
	const { variant = "secondary", size = "medium", className } = options;
	return cn(
		"inline-flex shrink-0 items-center justify-center rounded-sm font-medium whitespace-nowrap",
		"transition-[background-color,border-color,filter] duration-150",
		"disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-sunken",
		VARIANTS[variant],
		SIZES[size],
		className,
	);
}

export function Button({
	variant = "secondary",
	size = "medium",
	icon,
	className,
	children,
	type = "button",
	...rest
}: ButtonProps) {
	return (
		<button type={type} className={buttonClasses({ variant, size, className })} {...rest}>
			{icon}
			{children}
		</button>
	);
}
