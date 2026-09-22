import * as Primitive from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type MenuProps = {
	trigger: ReactNode;
	children: ReactNode;
	align?: "start" | "center" | "end";
	className?: string;
};

export function Menu({ trigger, children, align = "start", className }: MenuProps) {
	return (
		<Primitive.Root>
			<Primitive.Trigger asChild={true}>{trigger}</Primitive.Trigger>
			<Primitive.Portal>
				<Primitive.Content
					align={align}
					sideOffset={6}
					className={cn(
						"z-50 min-w-56 rounded-md border border-line bg-panel p-1.5 text-ink shadow-lifted",
						"data-[state=open]:animate-none",
						className,
					)}
				>
					{children}
				</Primitive.Content>
			</Primitive.Portal>
		</Primitive.Root>
	);
}

export type MenuItemProps = {
	onSelect: () => void;
	children: ReactNode;
	/** Sits at the right end, for a shortcut or a state. */
	detail?: ReactNode;
	selected?: boolean;
	className?: string;
};

export function MenuItem({ onSelect, children, detail, selected, className }: MenuItemProps) {
	return (
		<Primitive.Item
			onSelect={onSelect}
			className={cn(
				"flex cursor-pointer items-center justify-between gap-3 px-2 py-1.5 text-sm outline-none",
				"rounded-sm data-[highlighted]:bg-accentSoft data-[highlighted]:text-ink",
				selected ? "font-medium" : "",
				className,
			)}
		>
			<span className="flex items-center gap-2">{children}</span>
			{detail ? <span className="text-xs opacity-70">{detail}</span> : null}
		</Primitive.Item>
	);
}

export function MenuSeparator() {
	return <Primitive.Separator className="my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
	return <Primitive.Label className="px-2 py-1 text-xs text-quiet">{children}</Primitive.Label>;
}
