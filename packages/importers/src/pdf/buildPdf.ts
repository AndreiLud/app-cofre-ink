// Writing a small PDF, so the reader can be checked against a real one.
//
// A reader tested against text that no PDF writer ever produced is a reader tested
// against itself. This writes the same shape a small writer does: a catalogue, a page
// tree, one page and one stream of instructions, with the option of packing the stream
// and of giving the font a map of its own.
//
// It is here rather than in a test file because it is the fixture for every test that
// touches a document, and because anybody checking this reader against their own bank
// will want to start from something that is known to work.

import { strToU8, zlibSync } from "fflate";

export type BuildPdfOptions = {
	/** The instructions that draw the page. */
	content: string;
	compress?: boolean;
	/** A map from the codes in the strings to the letters they stand for. */
	toUnicode?: string;
	/** True for a font that writes two bytes per glyph. */
	wide?: boolean;
};

export function buildPdf(options: BuildPdfOptions): Uint8Array {
	const encoder = new TextEncoder();
	const parts: Uint8Array[] = [];
	let length = 0;
	let count = 0;

	const push = (text: string | Uint8Array) => {
		const bytes = typeof text === "string" ? encoder.encode(text) : text;
		parts.push(bytes);
		length += bytes.length;
	};

	const object = (number: number, body: string, stream?: Uint8Array) => {
		count = Math.max(count, number);
		push(`${number} 0 obj\n${body}\n`);
		if (stream) {
			push("stream\n");
			push(stream);
			push("\nendstream\n");
		}
		push("endobj\n");
	};

	push("%PDF-1.7\n");

	const raw = strToU8(options.content);
	const body = options.compress ? zlibSync(raw) : raw;
	const filter = options.compress ? " /Filter /FlateDecode" : "";

	object(1, "<< /Type /Catalog /Pages 2 0 R >>");
	object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
	object(
		3,
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
	);
	object(4, `<< /Length ${body.length}${filter} >>`, body);

	if (options.toUnicode) {
		const map = strToU8(options.toUnicode);
		object(
			5,
			`<< /Type /Font /Subtype ${options.wide ? "/Type0" : "/Type1"} /BaseFont /AAAAAA+Helvetica /ToUnicode 6 0 R >>`,
		);
		object(6, `<< /Length ${map.length} >>`, map);
	} else {
		object(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
	}

	push(`trailer\n<< /Size ${count + 1} /Root 1 0 R >>\n%%EOF\n`);

	const file = new Uint8Array(length);
	let at = 0;
	for (const part of parts) {
		file.set(part, at);
		at += part.length;
	}
	return file;
}

/** One run of text at a place on the page, the way a writer emits it. */
export function drawText(x: number, y: number, text: string, size = 10): string {
	return `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${text.replace(/([()\\])/g, "\\$1")}) Tj ET\n`;
}

/**
 * A page of lines, each one under the last, which is what a statement looks like once
 * the columns have been placed.
 */
export function drawLines(
	lines: readonly string[],
	options: { top?: number; step?: number } = {},
): string {
	const top = options.top ?? 780;
	const step = options.step ?? 20;
	return lines.map((line, index) => drawText(50, top - index * step, line)).join("");
}
