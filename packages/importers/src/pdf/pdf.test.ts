import { describe, expect, it } from "vitest";
import { buildPdf, drawText as draw } from "./buildPdf.ts";
import { looksLikePdf, readPdf } from "./index.ts";
import { readToUnicode } from "./toUnicode.ts";

describe("knowing a PDF when it sees one", () => {
	it("reads the five bytes every PDF starts with", () => {
		expect(looksLikePdf(buildPdf({ content: draw(50, 700, "oi") }))).toBe(true);
		expect(looksLikePdf(new TextEncoder().encode("Data;Valor"))).toBe(false);
		expect(looksLikePdf(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
	});
});

describe("the text of a page", () => {
	it("reads what was drawn, top to bottom", () => {
		const file = buildPdf({
			content: [
				draw(50, 780, "Extrato da conta"),
				draw(50, 740, "10/09/2026"),
				draw(50, 700, "Mercado do bairro"),
			].join(""),
		});

		const read = readPdf(file);
		expect(read.pages).toBe(1);
		expect(read.lines.map((line) => line.text)).toEqual([
			"Extrato da conta",
			"10/09/2026",
			"Mercado do bairro",
		]);
	});

	it("puts what sits at the same height on one line, left to right", () => {
		const file = buildPdf({
			content: [
				// Written out of order on purpose, the way a table often is.
				draw(400, 700, "-42,90"),
				draw(50, 700, "10/09/2026"),
				draw(150, 700, "Mercado do bairro"),
			].join(""),
		});

		expect(readPdf(file).lines[0]?.text).toBe("10/09/2026 Mercado do bairro -42,90");
	});

	it("reads a stream that was packed", () => {
		const file = buildPdf({
			content: draw(50, 700, "Fatura do cartao"),
			compress: true,
		});

		expect(readPdf(file).lines[0]?.text).toBe("Fatura do cartao");
	});

	it("follows the map a subset font carries", () => {
		// A font that numbers its glyphs from one, which is what a bank sends.
		const toUnicode = `/CIDInit /ProcSet findresource begin
12 dict begin begincmap
1 begincodespacerange
<00> <FF>
endcodespacerange
3 beginbfchar
<01> <004F>
<02> <0049>
<03> <0021>
endbfchar
endcmap end end`;

		const file = buildPdf({
			content: "BT /F1 10 Tf 1 0 0 1 50 700 Tm <010203> Tj ET\n",
			toUnicode,
		});

		expect(readPdf(file).lines[0]?.text).toBe("OI!");
	});

	it("reads the spacing a writer puts inside one run", () => {
		const file = buildPdf({
			content: "BT /F1 10 Tf 1 0 0 1 50 700 Tm [(Total)-500(1.234,56)] TJ ET\n",
		});

		expect(readPdf(file).lines[0]?.text).toBe("Total 1.234,56");
	});

	it("gives back nothing for a file with no text in it", () => {
		const read = readPdf(new TextEncoder().encode("%PDF-1.7\nnada aqui\n%%EOF"));
		expect(read.lines).toEqual([]);
	});

	it("never throws on rubbish", () => {
		const rubbish = new Uint8Array(512);
		for (let index = 0; index < rubbish.length; index += 1) rubbish[index] = (index * 7) % 256;
		expect(() => readPdf(rubbish)).not.toThrow();
	});
});

describe("the map a font carries", () => {
	it("reads a range that counts up", () => {
		const unicode = readToUnicode(`1 beginbfrange
<20> <22> <0041>
endbfrange`);

		expect(unicode.map.get(0x20)).toBe("A");
		expect(unicode.map.get(0x21)).toBe("B");
		expect(unicode.map.get(0x22)).toBe("C");
	});

	it("reads a range that lists a letter for each code", () => {
		const unicode = readToUnicode(`1 beginbfrange
<10> <12> [<0058> <0059> <005A>]
endbfrange`);

		expect(unicode.map.get(0x10)).toBe("X");
		expect(unicode.map.get(0x12)).toBe("Z");
	});

	it("notices when the codes are two bytes wide", () => {
		const unicode = readToUnicode(`1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfchar
<0041> <00C1>
endbfchar`);

		expect(unicode.width).toBe(2);
		expect(unicode.map.get(0x41)).toBe("Á");
	});
});
