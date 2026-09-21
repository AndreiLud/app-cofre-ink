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
			<div className="flex w-full">
				{options.map((option, index) => (
					<label
						key={option.value}
						className={cn(
							"flex flex-1 cursor-pointer items-center justify-center border border-rule px-3 py-2 text-sm",
							"has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink",
							index > 0 ? "border-l-0" : "",
							option.value === value
								? "bg-ink font-medium text-paper"
								: "bg-raised text-graphite hover:text-ink",
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
