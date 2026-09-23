// The shapes a PDF file is made of.
//
// A PDF is a set of numbered objects written in a small syntax: numbers, names,
// strings, arrays, dictionaries and references to other objects. Everything else in
// this folder is built on the reader below, which walks that syntax one value at a
// time.
//
// The file is read as one character per byte, so a position in the text is a position
// in the file and a string object keeps the exact bytes the file held. What those bytes
// mean as letters is decided later, by the font that shows them.

export type PdfName = { kind: "name"; value: string };
export type PdfRef = { kind: "ref"; number: number; generation: number };
export type PdfDict = { kind: "dict"; entries: Map<string, PdfValue> };
export type PdfArray = { kind: "array"; items: PdfValue[] };
/** A string object, kept as the bytes that were written. */
export type PdfBytes = { kind: "bytes"; bytes: number[] };
/** A word that is not a value: an operator inside a content stream. */
export type PdfOperator = { kind: "operator"; name: string };

export type PdfValue =
	| PdfName
	| PdfRef
	| PdfDict
	| PdfArray
	| PdfBytes
	| PdfOperator
	| number
	| boolean
	| null;

const SPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITER = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"]);

export function isSpace(code: number): boolean {
	return SPACE.has(code);
}

/** One character per byte, so an offset in this text is an offset in the file. */
export function asLatin1(bytes: Uint8Array): string {
	let text = "";
	// In chunks, because spreading a whole file into one call overflows the stack.
	for (let start = 0; start < bytes.length; start += 8192) {
		text += String.fromCharCode(...bytes.subarray(start, start + 8192));
	}
	return text;
}

export function isDict(value: PdfValue | undefined): value is PdfDict {
	return typeof value === "object" && value !== null && value.kind === "dict";
}

export function isName(value: PdfValue | undefined): value is PdfName {
	return typeof value === "object" && value !== null && value.kind === "name";
}

export function isArray(value: PdfValue | undefined): value is PdfArray {
	return typeof value === "object" && value !== null && value.kind === "array";
}

export function isRef(value: PdfValue | undefined): value is PdfRef {
	return typeof value === "object" && value !== null && value.kind === "ref";
}

export function isBytes(value: PdfValue | undefined): value is PdfBytes {
	return typeof value === "object" && value !== null && value.kind === "bytes";
}

export function isOperator(value: PdfValue | undefined): value is PdfOperator {
	return typeof value === "object" && value !== null && value.kind === "operator";
}

/** Reads values out of the text of a PDF, or out of one of its streams. */
export class PdfReader {
	constructor(
		readonly source: string,
		public at = 0,
	) {}

	get done(): boolean {
		return this.at >= this.source.length;
	}

	skipSpace(): void {
		while (this.at < this.source.length) {
			const code = this.source.charCodeAt(this.at);
			if (isSpace(code)) {
				this.at += 1;
				continue;
			}
			// A comment runs to the end of the line and is not part of anything.
			if (this.source[this.at] === "%") {
				while (this.at < this.source.length && !"\r\n".includes(this.source[this.at] ?? "")) {
					this.at += 1;
				}
				continue;
			}
			return;
		}
	}

	/** The next value, or nothing when the text is spent. */
	read(): PdfValue | undefined {
		this.skipSpace();
		if (this.done) return undefined;

		const here = this.source[this.at] ?? "";

		if (here === "/") return this.readName();
		if (here === "(") return this.readString();
		if (here === "[") return this.readArray();
		if (here === "<") {
			return this.source[this.at + 1] === "<" ? this.readDict() : this.readHexString();
		}
		if (here === ")" || here === ">" || here === "]" || here === "}" || here === "{") {
			// Nothing opens with these. Stepping over one keeps a damaged file readable.
			this.at += 1;
			return this.read();
		}
		if (/[+\-.\d]/.test(here)) return this.readNumberOrRef();
		return this.readWord();
	}

	private readName(): PdfName {
		this.at += 1;
		let value = "";
		while (this.at < this.source.length) {
			const character = this.source[this.at] ?? "";
			if (isSpace(character.charCodeAt(0)) || DELIMITER.has(character)) break;
			if (character === "#") {
				const hex = this.source.slice(this.at + 1, this.at + 3);
				value += String.fromCharCode(Number.parseInt(hex, 16) || 0);
				this.at += 3;
				continue;
			}
			value += character;
			this.at += 1;
		}
		return { kind: "name", value };
	}

