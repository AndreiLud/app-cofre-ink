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
	primary: "bg-ink text-paper border border-ink hover:opacity-90",
	secondary: "bg-transparent text-ink border border-ink hover:bg-ink/5",
	quiet: "bg-transparent text-graphite border border-transparent hover:text-ink",
	destructive: "bg-transparent text-seal border border-seal hover:bg-seal/10",
};

const SIZES: Record<ButtonSize, string> = {
	small: "h-8 px-3 text-sm gap-1.5",
	medium: "h-11 px-4 text-sm gap-2 md:h-10",
};

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
		<button
			type={type}
			className={cn(
				"inline-flex items-center justify-center rounded-sm font-medium",
				"transition-opacity duration-150",
				"disabled:cursor-not-allowed disabled:opacity-40",
				VARIANTS[variant],
				SIZES[size],
				className,
			)}
			{...rest}
		>
			{icon}
			{children}
		</button>
	);
}
