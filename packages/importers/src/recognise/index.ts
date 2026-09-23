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
	RecognisedDocument,
	RecognisedEntry,
	RecogniseOptions,
} from "./document.ts";
export { kindOf, recogniseStatement } from "./document.ts";
export { recogniseReceipt } from "./receipt.ts";

export function recognise(
	lines: readonly string[],
	options: RecogniseOptions = {},
): RecognisedDocument {
	return kindOf(lines) === "receipt"
		? recogniseReceipt(lines, options)
		: recogniseStatement(lines, options);
}
