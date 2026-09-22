import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "../lib/cn.ts";

export type TableProps = HTMLAttributes<HTMLTableElement> & {
	/** Read by assistive technology, so a table is never anonymous. */
	caption: ReactNode;
	/** Shows the caption on screen as well. */
	visibleCaption?: boolean;
};

/**
 * The table carries its own horizontal scroll. Without it, a narrow window turns a
 * wide table into a page that scrolls sideways as a whole, which moves the header and
 * the navigation with it and feels like the screen is broken.
 */
export function Table({
	caption,
	visibleCaption = false,
	className,
	children,
	...rest
}: TableProps) {
	return (
		<div className="w-full overflow-x-auto">
			<table className={cn("w-full min-w-0 border-collapse text-sm", className)} {...rest}>
				<caption
					className={cn("text-left text-sm text-graphite", visibleCaption ? "pb-2" : "sr-only")}
				>
					{caption}
				</caption>
				{children}
			</table>
		</div>
	);
}

export function TableHead({
	className,
	children,
	...rest
}: HTMLAttributes<HTMLTableSectionElement>) {
	return (
		<thead className={cn("border-b border-ink", className)} {...rest}>
			{children}
		</thead>
	);
}

export function TableBody({
	className,
	children,
	...rest
}: HTMLAttributes<HTMLTableSectionElement>) {
	return (
		<tbody className={cn("divide-y divide-rule", className)} {...rest}>
			{children}
		</tbody>
	);
}

export function TableRow({ className, children, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
	return (
		<tr className={cn("hover:bg-ink/[0.03]", className)} {...rest}>
			{children}
		</tr>
	);
}

export type CellProps = {
	/** Right aligns the content, which is how every amount is presented. */
	numeric?: boolean;
};

export function TableHeader({
	numeric = false,
	className,
	children,
	...rest
}: ThHTMLAttributes<HTMLTableCellElement> & CellProps) {
	return (
		<th
			scope="col"
			className={cn(
				"py-2 text-xs font-medium text-graphite",
				numeric ? "text-right" : "text-left",
				className,
			)}
			{...rest}
		>
			{children}
		</th>
	);
}

export function TableCell({
	numeric = false,
	className,
	children,
	...rest
}: TdHTMLAttributes<HTMLTableCellElement> & CellProps) {
	return (
		<td
			className={cn("py-2 align-baseline", numeric ? "text-right" : "text-left", className)}
			{...rest}
		>
			{children}
		</td>
	);
}
