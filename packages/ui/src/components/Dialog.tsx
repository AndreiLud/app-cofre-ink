import * as Primitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Icon } from "./Icon.tsx";

export type DialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	/** Read by assistive technology even when it is not shown. */
	description: string;
	showDescription?: boolean;
	children: ReactNode;
	footer?: ReactNode;
	/** The label of the control that closes it, since this component holds no copy. */
	closeLabel: string;
	size?: "small" | "medium" | "large";
	className?: string;
};

const SIZES = {
	small: "max-w-sm",
	medium: "max-w-lg",
	large: "max-w-2xl",
};

/**
 * Focus, the escape key, the scroll lock and the reading order come from Radix. What
 * is ours is the drawing: paper, a single rule under the title, no shadow.
 */
export function Dialog({
	open,
	onOpenChange,
	title,
	description,
	showDescription = true,
	children,
	footer,
	closeLabel,
	size = "medium",
	className,
}: DialogProps) {
	return (
		<Primitive.Root open={open} onOpenChange={onOpenChange}>
			<Primitive.Portal>
				<Primitive.Overlay className="fixed inset-0 z-40 bg-ink/40" />
				<Primitive.Content
					className={cn(
						"fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
						"border border-ink bg-paper p-5 text-ink",
						// A long form on a short window scrolls inside the dialog instead of
						// running off the bottom of the screen with its buttons.
						"flex max-h-[calc(100dvh-2rem)] flex-col overflow-y-auto overscroll-contain",
						SIZES[size],
						className,
					)}
				>
					<div className="mb-4 flex items-start justify-between gap-4 border-b border-rule pb-3">
						<div className="space-y-1">
							<Primitive.Title className="font-serif text-xl leading-tight">
								{title}
							</Primitive.Title>
							{showDescription ? (
								<Primitive.Description className="text-sm text-graphite">
									{description}
								</Primitive.Description>
							) : (
								<Primitive.Description className="sr-only">{description}</Primitive.Description>
							)}
						</div>
						<Primitive.Close
							aria-label={closeLabel}
							className="rounded-sm p-1 text-graphite hover:text-ink"
						>
							<Icon name="close" />
						</Primitive.Close>
					</div>
					{children}
					{footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
				</Primitive.Content>
			</Primitive.Portal>
		</Primitive.Root>
	);
}