	private readString(): PdfBytes {
		this.at += 1;
		const bytes: number[] = [];
		let depth = 1;

		while (this.at < this.source.length) {
			const character = this.source[this.at] ?? "";
			this.at += 1;

			if (character === "\\") {
				const next = this.source[this.at] ?? "";
				this.at += 1;
				if (next === "n") bytes.push(0x0a);
				else if (next === "r") bytes.push(0x0d);
				else if (next === "t") bytes.push(0x09);
				else if (next === "b") bytes.push(0x08);
				else if (next === "f") bytes.push(0x0c);
				else if (next === "\n") continue;
				else if (next === "\r") {
					if (this.source[this.at] === "\n") this.at += 1;
					continue;
				} else if (next >= "0" && next <= "7") {
					let digits = next;
					while (digits.length < 3) {
						const following = this.source[this.at] ?? "";
						if (following < "0" || following > "7") break;
						digits += following;
						this.at += 1;
					}
					bytes.push(Number.parseInt(digits, 8) & 0xff);
				} else {
					bytes.push(next.charCodeAt(0));
				}
				continue;
			}

			if (character === "(") depth += 1;
			if (character === ")") {
				depth -= 1;
				if (depth === 0) break;
			}
			bytes.push(character.charCodeAt(0) & 0xff);
		}

		return { kind: "bytes", bytes };
	}

	private readHexString(): PdfBytes {
		this.at += 1;
		let digits = "";
		while (this.at < this.source.length && this.source[this.at] !== ">") {
			const character = this.source[this.at] ?? "";
			if (/[\da-f]/i.test(character)) digits += character;
			this.at += 1;
		}
		this.at += 1;

		if (digits.length % 2 === 1) digits += "0";
		const bytes: number[] = [];
		for (let index = 0; index < digits.length; index += 2) {
			bytes.push(Number.parseInt(digits.slice(index, index + 2), 16));
		}
		return { kind: "bytes", bytes };
	}

	private readArray(): PdfArray {
		this.at += 1;
		const items: PdfValue[] = [];
		while (true) {
			this.skipSpace();
			if (this.done) break;
			if (this.source[this.at] === "]") {
				this.at += 1;
				break;
			}
			const value = this.read();
			if (value === undefined) break;
			items.push(value);
		}
		return { kind: "array", items };
	}

	private readDict(): PdfDict {
		this.at += 2;
		const entries = new Map<string, PdfValue>();

		while (true) {
			this.skipSpace();
			if (this.done) break;
			if (this.source.startsWith(">>", this.at)) {
				this.at += 2;
				break;
			}
			const key = this.read();
			if (key === undefined) break;
			if (!isName(key)) continue;
			const value = this.read();
			if (value === undefined) break;
			entries.set(key.value, value);
		}

		return { kind: "dict", entries };
	}

	/**
	 * A number, or a reference. "12 0 R" is three tokens and one value, so the reader
	 * looks ahead and puts the position back when what follows is not a reference.
	 */
	private readNumberOrRef(): PdfValue {
		const first = this.readNumber();
		if (!Number.isInteger(first) || first < 0) return first;

		const mark = this.at;
		this.skipSpace();
		if (!/\d/.test(this.source[this.at] ?? "")) {
			this.at = mark;
			return first;
		}

		const second = this.readNumber();
		this.skipSpace();
		if (this.source[this.at] === "R" && !/[a-z\d]/i.test(this.source[this.at + 1] ?? " ")) {
			this.at += 1;
			return { kind: "ref", number: first, generation: second };
		}

		// Two numbers in a row, which is ordinary. Only the first one was read.
		this.at = mark;
		return first;
	}

	private readNumber(): number {
		let text = "";
		while (this.at < this.source.length) {
			const character = this.source[this.at] ?? "";
			if (!/[+\-.\d]/.test(character)) break;
			text += character;
			this.at += 1;
		}
		const value = Number.parseFloat(text);
		return Number.isFinite(value) ? value : 0;
	}

	private readWord(): PdfValue {
		let word = "";
		while (this.at < this.source.length) {
			const character = this.source[this.at] ?? "";
			if (isSpace(character.charCodeAt(0)) || DELIMITER.has(character)) break;
			word += character;
			this.at += 1;
		}

		if (word === "true") return true;
		if (word === "false") return false;
		if (word === "null") return null;
		if (word === "") {
			this.at += 1;
			return { kind: "operator", name: "" };
		}
		return { kind: "operator", name: word };
	}
}

/** Reads a dictionary entry as a number, when it is one. */
export function numberOf(value: PdfValue | undefined): number | null {
	return typeof value === "number" ? value : null;
}
