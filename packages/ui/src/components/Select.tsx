import { type ReactNode, type SelectHTMLAttributes, useId } from "react";
import { cn } from "../lib/cn.ts";

export type SelectOption = {
	value: string;
	label: string;
	/**
	 * The heading the option sits under, as an `optgroup`. Options next to each other with the
	 * same heading share one; an option with none sits on its own. A current account and a
	 * credit card can carry the same name, and the heading is what tells them apart.
	 */
	group?: string;
};

/** The options in their order, with the ones next to each other under one heading together. */
function inGroups(options: readonly SelectOption[]) {
	const runs: { group: string | undefined; options: SelectOption[] }[] = [];
	for (const option of options) {
		const last = runs[runs.length - 1];
		if (last && last.group === option.group) last.options.push(option);
		else runs.push({ group: option.group, options: [option] });
	}
	return runs;
}

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
					// Switched off still has to look switched off, and the hint under it says why.
					"disabled:cursor-not-allowed disabled:opacity-60",
					error ? "border-seal" : "border-lineStrong",
					className,
				)}
				{...rest}
			>
				{inGroups(options).map((run) =>
					run.group === undefined ? (
						run.options.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))
					) : (
						// The first option names the run: a value appears once in a list.
						<optgroup key={`group:${run.options[0]?.value ?? ""}`} label={run.group}>
							{run.options.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</optgroup>
					),
				)}
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
