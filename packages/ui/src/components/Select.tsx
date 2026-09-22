import { type ReactNode, type SelectHTMLAttributes, useId } from "react";
import { cn } from "../lib/cn.ts";

export type SelectOption = {
	value: string;
	label: string;
};

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "children"> & {
	label: ReactNode;
	options: readonly SelectOption[];
	hint?: ReactNode;
	error?: ReactNode;
};

/**
 * The native control, on purpose. It already knows the keyboard, the screen reader and
 * the phone, and a rebuilt one would only look different.
 */
export function Select({ label, options, hint, error, className, ...rest }: SelectProps) {
	const id = useId();
	const hintId = `${id}Hint`;
	const errorId = `${id}Error`;
	const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={id} className="text-sm font-medium text-ink">
				{label}
			</label>
			<select
				id={id}
				aria-describedby={describedBy === "" ? undefined : describedBy}
				aria-invalid={error ? true : undefined}
				className={cn(
					"h-11 rounded-sm border bg-sunken px-3 text-base text-ink",
					"transition-colors duration-150 focus:border-accent focus:bg-panel",
					error ? "border-seal" : "border-lineStrong",
					className,
				)}
				{...rest}
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
			{hint ? (
				<p id={hintId} className="text-xs text-quiet">
					{hint}
				</p>
			) : null}
			{error ? (
				<p id={errorId} className="text-xs text-seal">
					{error}
				</p>
			) : null}
		</div>
	);
}
