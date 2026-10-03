// Which reader a document needs.
//
// Two shapes of paper arrive from a bank: a list of entries, which is a statement or a
// card invoice, and a single payment, which is a receipt. They are read differently
// because they say different things, and what tells them apart is what the first lines
// call themselves.

import {
	kindOf,
	type RecognisedDocument,
	type RecogniseOptions,
	recogniseStatement,
} from "./document.ts";
import { recogniseReceipt } from "./receipt.ts";

export type {
	DocumentKind,
	InstallmentMark,
	InvoiceConvention,
	RecognisedDocument,
	RecognisedEntry,
	RecogniseOptions,
} from "./document.ts";
export { installmentOf, kindOf, recogniseStatement } from "./document.ts";
export { recogniseReceipt } from "./receipt.ts";

export function recognise(
	lines: readonly string[],
	options: RecogniseOptions = {},
): RecognisedDocument {
	return options.kind === undefined && kindOf(lines) === "receipt"
		? recogniseReceipt(lines, options)
		: recogniseStatement(lines, options);
}
