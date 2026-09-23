import { type ReactNode, useId } from "react";
import { cn } from "../lib/cn.ts";

export type SegmentedOption<T extends string> = {
	value: T;
	label: ReactNode;
};

export type SegmentedProps<T extends string> = {
	label: string;
	value: T;
	options: readonly SegmentedOption<T>[];
	onChange: (value: T) => void;
	className?: string;
};

/**
 * A short, exclusive choice that is always visible, for when hiding the options
 * behind a menu would hide the decision itself. Built on radio inputs, so the
 * keyboard and the screen reader already know what it is.
 */
export function Segmented<T extends string>({
	label,
	value,
	options,
	onChange,
	className,
}: SegmentedProps<T>) {
	const name = useId();

	return (
		<fieldset className={cn("flex flex-col gap-1.5", className)}>
			<legend className="mb-1.5 text-sm font-medium text-ink">{label}</legend>
			{/* A track with the chosen one raised out of it, which is what a switch looks
			    like everywhere else, so nobody has to learn this one. */}
			<div className="flex w-full gap-1 rounded-sm border border-lineStrong bg-sunken p-1">
				{options.map((option) => (
					<label
						key={option.value}
						className={cn(
							"flex flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm",
							"transition-colors duration-150",
							"has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
							option.value === value
								? "bg-panel font-medium text-ink shadow-sm"
								: "text-quiet hover:text-ink",
						)}
					>
						<input
							type="radio"
							name={name}
							value={option.value}
							checked={option.value === value}
							onChange={() => onChange(option.value)}
							className="sr-only"
						/>
						{option.label}
					</label>
				))}
			</div>
		</fieldset>
	);
}
