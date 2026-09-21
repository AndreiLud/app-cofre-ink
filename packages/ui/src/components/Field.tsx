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
};

export function Field({ label, hint, error, numeric = false, className, ...rest }: FieldProps) {
	const id = useId();
	const hintId = `${id}Hint`;
	const errorId = `${id}Error`;
	const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={id} className="text-sm font-medium text-ink">
				{label}
			</label>
			<input
				id={id}
				aria-describedby={describedBy === "" ? undefined : describedBy}
				aria-invalid={error ? true : undefined}
				className={cn(
					"h-11 rounded-sm border bg-raised px-3 text-base text-ink md:h-10 md:text-sm",
					"placeholder:text-graphite/70",
					error ? "border-seal" : "border-rule",
					numeric ? "text-right font-mono tabular-nums" : "",
					className,
				)}
				{...rest}
			/>
			{hint ? (
				<p id={hintId} className="text-xs text-graphite">
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
