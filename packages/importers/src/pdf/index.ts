// Reading a PDF, as far as the text and no further.
//
// This is the first of the layers registry 0016 describes: bytes to lines. Nothing
// here knows what a statement is. What it knows is that a PDF holds numbered objects,
// that some of those objects hold the instructions that draw a page, and that the
// instructions say where each run of text lands.
//
// What it does not do: images. A statement that is a photograph of a piece of paper
// comes back with no lines at all, and the layer above says so rather than pretending.

import { textOf } from "./content.ts";
import { readPdfObjects } from "./document.ts";

export { type BuildPdfOptions, buildPdf, drawLines, drawText } from "./buildPdf.ts";
export type { PdfLine, PdfText, TextRun } from "./content.ts";
export { linesOf } from "./content.ts";
export type { PdfDocument, PdfObject } from "./document.ts";
export { readPdfObjects } from "./document.ts";
export { readToUnicode, type Unicode } from "./toUnicode.ts";

/** True when these bytes are a PDF, which the first five of them say. */
export function looksLikePdf(bytes: Uint8Array): boolean {
	return (
		bytes[0] === 0x25 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x44 &&
		bytes[3] === 0x46 &&
		bytes[4] === 0x2d
	);
}

/** Every line of text in the file, top to bottom, page by page. */
export function readPdf(bytes: Uint8Array) {
	return textOf(readPdfObjects(bytes));
}
