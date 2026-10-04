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
		// A fieldset grows to the width of what is in it unless told it may be narrower, and the
		// options would not wrap, so three long ones ("Com dinheiro de uma conta", "Com outro
		// cartão de crédito", "Parcelando") ran out of the dialog that pays an invoice, on a wide
		// screen as well. The group is as wide as its words where its column has the room, and
		// only narrower than them where the column is: then a long option breaks its line. Each
		// option starts from the width of its own words, so one with room never breaks; with the
		// same width for all, "Este espaço" broke beside a "Todos" with space to spare.
		<fieldset className={cn("flex min-w-[min(100%,max-content)] flex-col gap-1.5", className)}>
			<legend className="mb-1.5 text-sm font-medium text-ink">{label}</legend>
			{/* A track with the chosen one raised out of it, which is what a switch looks
			    like everywhere else, so nobody has to learn this one. */}
			<div className="flex w-full gap-1 rounded-sm border border-lineStrong bg-sunken p-1">
				{options.map((option) => (
					<label
						key={option.value}
						className={cn(
							"flex flex-auto cursor-pointer items-center justify-center text-balance rounded-sm px-3 py-1.5 text-center text-sm",
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
