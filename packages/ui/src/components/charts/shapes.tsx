// The same drawing in two shapes, and the screen keeps the one that fits.
//
// A chart here is coordinates inside a viewBox, which is what lets it scale without
// being measured. The cost is that everything scales, including the words: a chart 720
// units across, drawn in a box 360 pixels wide, renders a label of twelve units at six
// pixels, and nobody reads that.
//
// So a chart that has to work on a telephone is drawn twice, in two shapes, and a class
// decides which one the screen keeps. Both are in the page and one of them is hidden,
// which costs a handful of nodes and buys a drawing that never has to be measured and
// never lags a frame behind the layout. The hidden one leaves the accessibility tree
// with it, so the description is announced once.

import type { ReactNode } from "react";

export type ChartSize = {
	/** How many units across. Fewer units means larger words on the same screen. */
	width: number;
	height: number;
};

export type TwoShapesProps = {
	narrow: ChartSize;
	wide: ChartSize;
	/** Draws the chart at a size, with a class that decides when it is shown. */
	draw: (size: ChartSize, shown: string) => ReactNode;
};

/** The boundary is the one every other layout in the project uses. */
export function TwoShapes({ narrow, wide, draw }: TwoShapesProps) {
	return (
		<>
			{draw(narrow, "md:hidden")}
			{draw(wide, "hidden md:block")}
		</>
	);
}
