import {
	ArrowRightLeft,
	Calendar,
	ChartColumn,
	Check,
	ChevronDown,
	Eye,
	EyeOff,
	House,
	type LucideIcon,
	Moon,
	Plus,
	ReceiptText,
	Search,
	Settings,
	SlidersHorizontal,
	Sun,
	Target,
	Trash2,
	Wallet,
	X,
} from "lucide-react";
import { cn } from "../lib/cn.ts";

/**
 * The icon set of the product, in one place. Anything not listed here does not exist
 * in the interface yet, which is what keeps the drawing consistent.
 */
const REGISTRY = {
	calendar: Calendar,
	chart: ChartColumn,
	home: House,
	records: ReceiptText,
	target: Target,
	check: Check,
	chevronDown: ChevronDown,
	close: X,
	filter: SlidersHorizontal,
	eye: Eye,
	eyeOff: EyeOff,
	moon: Moon,
	plus: Plus,
	search: Search,
	settings: Settings,
	sun: Sun,
	transfer: ArrowRightLeft,
	trash: Trash2,
	wallet: Wallet,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof REGISTRY;

export type IconProps = {
	name: IconName;
	size?: "small" | "medium";
	/** Given only when the icon is the whole message, which is rare. */
	title?: string;
	className?: string;
};

export function Icon({ name, size = "small", title, className }: IconProps) {
	const Glyph = REGISTRY[name];
	return (
		<Glyph
			strokeWidth={1.5}
			aria-hidden={title === undefined ? true : undefined}
			aria-label={title}
			role={title === undefined ? undefined : "img"}
			className={cn(size === "small" ? "size-4" : "size-5", className)}
		/>
	);
}
