// From the drawing instructions of a page to lines of text.
//
// A PDF does not hold lines. It holds instructions that put runs of glyphs at places
// on a page, in whatever order the writer felt like, and a table in a statement is
// often written column by column. So every run is collected with where it landed, and
// then the runs that share a height become a line, read left to right.

import type { PdfDocument } from "./document.ts";
import {
	isArray,
	isBytes,
	isDict,
	isName,
	isOperator,
	numberOf,
	type PdfDict,
	PdfReader,
	type PdfValue,
} from "./syntax.ts";
import { readToUnicode, type Unicode } from "./toUnicode.ts";

export type TextRun = {
	page: number;
	x: number;
	y: number;
	size: number;
	text: string;
};

export type PdfLine = {
	page: number;
	y: number;
	text: string;
};

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(left: Matrix, right: Matrix): Matrix {
	return [
		left[0] * right[0] + left[1] * right[2],
		left[0] * right[1] + left[1] * right[3],
		left[2] * right[0] + left[3] * right[2],
		left[2] * right[1] + left[3] * right[3],
		left[4] * right[0] + left[5] * right[2] + right[4],
		left[4] * right[1] + left[5] * right[3] + right[5],
	];
}

/**
 * Windows 1252, which is what a font with no map of its own almost always means. The
 * range that differs from Latin 1 is the one with the quotation marks in it.
 */
const WINDOWS_1252: Record<number, string> = {
	128: "€",
	130: "‚",
	131: "ƒ",
	132: "„",
	133: "…",
	134: "†",
	135: "‡",
	136: "ˆ",
	137: "‰",
	138: "Š",
	139: "‹",
	140: "Œ",
	142: "Ž",
	145: "‘",
	146: "’",
	147: "“",
	148: "”",
	149: "•",
	150: "–",
	151: "—",
	152: "˜",
	153: "™",
	154: "š",
	155: "›",
	156: "œ",
	158: "ž",
	159: "Ÿ",
};

type Font = {
	unicode: Unicode | null;
	/** True for the fonts that write two bytes per glyph. */
	wide: boolean;
};

function fontsOf(document: PdfDocument, resources: PdfDict | null): Map<string, Font> {
	const fonts = new Map<string, Font>();
	if (!resources) return fonts;

	const table = document.dictOf(resources.entries.get("Font"));
	if (!table) return fonts;

	for (const [name, reference] of table.entries) {
		const font = document.dictOf(reference);
		if (!font) continue;

		const subtype = document.resolve(font.entries.get("Subtype"));
		const wide = isName(subtype) && subtype.value === "Type0";

		const stream = document.streamOf(font.entries.get("ToUnicode"));
		const unicode: Unicode | null = stream === null ? null : readToUnicode(stream);

		fonts.set(name, { unicode, wide: wide || (unicode?.width ?? 1) > 1 });
	}

	return fonts;
}

