// Delimited text, which is what every bank can export and half of them get wrong.
//
// Written by hand rather than with a library because the hard part is not the parsing,
// it is the guessing: which character separates the columns, where the header really
// starts, and which of the columns is the amount. A library would do the easy half.

export type CsvTable = {
	/** The row that names the columns, when one was found. */
	header: string[];
	rows: string[][];
	delimiter: string;
	/** Lines above the header, which banks fill with the name of the account. */
	preamble: string[];
};

const DELIMITERS = [",", ";", "\t", "|"];

/**
 * The character that separates the columns.
 *
 * Counting occurrences is not enough: a description full of commas would win. What
 * decides is which character splits the most lines into the same number of parts,
 * because that is what a table is.
 */
export function guessDelimiter(text: string): string {
	const lines = text
		.split(/\r?\n/)
		.filter((line) => line.trim() !== "")
		.slice(0, 20);
	if (lines.length === 0) return ",";

	let best = ",";
	let bestScore = -1;

	for (const delimiter of DELIMITERS) {
		const counts = lines.map((line) => splitLine(line, delimiter).length);
		const common = counts.reduce<Map<number, number>>((seen, count) => {
			if (count > 1) seen.set(count, (seen.get(count) ?? 0) + 1);
			return seen;
		}, new Map());

		for (const [columns, times] of common) {
			const score = times * columns;
			if (score > bestScore) {
				bestScore = score;
				best = delimiter;
			}
		}
	}

	return best;
}

/** One line into fields, honouring quotes and the doubled quote inside them. */
export function splitLine(line: string, delimiter: string): string[] {
	const fields: string[] = [];
	let current = "";
	let quoted = false;

	for (let index = 0; index < line.length; index += 1) {
		const character = line[index];

		if (quoted) {
			if (character === '"') {
				if (line[index + 1] === '"') {
					current += '"';
					index += 1;
				} else {
					quoted = false;
				}
			} else {
				current += character;
			}
			continue;
		}

		if (character === '"') {
			quoted = true;
			continue;
		}
		if (character === delimiter) {
			fields.push(current);
			current = "";
			continue;
		}
		current += character;
	}

	fields.push(current);
	return fields.map((field) => field.trim());
}

/** Splits the text into lines, keeping a line break that sits inside quotes. */
function toLines(text: string): string[] {
	const lines: string[] = [];
	let current = "";
	let quoted = false;

	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];

		if (character === '"') {
			quoted = !quoted;
			current += character;
			continue;
		}
		if (!quoted && (character === "\n" || character === "\r")) {
			if (character === "\r" && text[index + 1] === "\n") index += 1;
			lines.push(current);
			current = "";
			continue;
		}
		current += character;
	}

	if (current !== "") lines.push(current);
	return lines;
}

export type CsvOptions = { delimiter?: string };

/**
 * Reads the table.
 *
 * The header is the first line that has as many fields as the lines under it, which is
 * how a file that opens with the name of the bank and the number of the account still
 * reads correctly.
 */
export function readCsv(text: string, options: CsvOptions = {}): CsvTable {
	const delimiter = options.delimiter ?? guessDelimiter(text);
	const lines = toLines(text).filter((line) => line.trim() !== "");
	const split = lines.map((line) => splitLine(line, delimiter));

	if (split.length === 0) {
		return { header: [], rows: [], delimiter, preamble: [] };
	}

	const widths = split.map((fields) => fields.length);
	const table = widths.reduce((most, width) => Math.max(most, width), 0);

	let headerAt = widths.indexOf(table);
	if (headerAt < 0) headerAt = 0;

	// A line of numbers is data, not a header. When the first full line looks like
	// data, the table has no header at all and the columns are named by position.
	const candidate = split[headerAt] ?? [];
	const looksLikeData = candidate.filter((field) => /^[\d\s.,/-]+$/.test(field)).length > 1;

	return {
		header: looksLikeData ? [] : candidate,
		rows: split.slice(looksLikeData ? headerAt : headerAt + 1).filter((row) => row.length > 1),
		delimiter,
		preamble: lines.slice(0, headerAt),
	};
}
