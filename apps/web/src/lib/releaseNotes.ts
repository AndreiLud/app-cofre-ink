// The notes of a published version, read into blocks the page draws as its own elements.
//
// They come from GitHub through the server, written in Markdown by whoever published them, and
// they are never put on the page as markup (part 2, K.3.4). A heading, an item and a paragraph
// is all a release note needs to be read, and a link in one is taken down to its words: the
// only address this screen offers is the page of the version, made from the version itself.

export type NoteBlock =
	| { kind: "heading"; text: string }
	| { kind: "list"; items: string[] }
	| { kind: "paragraph"; text: string };

/** The words of a line of Markdown, without the marks around them and without any address. */
function wordsOf(line: string): string {
	return (
		line
			// An image is said by what it shows, a link by its words.
			.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
			.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
			// An address written out in angle brackets, or bare, is taken out with its brackets.
			.replace(/<https?:[^>]*>/g, "")
			.replace(/\bhttps?:\/\/\S+/g, "")
			// Emphasis and code marks, which are for a renderer this page does not use.
			.replace(/(\*\*|__|\*|_|`)(\S(?:.*?\S)?)\1/g, "$2")
			.replace(/<[^>]+>/g, "")
			.replace(/\s+/g, " ")
			.trim()
	);
}

export function readNotes(notes: string): NoteBlock[] {
	const blocks: NoteBlock[] = [];
	let paragraph: string[] = [];

	const closeParagraph = () => {
		const text = wordsOf(paragraph.join(" "));
		if (text !== "") blocks.push({ kind: "paragraph", text });
		paragraph = [];
	};

	for (const raw of notes.replace(/\r\n?/g, "\n").split("\n")) {
		const line = raw.trim();
		if (line === "") {
			closeParagraph();
			continue;
		}
		const heading = /^#{1,6}\s+(.*)$/.exec(line);
		const item = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
		if (heading || item) {
			closeParagraph();
			const text = wordsOf((heading ?? item)?.[1] ?? "");
			if (text === "") continue;
			const last = blocks.at(-1);
			// Items one after another are one list.
			if (item && last?.kind === "list") last.items.push(text);
			else if (item) blocks.push({ kind: "list", items: [text] });
			else blocks.push({ kind: "heading", text });
			continue;
		}
		paragraph.push(line);
	}
	closeParagraph();
	return blocks;
}
