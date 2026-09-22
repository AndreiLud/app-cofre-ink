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

export function downloadCsv(fileName: string, text: string): void {
	download(fileName, text, "text/csv");
}

/** Reads what the person picked, as bytes, because a statement is not always text. */
export async function readPickedFile(file: File): Promise<Uint8Array> {
	return new Uint8Array(await file.arrayBuffer());
}
