import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and lets a later utility win over an earlier one. */
export function cn(...values: ClassValue[]): string {
	return twMerge(clsx(values));
}
