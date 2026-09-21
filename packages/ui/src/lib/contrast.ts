// Contrast measurement, by the WCAG 2 formula.
// Every token pair that carries text is measured with this, in the gallery and later
// in the check that runs on every build.

export type Rgb = { red: number; green: number; blue: number };

export function parseHex(hex: string): Rgb {
	const value = hex.trim().replace("#", "");
	const full =
		value.length === 3
			? value
					.split("")
					.map((digit) => digit + digit)
					.join("")
			: value;
	if (!/^[0-9a-fA-F]{6}$/.test(full)) {
		throw new Error(`"${hex}" is not a colour in hexadecimal`);
	}
	return {
		red: Number.parseInt(full.slice(0, 2), 16),
		green: Number.parseInt(full.slice(2, 4), 16),
		blue: Number.parseInt(full.slice(4, 6), 16),
	};
}

function channel(value: number): number {
	const normalised = value / 255;
	return normalised <= 0.03928 ? normalised / 12.92 : ((normalised + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(colour: Rgb): number {
	return (
		0.2126 * channel(colour.red) + 0.7152 * channel(colour.green) + 0.0722 * channel(colour.blue)
	);
}

/** Ratio between two colours, from 1 (identical) to 21 (black against white). */
export function contrastRatio(foreground: string, background: string): number {
	const first = relativeLuminance(parseHex(foreground));
	const second = relativeLuminance(parseHex(background));
	const lighter = Math.max(first, second);
	const darker = Math.min(first, second);
	return (lighter + 0.05) / (darker + 0.05);
}

export type ContrastLevel = "AAA" | "AA" | "AA large" | "fails";

/** The level a pair reaches for text, by the WCAG 2.2 thresholds. */
export function contrastLevel(ratio: number): ContrastLevel {
	if (ratio >= 7) return "AAA";
	if (ratio >= 4.5) return "AA";
	if (ratio >= 3) return "AA large";
	return "fails";
}
