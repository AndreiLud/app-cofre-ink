// QIF, which is older than OFX and simpler than anything that replaced it.
//
// One letter per line says what the line is: D for the date, T for the total, P for
// who it was paid to, M for a memo, and a caret on its own ends the entry. It has no
// identifier and no currency, which is why an import from QIF leans on the fingerprint
// rather than on the file to avoid writing the same thing twice.

import type { CalendarDate } from "@cofre/core";
import { type DateOrder, guessDateOrder, readAmount, readDate, tidy } from "./text.ts";

export type QifEntry = {
	happenedOn: CalendarDate;
	amount: number;
	description: string;
	memo: string | null;
	checkNumber: string | null;
	/** What the file says the category is, which may be nothing we know. */
	category: string | null;
	cleared: boolean;
};

export type QifFile = {
	/** The header line, such as Type:Bank, when there is one. */
	kind: string | null;
	entries: QifEntry[];
};

export function readQif(text: string, order?: DateOrder): QifFile {
	const lines = text.split(/\r?\n/).map((line) => line.trimEnd());
	const dates = lines
		.filter((line) => line.startsWith("D"))
		.map((line) => line.slice(1).replace(/'/g, "/").trim());

	const dateOrder = order ?? guessDateOrder(dates);
	const file: QifFile = { kind: null, entries: [] };

	let current: Partial<QifEntry> = {};

	for (const line of lines) {
		if (line.trim() === "") continue;

		if (line.startsWith("!")) {
			if (line.toLowerCase().startsWith("!type:")) file.kind = line.slice(6).trim();
			continue;
		}

		if (line.startsWith("^")) {
			push(file, current);
			current = {};
			continue;
		}

		const letter = line[0];
		const value = line.slice(1).trim();

		switch (letter) {
			case "D": {
				// Some writers use an apostrophe where everybody else uses a slash.
				const day = readDate(value.replace(/'/g, "/"), dateOrder);
				if (day) current.happenedOn = day;
				break;
			}
			case "T":
			case "U": {
				const amount = readAmount(value);
				if (amount !== null) current.amount = amount;
				break;
			}
			case "P":
				current.description = tidy(value);
				break;
			case "M":
				current.memo = tidy(value);
				break;
			case "N":
				current.checkNumber = value;
				break;
			case "L":
				current.category = tidy(value);
				break;
			case "C":
				current.cleared = value.toUpperCase() === "X" || value.toUpperCase() === "R";
				break;
			default:
				break;
		}
	}

	push(file, current);
	return file;
}

function push(file: QifFile, entry: Partial<QifEntry>): void {
	if (entry.happenedOn === undefined || entry.amount === undefined) return;
	file.entries.push({
		happenedOn: entry.happenedOn,
		amount: entry.amount,
		description: entry.description ?? entry.memo ?? "",
		memo: entry.memo ?? null,
		checkNumber: entry.checkNumber ?? null,
		category: entry.category ?? null,
		cleared: entry.cleared ?? false,
	});
}
