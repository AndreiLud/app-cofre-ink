// Handing a file to the person.
//
// Nothing is uploaded anywhere: the file is built in the tab and given straight to the
// browser, which is the only way an export can honestly say the data never left.

/** A name that sorts by date and says what it is. */
export function fileNameFor(prefix: string, extension: string, when = new Date()): string {
	const day = [
		when.getFullYear(),
		String(when.getMonth() + 1).padStart(2, "0"),
		String(when.getDate()).padStart(2, "0"),
	].join("");
	return `${prefix}_${day}.${extension}`;
}

export function download(fileName: string, content: string, type: string): void {
	const blob = new Blob([content], { type: `${type};charset=utf-8` });
	const url = URL.createObjectURL(blob);

	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.rel = "noopener";
	document.body.append(link);
	link.click();
	link.remove();

	// The browser needs the address a moment longer than the click.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(fileName: string, value: unknown): void {
	download(fileName, JSON.stringify(value, null, 2), "application/json");
}

/** A file that is not text, such as a packed one. */
export function downloadBytes(fileName: string, bytes: Uint8Array, type: string): void {
	const blob = new Blob([bytes as unknown as BlobPart], { type });
	const url = URL.createObjectURL(blob);

	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.rel = "noopener";
	document.body.append(link);
	link.click();
	link.remove();

	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(fileName: string, text: string): void {
	download(fileName, text, "text/csv");
}

/**
 * The largest file this will open.
 *
 * A statement of a year is a few hundred kilobytes and a backup of a decade is a few
 * megabytes, so twenty five is far above anything real. What it is really for is the
 * other kind of file: a spreadsheet and a PDF are both compressed formats, and a small
 * one can be built to unpack into gigabytes. Refusing early costs nothing and is the
 * only place where one check covers every reader.
 */
export const LARGEST_FILE = 25 * 1024 * 1024;

export class FileTooLargeError extends Error {
	readonly size: number;
	constructor(size: number) {
		super(`the file is ${size} bytes, and the largest this opens is ${LARGEST_FILE}`);
		this.name = "FileTooLargeError";
		this.size = size;
	}
}

/** Reads what the person picked, as bytes, because a statement is not always text. */
export async function readPickedFile(file: File): Promise<Uint8Array> {
	if (file.size > LARGEST_FILE) throw new FileTooLargeError(file.size);
	return new Uint8Array(await file.arrayBuffer());
}
