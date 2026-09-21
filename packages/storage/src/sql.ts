// Small helpers for building portable SQL by hand.

/** Quotes an identifier the way both engines understand. */
export function quoted(identifier: string): string {
	if (!/^[a-z][a-z0-9_]*$/.test(identifier)) {
		throw new Error(`"${identifier}" is not a plain identifier, so it cannot be quoted safely`);
	}
	return `"${identifier}"`;
}

/** A list of question marks, one per value. */
export function marks(count: number): string {
	return new Array(count).fill("?").join(", ");
}

/** Turns a list of columns into the select clause, in a fixed order. */
export function columnList(columns: readonly string[]): string {
	return columns.map(quoted).join(", ");
}
