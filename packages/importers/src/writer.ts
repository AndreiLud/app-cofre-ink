// Writing a file somebody else can open.
//
// The reading side of this package works hard to accept whatever a bank sends. The
// writing side has the opposite job: pick one shape and stick to it. What it picks is
// the shape a spreadsheet in Brazil opens without a single question, because the file
// is for the person, not for another program.

/** One amount, written the way a spreadsheet here expects to read it. */
export function writeAmount(minorUnits: number, decimals = 2): string {
	const negative = minorUnits < 0;
	const digits = Math.abs(minorUnits)
		.toString()
		.padStart(decimals + 1, "0");
	const whole = digits.slice(0, digits.length - decimals);
	const rest = digits.slice(digits.length - decimals);
	const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
	return `${negative ? "-" : ""}${grouped},${rest}`;
}

function quote(value: string, delimiter: string): string {
	const needed =
		value.includes(delimiter) ||
		value.includes('"') ||
		value.includes("\n") ||
		value.includes("\r");
	return needed ? `"${value.replace(/"/g, '""')}"` : value;
}

export type WriteCsvOptions = {
	delimiter?: string;
	/**
	 * A spreadsheet opened by double click reads a file without the mark as if it were
	 * written in the local codepage, and every accent turns into rubble.
	 */
	byteOrderMark?: boolean;
};

/** A table as delimited text, with the header first. */
export function writeCsv(
	header: readonly string[],
	rows: readonly (readonly (string | number | null)[])[],
	options: WriteCsvOptions = {},
): string {
	const delimiter = options.delimiter ?? ";";
	const mark = options.byteOrderMark === false ? "" : "﻿";

	const lines = [header.map((name) => quote(name, delimiter)).join(delimiter)];
	for (const row of rows) {
		lines.push(
			row.map((value) => quote(value === null ? "" : String(value), delimiter)).join(delimiter),
		);
	}

	// Carriage return and line feed, because that is what a spreadsheet here expects.
	return `${mark}${lines.join("\r\n")}\r\n`;
}
