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
		<div
			className={cn(
				"flex flex-col items-start gap-3 border border-dashed border-rule px-5 py-8",
				className,
			)}
		>
			{icon ? <Icon name={icon} size="medium" className="text-graphite" /> : null}
			<div className="space-y-1">
				<p className="font-serif text-lg text-ink">{title}</p>
				<p className="max-w-[55ch] text-sm text-graphite">{description}</p>
			</div>
			{action}
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

const TONES: Record<CalloutTone, string> = {
	neutral: "border-rule",
	attention: "border-ochre",
	problem: "border-seal",
};

/** A short message about the state of things, never decorative. */
export function Callout({ tone = "neutral", title, children, action, className }: CalloutProps) {
	return (
		<div className={cn("border-l-2 bg-raised px-4 py-3", TONES[tone], className)}>
			{title ? <p className="text-sm font-semibold text-ink">{title}</p> : null}
			<div className="text-sm text-graphite">{children}</div>
			{action ? <div className="mt-2">{action}</div> : null}
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
