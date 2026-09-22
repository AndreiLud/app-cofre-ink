// What the bytes of a string mean as letters.
//
// A font in a PDF does not have to use any encoding anybody has heard of. A subset
// font, which is what a bank statement is full of, often numbers its glyphs from one.
// The file then carries a map from those numbers to letters, and without reading it
// the text comes out as nonsense that looks like text.

export type Unicode = {
	/** Code to the letters it stands for. */
	map: Map<number, string>;
	/** How many bytes one code takes, which the code space range declares. */
	width: number;
};

function fromUtf16(hex: string): string {
	let text = "";
	for (let index = 0; index + 3 < hex.length + 1; index += 4) {
		const unit = Number.parseInt(hex.slice(index, index + 4), 16);
		if (Number.isFinite(unit)) text += String.fromCharCode(unit);
	}
	return text;
}

const HEX = /<([\da-f]*)>/gi;

function hexes(text: string): string[] {
	HEX.lastIndex = 0;
	const found: string[] = [];
	let match = HEX.exec(text);
	while (match) {
		found.push(match[1] ?? "");
		match = HEX.exec(text);
	}
	return found;
}

/** Reads the map a font carries, in the little language those maps are written in. */
export function readToUnicode(stream: string): Unicode {
	const map = new Map<number, string>();
	let width = 1;

	const space = /begincodespacerange([\s\S]*?)endcodespacerange/i.exec(stream);
	if (space) {
		const first = hexes(space[1] ?? "")[0] ?? "";
		if (first.length >= 4) width = Math.max(1, Math.floor(first.length / 2));
	}

	for (const block of stream.matchAll(/beginbfchar([\s\S]*?)endbfchar/gi)) {
		const values = hexes(block[1] ?? "");
		for (let index = 0; index + 1 < values.length; index += 2) {
			const code = Number.parseInt(values[index] ?? "", 16);
			if (!Number.isFinite(code)) continue;
			map.set(code, fromUtf16(values[index + 1] ?? ""));
			if ((values[index] ?? "").length >= 4) width = Math.max(width, 2);
		}
	}

	for (const block of stream.matchAll(/beginbfrange([\s\S]*?)endbfrange/gi)) {
		const body = block[1] ?? "";
		// Two shapes: a range that lands on one letter and counts up, and a range that
		// lists a letter for each code.
		for (const line of body.split(/[\r\n]+/)) {
			const listed = /<([\da-f]+)>\s*<([\da-f]+)>\s*\[([\s\S]*?)\]/i.exec(line);
			if (listed) {
				const from = Number.parseInt(listed[1] ?? "", 16);
				const letters = hexes(listed[3] ?? "");
				letters.forEach((letter, offset) => {
					map.set(from + offset, fromUtf16(letter));
				});
				if ((listed[1] ?? "").length >= 4) width = Math.max(width, 2);
				continue;
			}

			const counted = /<([\da-f]+)>\s*<([\da-f]+)>\s*<([\da-f]+)>/i.exec(line);
			if (!counted) continue;

			const from = Number.parseInt(counted[1] ?? "", 16);
			const to = Number.parseInt(counted[2] ?? "", 16);
			const start = counted[3] ?? "";
			if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) continue;
			if ((counted[1] ?? "").length >= 4) width = Math.max(width, 2);

			const base = Number.parseInt(start.slice(-4), 16);
			const prefix = fromUtf16(start.slice(0, Math.max(0, start.length - 4)));
			// A range longer than a page of text is a file saying something is wrong.
			for (let code = from; code <= Math.min(to, from + 65_535); code += 1) {
				map.set(code, prefix + String.fromCharCode(base + (code - from)));
			}
		}
	}

	return { map, width };
}
