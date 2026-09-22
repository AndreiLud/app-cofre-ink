// Which column is which.
//
// Every bank names its columns differently and some name them nothing at all. The
// guesser below reads the header when there is one and the values when there is not,
// and whatever it decides is shown to the person before anything is written, because a
// column read as the wrong thing is money in the wrong place.

import { type DateOrder, guessDateOrder, readAmount, readDate } from "./text.ts";

export type FieldName =
	| "happenedOn"
	| "description"
	| "amount"
	/** Some exports split the two directions into two columns. */
	| "debit"
	| "credit"
	| "notes"
	| "externalId"
	| "category"
	| "ignore";

export type ColumnMapping = {
	/** One entry per column of the file, in order. */
	fields: FieldName[];
	dateOrder: DateOrder;
};

const WORDS: { field: FieldName; words: string[] }[] = [
	{
		field: "happenedOn",
		words: ["data", "date", "dia", "datamovimento", "datalancamento", "posted", "dtposted"],
	},
	{
		field: "description",
		words: [
			"descricao",
			"description",
			"historico",
			"lancamento",
			"memo",
			"detalhe",
			"payee",
			"estabelecimento",
			"titulo",
		],
	},
	{ field: "amount", words: ["valor", "amount", "montante", "quantia", "total", "value"] },
	{ field: "debit", words: ["debito", "debit", "saida", "despesa", "pagamento", "withdrawal"] },
	{ field: "credit", words: ["credito", "credit", "entrada", "receita", "deposit"] },
	{ field: "notes", words: ["observacao", "obs", "notes", "nota", "complemento"] },
	{ field: "externalId", words: ["id", "identificador", "fitid", "documento", "docto"] },
	{ field: "category", words: ["categoria", "category", "classificacao"] },
];

function fold(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

function fromHeader(name: string): FieldName | null {
	const folded = fold(name);
	if (folded === "") return null;

	for (const { field, words } of WORDS) {
		if (words.includes(folded)) return field;
	}
	for (const { field, words } of WORDS) {
		if (words.some((word) => folded.includes(word))) return field;
	}
	return null;
}

/** What a column looks like when nobody named it. */
function fromValues(values: readonly string[]): FieldName {
	const filled = values.filter((value) => value.trim() !== "");
	if (filled.length === 0) return "ignore";

	const dates = filled.filter((value) => readDate(value) !== null).length;
	if (dates >= filled.length * 0.8) return "happenedOn";

	const amounts = filled.filter((value) => readAmount(value) !== null).length;
	if (amounts >= filled.length * 0.8) return "amount";

	const words = filled.filter((value) => /[a-z]/i.test(value)).length;
	if (words >= filled.length * 0.5) return "description";

	return "ignore";
}

/**
 * Reads the header and the first rows and says what each column is.
 *
 * A column named in the header wins over one guessed from its values, and a field
 * claimed twice goes to the first column that claimed it, because a second date column
 * is almost always the day the bank processed it rather than the day it happened.
 */
export function guessMapping(header: readonly string[], rows: readonly string[][]): ColumnMapping {
	const width = Math.max(header.length, ...rows.map((row) => row.length), 0);
	const taken = new Set<FieldName>();
	const fields: FieldName[] = [];

	for (let index = 0; index < width; index += 1) {
		const named = header[index] ? fromHeader(header[index] ?? "") : null;
		const values = rows.map((row) => row[index] ?? "");
		const guessed = named ?? fromValues(values);

		if (guessed !== "ignore" && taken.has(guessed)) {
			fields.push("ignore");
			continue;
		}
		if (guessed !== "ignore") taken.add(guessed);
		fields.push(guessed);
	}

	const dateColumn = fields.indexOf("happenedOn");
	const dateOrder =
		dateColumn < 0 ? "dayFirst" : guessDateOrder(rows.map((row) => row[dateColumn] ?? ""));

	return { fields, dateOrder };
}

export type MappedRow = {
	happenedOn: string | null;
	description: string;
	amount: number | null;
	notes: string | null;
	externalId: string | null;
	category: string | null;
};

/** One row of the file, read through the mapping. */
export function applyMapping(row: readonly string[], mapping: ColumnMapping): MappedRow {
	const value = (field: FieldName) => {
		const index = mapping.fields.indexOf(field);
		return index < 0 ? "" : (row[index] ?? "");
	};

	const debit = readAmount(value("debit"));
	const credit = readAmount(value("credit"));
	const plain = readAmount(value("amount"));

	// Two columns means the direction is the column, not the sign somebody typed.
	const amount =
		debit !== null && debit !== 0
			? -Math.abs(debit)
			: credit !== null && credit !== 0
				? Math.abs(credit)
				: plain;

	return {
		happenedOn: readDate(value("happenedOn"), mapping.dateOrder),
		description: value("description").trim(),
		amount,
		notes: value("notes").trim() === "" ? null : value("notes").trim(),
		externalId: value("externalId").trim() === "" ? null : value("externalId").trim(),
		category: value("category").trim() === "" ? null : value("category").trim(),
	};
}
