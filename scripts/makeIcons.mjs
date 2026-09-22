// The icons, drawn rather than stored.
//
// A repository that anybody can clone should not carry a pile of binary files nobody
// can read a diff of. These are a few dozen lines of arithmetic and a PNG encoder, so
// the mark is in the repository as the description of itself, and changing it is
// changing a number.
//
// The mark is a safe door seen from the front, in the two colours of the project: a
// square of paper, a ring of ink, and the dial. It reads at sixteen pixels, which is
// the only test an icon has to pass.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// The compression a PNG wants is the one Node already has, so this script needs
// nothing installed to run.
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "apps", "web", "public", "icons");
// The shell that wraps the same build into a window and into a telephone wants the
// same mark in the two formats the two desktops insist on.
const shell = join(here, "..", "apps", "desktop", "src-tauri", "icons");

const PAPER = [0xf4, 0xef, 0xe4, 0xff];
const INK = [0x16, 0x15, 0x0f, 0xff];

const TABLE = (() => {
	const table = new Uint32Array(256);
	for (let index = 0; index < 256; index += 1) {
		let value = index;
		for (let bit = 0; bit < 8; bit += 1) {
			value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[index] = value >>> 0;
	}
	return table;
})();

function crc32(bytes) {
	let value = 0xffffffff;
	for (const byte of bytes) value = TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
	return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const name = new TextEncoder().encode(type);
	const body = new Uint8Array(name.length + data.length);
	body.set(name, 0);
	body.set(data, name.length);

	// Four bytes of length, the body, four bytes of check. Nothing else.
	const out = new Uint8Array(4 + body.length + 4);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	out.set(body, 4);
	view.setUint32(4 + body.length, crc32(body));
	return out;
}

/** Red, green, blue and alpha for every pixel, as a PNG. */
function encodePng(width, height, pixels) {
	const raw = new Uint8Array(height * (width * 4 + 1));
	for (let y = 0; y < height; y += 1) {
		// A filter byte per line. Zero means "this line as it is", which compresses
		// perfectly well for a drawing made of flat colours.
		raw[y * (width * 4 + 1)] = 0;
		raw.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
	}

	const header = new Uint8Array(13);
	const view = new DataView(header.buffer);
	view.setUint32(0, width);
	view.setUint32(4, height);
	header[8] = 8;
	// Colour type six: red, green, blue and alpha.
	header[9] = 6;

	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", new Uint8Array(deflateSync(raw, { level: 9 }))),
		chunk("IEND", new Uint8Array(0)),
	];

	const size = parts.reduce((total, part) => total + part.length, 0);
	const file = new Uint8Array(size);
	let at = 0;
	for (const part of parts) {
		file.set(part, at);
		at += part.length;
	}
	return file;
}

/**
 * The mark.
 *
 * `bleed` is what a maskable icon needs: the drawing fills the square with ink and the
 * mark sits well inside it, so that a launcher cropping it to a circle cuts nothing.
 */
function paint(size, { bleed = false } = {}) {
	const pixels = new Uint8Array(size * size * 4);
	const put = (x, y, colour) => {
		const at = (y * size + x) * 4;
		pixels[at] = colour[0];
		pixels[at + 1] = colour[1];
		pixels[at + 2] = colour[2];
		pixels[at + 3] = colour[3];
	};

	const background = bleed ? INK : PAPER;
	const foreground = bleed ? PAPER : INK;

	const middle = (size - 1) / 2;
	const door = bleed ? size * 0.3 : size * 0.38;
	const stroke = Math.max(1, size * 0.055);
	const dial = bleed ? size * 0.13 : size * 0.16;

	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const dx = x - middle;
			const dy = y - middle;
			const distance = Math.sqrt(dx * dx + dy * dy);

			// The door: a square with its corners taken off, which at this size is a
			// square that does not look like a button.
			const inDoor = Math.max(Math.abs(dx), Math.abs(dy)) <= door && distance <= door * 1.32;
			const inDoorEdge = inDoor && Math.max(Math.abs(dx), Math.abs(dy)) >= door - stroke;

			const inDial = distance <= dial;
			const inDialRing = inDial && distance >= dial - stroke * 0.8;
			// The handle, a short bar to the right of the dial.
			const inHandle =
				Math.abs(dy) <= stroke * 0.35 && dx >= dial + stroke * 0.4 && dx <= door - stroke * 1.2;

			put(x, y, inDoorEdge || inDialRing || inHandle ? foreground : background);
		}
	}

	return pixels;
}

function drawSafe(size, options = {}) {
	return encodePng(size, size, paint(size, options));
}

/**
 * A drawing as the bitmap an icon file carries.
 *
 * Bottom up, blue before red, and with a header that lies about the height because the
 * format expects a mask underneath the picture. The mask is all zeroes, which means
 * every pixel is opaque, and the alpha in the picture says the same thing.
 */
