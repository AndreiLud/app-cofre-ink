import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Icon, type IconName } from "./Icon.tsx";

export type EmptyStateProps = {
	title: ReactNode;
	/** Says what this place is for, in one line. */
	description: ReactNode;
	/** The way out, because an empty screen with no exit is a dead end. */
	action?: ReactNode;
	icon?: IconName;
	className?: string;
};

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
	return (
		// Centred, because an empty state is the whole of what is on the screen and a
		// paragraph pinned to the left of a wide panel reads as something missing.
		<div
			className={cn(
				"flex flex-col items-center gap-3 rounded-md bg-sunken px-5 py-10 text-center",
				className,
			)}
		>
			{icon ? <Icon name={icon} size="medium" className="text-quiet" /> : null}
			<div className="space-y-1">
				<p className="font-serif text-lg text-ink">{title}</p>
				<p className="mx-auto max-w-[46ch] text-sm leading-relaxed text-quiet">{description}</p>
			</div>
			{action ? <div className="pt-1">{action}</div> : null}
		</div>
	);
}

export type CalloutTone = "neutral" | "attention" | "problem";

export type CalloutProps = {
	tone?: CalloutTone;
	title?: ReactNode;
	children: ReactNode;
	action?: ReactNode;
	className?: string;
};

// A tint and an edge in the same family, so the three tell each other apart at a
// glance rather than by reading the words.
const TONES: Record<CalloutTone, string> = {
	neutral: "border-line bg-sunken",
	attention: "border-ochre/40 bg-amber/10",
	problem: "border-seal/40 bg-seal/10",
};

/** A short message about the state of things, never decorative. */
export function Callout({ tone = "neutral", title, children, action, className }: CalloutProps) {
	return (
		<div className={cn("rounded-md border px-4 py-3", TONES[tone], className)}>
			{title ? <p className="text-sm font-semibold text-ink">{title}</p> : null}
			<div className="text-sm leading-relaxed text-quiet">{children}</div>
			{action ? <div className="mt-3">{action}</div> : null}
		</div>
	);
}

export type SkeletonProps = {
	/** How many lines to draw, so the shape matches what is coming. */
	lines?: number;
	className?: string;
};

export function Skeleton({ lines = 3, className }: SkeletonProps) {
	return (
		<div className={cn("space-y-2", className)} aria-hidden="true">
			{Array.from({ length: lines }, (_unused, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: these have no identity of their own
					key={index}
					className="h-4 animate-pulse bg-ink/10"
					style={{ width: `${90 - index * 12}%` }}
				/>
			))}
		</div>
	);
}
