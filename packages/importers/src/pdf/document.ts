// Every object in the file, found by looking rather than by asking.
//
// A PDF says where its objects are in a table at the end, and that table is the first
// thing a damaged or partly downloaded file loses. So this reads the file the blunt
// way: it scans for "12 0 obj" everywhere and parses what follows. A file with a
// broken table still gives up its text, and a file with a good one costs one extra
// pass, which nobody notices.

import { inflateSync, unzlibSync } from "fflate";
import {
	asLatin1,
	isArray,
	isDict,
	isName,
	isRef,
	numberOf,
	type PdfDict,
	PdfReader,
	type PdfValue,
} from "./syntax.ts";

export type PdfObject = {
	number: number;
	value: PdfValue;
	/** Present when the object carried a stream, already decoded. */
	stream?: string;
};

export type PdfDocument = {
	objects: Map<number, PdfObject>;
	resolve: (value: PdfValue | undefined) => PdfValue | undefined;
	dictOf: (value: PdfValue | undefined) => PdfDict | null;
	/** The decoded stream a reference points at, when it points at one. */
	streamOf: (value: PdfValue | undefined) => string | null;
};

const OBJECT = /(\d+)\s+(\d+)\s+obj\b/g;

/** Undoes what a stream was packed with, or gives back nothing when it cannot. */
function decodeStream(raw: Uint8Array, filter: string): Uint8Array | null {
	if (filter === "" || filter === "FlateDecode" || filter === "Fl") {
		if (filter === "") return raw;
		try {
			return unzlibSync(raw);
		} catch {
			try {
				// Some writers leave the zlib wrapper off.
				return inflateSync(raw);
			} catch {
				return null;
			}
		}
	}
	// Anything else, such as an image codec, is not text and is no loss here.
	return null;
}

function filterNameOf(
	dictionary: PdfDict,
	resolve: (value: PdfValue | undefined) => PdfValue | undefined,
): string {
	const filter = resolve(dictionary.entries.get("Filter"));
	if (isName(filter)) return filter.value;
	if (isArray(filter)) {
		const first = resolve(filter.items[0]);
		if (isName(first)) return first.value;
	}
	return "";
}

/**
 * Reads the objects of a file.
 *
 * Two passes, because the length of a stream is sometimes written as a reference to an
 * object further down: the first pass records where every object begins, the second
 * one parses them with the lengths already known.
 */
export function readPdfObjects(bytes: Uint8Array): PdfDocument {
	const source = asLatin1(bytes);
	const objects = new Map<number, PdfObject>();
	const starts: { number: number; at: number }[] = [];

	OBJECT.lastIndex = 0;
	let found = OBJECT.exec(source);
	while (found) {
		starts.push({ number: Number(found[1]), at: OBJECT.lastIndex });
		found = OBJECT.exec(source);
	}

	const resolve = (value: PdfValue | undefined): PdfValue | undefined => {
		let seen = 0;
		let current = value;
		while (isRef(current) && seen < 32) {
			current = objects.get(current.number)?.value;
			seen += 1;
		}
		return current;
	};

	// First pass: the values, without touching the streams.
	for (const start of starts) {
		const reader = new PdfReader(source, start.at);
		const value = reader.read();
		objects.set(start.number, { number: start.number, value: value ?? null });
	}

	// Second pass: the streams, now that a length written as a reference can be read.
	for (const start of starts) {
		const object = objects.get(start.number);
		if (!object || !isDict(object.value)) continue;

		const reader = new PdfReader(source, start.at);
		reader.read();
		reader.skipSpace();
		if (!source.startsWith("stream", reader.at)) continue;

		let at = reader.at + "stream".length;
		if (source[at] === "\r") at += 1;
		if (source[at] === "\n") at += 1;

		const declared = numberOf(resolve(object.value.entries.get("Length")));
		let end = declared === null ? -1 : at + declared;

		// A length that does not land on the end of the stream is a length that lies.
		if (end < 0 || end > source.length || !/^\s*endstream/.test(source.slice(end, end + 20))) {
			end = source.indexOf("endstream", at);
			if (end < 0) continue;
		}

		const raw = bytes.subarray(at, end);
		const decoded = decodeStream(raw, filterNameOf(object.value, resolve));
		if (decoded) object.stream = asLatin1(decoded);
	}

	// Objects packed inside another object, which is how a modern file is written.
	for (const object of [...objects.values()]) {
		if (!isDict(object.value) || object.stream === undefined) continue;
		const type = resolve(object.value.entries.get("Type"));
		if (!isName(type) || type.value !== "ObjStm") continue;

		const count = numberOf(resolve(object.value.entries.get("N"))) ?? 0;
		const first = numberOf(resolve(object.value.entries.get("First"))) ?? 0;

		const header = new PdfReader(object.stream, 0);
		const pairs: { number: number; at: number }[] = [];
		for (let index = 0; index < count; index += 1) {
			const number = header.read();
			const offset = header.read();
			if (typeof number !== "number" || typeof offset !== "number") break;
			pairs.push({ number, at: first + offset });
		}

		for (const pair of pairs) {
			// An object written out in full wins over the packed copy of it.
			if (objects.has(pair.number)) continue;
			const reader = new PdfReader(object.stream, pair.at);
			objects.set(pair.number, { number: pair.number, value: reader.read() ?? null });
		}
	}

	return {
		objects,
		resolve,
		dictOf: (value) => {
			const resolved = resolve(value);
			return isDict(resolved) ? resolved : null;
		},
		streamOf: (value) => {
			let seen = 0;
			let current = value;
			while (isRef(current) && seen < 32) {
				const object = objects.get(current.number);
				if (object?.stream !== undefined) return object.stream;
				current = object?.value;
				seen += 1;
			}
			return null;
		},
	};
}
