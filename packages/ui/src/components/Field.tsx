import { type InputHTMLAttributes, type ReactNode, useId } from "react";
import { cn } from "../lib/cn.ts";

export type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
	label: ReactNode;
	/** Explains the field before the person makes a mistake. */
	hint?: ReactNode;
	/** Says what happened and how to fix it, never just "invalid". */
	error?: ReactNode;
	/** Right aligns and uses the monospaced face, for amounts. */
	numeric?: boolean;
	/**
	 * A button that belongs to this field, on the same line as the input.
	 *
	 * Put outside, it lines up with the bottom of the hint rather than with the input,
	 * which is why it is offered here instead of being arranged by every caller.
	 */
	action?: ReactNode;
};

export function Field({
	label,
	hint,
	error,
	numeric = false,
	action,
	className,
	...rest
}: FieldProps) {
	const id = useId();
	const hintId = `${id}Hint`;
	const errorId = `${id}Error`;
	const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={id} className="text-sm font-medium text-ink">
				{label}
			</label>
			<div className={action ? "flex items-center gap-2" : "contents"}>
				<input
					id={id}
					aria-describedby={describedBy === "" ? undefined : describedBy}
					aria-invalid={error ? true : undefined}
					className={cn(
						// Sunken below the panel, with an edge strong enough to say that
						// something goes in here. The old one shared a border with the
						// rules between table rows, which is why nothing looked fillable.
						"h-11 rounded-sm border bg-sunken px-3 text-base text-ink",
						"transition-colors duration-150 placeholder:text-quiet",
						"focus:border-accent focus:bg-panel",
						error ? "border-seal" : "border-lineStrong",
						numeric ? "text-right font-mono tabular-nums" : "",
						action ? "min-w-0 grow" : "",
						className,
					)}
					{...rest}
				/>
				{action}
			</div>
			{hint ? (
				<p id={hintId} className="text-xs leading-relaxed text-quiet">
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