function encodeDib(size, pixels) {
	const mask = ((size + 31) >> 5) * 4 * size;
	const file = new Uint8Array(40 + size * size * 4 + mask);
	const view = new DataView(file.buffer);
	view.setUint32(0, 40, true);
	view.setInt32(4, size, true);
	view.setInt32(8, size * 2, true);
	view.setUint16(12, 1, true);
	view.setUint16(14, 32, true);
	view.setUint32(20, size * size * 4 + mask, true);

	for (let y = 0; y < size; y += 1) {
		const from = (size - 1 - y) * size * 4;
		let to = 40 + y * size * 4;
		for (let x = 0; x < size; x += 1) {
			file[to] = pixels[from + x * 4 + 2];
			file[to + 1] = pixels[from + x * 4 + 1];
			file[to + 2] = pixels[from + x * 4];
			file[to + 3] = pixels[from + x * 4 + 3];
			to += 4;
		}
	}

	return file;
}

/**
 * What Windows asks for: a small table of sizes, each one a whole picture.
 *
 * The format allows a bitmap and allows a PNG. The sizes a window and a taskbar use are
 * written as bitmaps, which every Windows that ever existed reads, and the largest one
 * is written as a PNG, which is the form that size was introduced with.
 */
function encodeIco(images) {
	const header = new Uint8Array(6 + images.length * 16);
	const view = new DataView(header.buffer);
	// Nothing, then one meaning icon, then how many.
	view.setUint16(2, 1, true);
	view.setUint16(4, images.length, true);

	let at = header.length;
	for (const [index, image] of images.entries()) {
		const entry = 6 + index * 16;
		// Two hundred and fifty six is written as a zero, which is the whole of the
		// format's cleverness.
		header[entry] = image.size % 256;
		header[entry + 1] = image.size % 256;
		view.setUint16(entry + 4, 1, true);
		view.setUint16(entry + 6, 32, true);
		view.setUint32(entry + 8, image.bytes.length, true);
		view.setUint32(entry + 12, at, true);
		at += image.bytes.length;
	}

	const file = new Uint8Array(at);
	file.set(header, 0);
	let cursor = header.length;
	for (const image of images) {
		file.set(image.bytes, cursor);
		cursor += image.bytes.length;
	}
	return file;
}

/** What macOS asks for: the same PNGs, each one under the name of its size. */
function encodeIcns(images) {
	const parts = [];
	let total = 8;
	for (const image of images) {
		const head = new Uint8Array(8);
		head.set(new TextEncoder().encode(image.type), 0);
		new DataView(head.buffer).setUint32(4, 8 + image.bytes.length);
		parts.push(head, image.bytes);
		total += 8 + image.bytes.length;
	}

	const file = new Uint8Array(total);
	file.set(new TextEncoder().encode("icns"), 0);
	new DataView(file.buffer).setUint32(4, total);
	let at = 8;
	for (const part of parts) {
		file.set(part, at);
		at += part.length;
	}
	return file;
}

mkdirSync(out, { recursive: true });
mkdirSync(shell, { recursive: true });

const written = [
	["icon192.png", drawSafe(192)],
	["icon512.png", drawSafe(512)],
	["maskable512.png", drawSafe(512, { bleed: true })],
	// What an iPhone puts on the home screen, which is never transparent and never
	// rounded by the file itself.
	["apple180.png", drawSafe(180)],
	["favicon32.png", drawSafe(32)],
];

for (const [name, bytes] of written) {
	writeFileSync(join(out, name), bytes);
}

console.log(`Icons written to ${out}: ${written.map(([name]) => name).join(", ")}`);

// The same mark again, at the sizes and under the names the shell's bundler looks for.
const sizes = new Map([16, 32, 48, 64, 128, 256, 512, 1024].map((size) => [size, drawSafe(size)]));
const bitmap = (size) => ({ size, bytes: encodeDib(size, paint(size)) });

const forShell = [
	["32x32.png", sizes.get(32)],
	["128x128.png", sizes.get(128)],
	["128x128@2x.png", sizes.get(256)],
	["icon.png", sizes.get(512)],
	[
		"icon.ico",
		encodeIco([
			bitmap(16),
			bitmap(32),
			bitmap(48),
			bitmap(64),
			bitmap(128),
			{ size: 256, bytes: sizes.get(256) },
		]),
	],
	[
		"icon.icns",
		encodeIcns([
			{ type: "ic11", bytes: sizes.get(32) },
			{ type: "ic12", bytes: sizes.get(64) },
			{ type: "ic07", bytes: sizes.get(128) },
			{ type: "ic08", bytes: sizes.get(256) },
			{ type: "ic09", bytes: sizes.get(512) },
			{ type: "ic10", bytes: sizes.get(1024) },
		]),
	],
];

for (const [name, bytes] of forShell) {
	writeFileSync(join(shell, name), bytes);
}

console.log(`Icons written to ${shell}: ${forShell.map(([name]) => name).join(", ")}`);