function lettersOf(bytes: readonly number[], font: Font | undefined): string {
	const wide = font?.wide === true;
	const map = font?.unicode?.map;

	let text = "";
	for (let index = 0; index < bytes.length; index += wide ? 2 : 1) {
		const code = wide ? ((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0) : (bytes[index] ?? 0);
		const mapped = map?.get(code);
		if (mapped !== undefined) {
			text += mapped;
			continue;
		}
		if (wide) {
			// A wide font with no map of its own: the code is usually the letter.
			text += code > 31 ? String.fromCharCode(code) : "";
			continue;
		}
		text += WINDOWS_1252[code] ?? String.fromCharCode(code);
	}
	return text;
}

/** Runs the instructions of one page and collects every run of text it draws. */
function runsOfPage(
	document: PdfDocument,
	content: string,
	resources: PdfDict | null,
	page: number,
): TextRun[] {
	const fonts = fontsOf(document, resources);
	const runs: TextRun[] = [];

	const reader = new PdfReader(content, 0);
	const stack: PdfValue[] = [];
	const graphics: Matrix[] = [];

	let ctm: Matrix = [...IDENTITY];
	let tm: Matrix = [...IDENTITY];
	let tlm: Matrix = [...IDENTITY];
	let font: Font | undefined;
	let size = 12;
	let leading = 0;
	let charSpacing = 0;
	let wordSpacing = 0;
	let horizontal = 1;

	const numbers = (count: number): number[] =>
		stack.slice(-count).map((value) => (typeof value === "number" ? value : 0));

	/** Where the text cursor is right now, on the page. */
	const place = (): { x: number; y: number; size: number } => {
		const full = multiply(tm, ctm);
		const scale = Math.sqrt(Math.abs(full[0] * full[3] - full[1] * full[2])) || 1;
		return { x: full[4], y: full[5], size: Math.abs(size * scale) };
	};

	const show = (bytes: readonly number[], adjustments: readonly number[] = []) => {
		const text = lettersOf(bytes, font);
		if (text === "") return;

		const at = place();
		runs.push({ page, x: at.x, y: at.y, size: at.size, text });

		// Moving the cursor along by the width of what was just drawn. The widths of
		// the glyphs are not read, so this is an estimate, and it is only ever used to
		// decide whether two runs are touching or have a gap between them.
		const estimate =
			text.length * size * 0.5 * horizontal +
			text.length * charSpacing +
			(text.split(" ").length - 1) * wordSpacing;
		const shift = adjustments.reduce((total, value) => total - (value / 1000) * size, 0);
		tm = multiply([1, 0, 0, 1, estimate + shift, 0], tm);
	};

	while (!reader.done) {
		const value = reader.read();
		if (value === undefined) break;

		if (!isOperator(value)) {
			stack.push(value);
			if (stack.length > 64) stack.shift();
			continue;
		}

		switch (value.name) {
			case "q":
				graphics.push([...ctm]);
				break;
			case "Q":
				ctm = graphics.pop() ?? [...IDENTITY];
				break;
			case "cm": {
				const [a, b, c, d, e, f] = numbers(6);
				ctm = multiply([a ?? 1, b ?? 0, c ?? 0, d ?? 1, e ?? 0, f ?? 0], ctm);
				break;
			}
			case "BT":
				tm = [...IDENTITY];
				tlm = [...IDENTITY];
				break;
			case "ET":
				break;
			case "Tf": {
				const chosen = stack[stack.length - 2];
				size =
					typeof stack[stack.length - 1] === "number" ? (stack[stack.length - 1] as number) : 12;
				font = isName(chosen) ? fonts.get(chosen.value) : undefined;
				break;
			}
			case "TL":
				leading = numbers(1)[0] ?? 0;
				break;
			case "Tc":
				charSpacing = numbers(1)[0] ?? 0;
				break;
			case "Tw":
				wordSpacing = numbers(1)[0] ?? 0;
				break;
			case "Tz":
				horizontal = (numbers(1)[0] ?? 100) / 100;
				break;
			case "Td": {
				const [x, y] = numbers(2);
				tlm = multiply([1, 0, 0, 1, x ?? 0, y ?? 0], tlm);
				tm = [...tlm];
				break;
			}
			case "TD": {
				const [x, y] = numbers(2);
				leading = -(y ?? 0);
				tlm = multiply([1, 0, 0, 1, x ?? 0, y ?? 0], tlm);
				tm = [...tlm];
				break;
			}
			case "Tm": {
				const [a, b, c, d, e, f] = numbers(6);
				tlm = [a ?? 1, b ?? 0, c ?? 0, d ?? 1, e ?? 0, f ?? 0];
				tm = [...tlm];
				break;
			}
			case "T*":
				tlm = multiply([1, 0, 0, 1, 0, -leading], tlm);
				tm = [...tlm];
				break;
			case "Tj":
			case "'":
			case '"': {
				if (value.name !== "Tj") {
					tlm = multiply([1, 0, 0, 1, 0, -leading], tlm);
					tm = [...tlm];
				}
				const last = stack[stack.length - 1];
				if (isBytes(last)) show(last.bytes);
				break;
			}
			case "TJ": {
				const last = stack[stack.length - 1];
				if (!isArray(last)) break;
				for (const item of last.items) {
					if (isBytes(item)) {
						show(item.bytes);
						continue;
					}
					if (typeof item === "number") {
						// A big backward step between two runs is how a space is written.
						if (item <= -120) show([0x20]);
						else tm = multiply([1, 0, 0, 1, -(item / 1000) * size * horizontal, 0], tm);
					}
				}
				break;
			}
			default:
				break;
		}

		stack.length = 0;
	}

	return runs;
}

/** Runs that share a height, read left to right, become one line. */
export function linesOf(runs: readonly TextRun[]): PdfLine[] {
	const byPage = new Map<number, TextRun[]>();
	for (const run of runs) {
		const list = byPage.get(run.page) ?? [];
		list.push(run);
		byPage.set(run.page, list);
	}

	const lines: PdfLine[] = [];

	for (const [page, list] of [...byPage.entries()].sort((left, right) => left[0] - right[0])) {
		const sorted = [...list].sort((left, right) => right.y - left.y || left.x - right.x);
		const groups: TextRun[][] = [];

		for (const run of sorted) {
			const current = groups[groups.length - 1];
			const first = current?.[0];
			const tolerance = Math.max(1.5, (first?.size ?? run.size) * 0.5);

			if (first && Math.abs(first.y - run.y) <= tolerance) current.push(run);
			else groups.push([run]);
		}

		for (const group of groups) {
			const ordered = [...group].sort((left, right) => left.x - right.x);
			let text = "";
			let endOfPrevious: number | null = null;

			for (const run of ordered) {
				const gap = endOfPrevious === null ? 0 : run.x - endOfPrevious;
				if (endOfPrevious !== null && gap > run.size * 0.2 && !text.endsWith(" ")) text += " ";
				text += run.text;
				endOfPrevious = run.x + run.text.length * run.size * 0.5;
			}

			const tidied = text.replace(/\s+/g, " ").trim();
			if (tidied !== "") lines.push({ page, y: ordered[0]?.y ?? 0, text: tidied });
		}
	}

	return lines;
}

function pagesOf(document: PdfDocument): { content: string; resources: PdfDict | null }[] {
	const pages: { content: string; resources: PdfDict | null }[] = [];

	const contentOf = (page: PdfDict): string => {
		const contents = page.entries.get("Contents");
		const parts: string[] = [];

		const add = (value: PdfValue | undefined) => {
			const stream = document.streamOf(value);
			if (stream !== null) parts.push(stream);
		};

		const resolved = document.resolve(contents);
		if (isArray(resolved)) {
			for (const item of resolved.items) add(item);
		} else {
			add(contents);
		}
		return parts.join("\n");
	};

	// The page tree says the order. Falling back to the order the objects were written
	// in is close enough when a file has no readable tree.
	const walk = (node: PdfDict, inherited: PdfDict | null, depth: number): void => {
		if (depth > 32) return;
		const type = document.resolve(node.entries.get("Type"));
		const resources = document.dictOf(node.entries.get("Resources")) ?? inherited;

		if (isName(type) && type.value === "Page") {
			pages.push({ content: contentOf(node), resources });
			return;
		}

		const kids = document.resolve(node.entries.get("Kids"));
		if (!isArray(kids)) return;
		for (const kid of kids.items) {
			const child = document.dictOf(kid);
			if (child) walk(child, resources, depth + 1);
		}
	};

	for (const object of document.objects.values()) {
		if (!isDict(object.value)) continue;
		const type = document.resolve(object.value.entries.get("Type"));
		if (isName(type) && type.value === "Catalog") {
			const root = document.dictOf(object.value.entries.get("Pages"));
			if (root) walk(root, null, 0);
			break;
		}
	}

	if (pages.length === 0) {
		for (const object of document.objects.values()) {
			if (!isDict(object.value)) continue;
			const type = document.resolve(object.value.entries.get("Type"));
			if (!isName(type) || type.value !== "Page") continue;
			pages.push({
				content: contentOf(object.value),
				resources: document.dictOf(object.value.entries.get("Resources")),
			});
		}
	}

	return pages;
}

export type PdfText = {
	pages: number;
	lines: PdfLine[];
};

/** Every line of text in the file, in the order somebody reading it would find them. */
export function textOf(document: PdfDocument): PdfText {
	const runs: TextRun[] = [];
	const pages = pagesOf(document);

	pages.forEach((page, index) => {
		if (page.content === "") return;
		runs.push(...runsOfPage(document, page.content, page.resources, index + 1));
	});

	return { pages: pages.length, lines: linesOf(runs) };
}

/** Reads a dictionary entry that has to be a number, for the callers that need one. */
export function entryNumber(dictionary: PdfDict, key: string): number | null {
	return numberOf(dictionary.entries.get(key));
}
