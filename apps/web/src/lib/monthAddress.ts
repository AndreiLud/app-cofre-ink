// The month a screen shows, kept in its address.
//
// Only the list and the invoices read the month from the address. Every other screen that
// picks a month held it in a state of its own, so a reload went back to this month, a link
// could not say September, and the back button left the screen instead of going back a month.
// The paper report read the address by hand, once.
//
// The address is written when the person stops changing it, so walking eleven months with the
// keyboard is one entry in the history and not eleven, and the back button reopens the month
// before.

import { useEffect, useRef, useState } from "react";

/** A month written as the address writes it, or nothing. Anything else is dropped. */
export function readMonth(value: unknown): string | undefined {
	return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : undefined;
}

/** How long a change waits for the next one before it is written. */
export const SETTLE_MS = 300;

/**
 * The month on screen and the way to change it.
 *
 * The screen follows a change at once and the address follows it when the person stops. When
 * the address changes by itself, by the back button or a link, the screen follows the address.
 */
export function useMonthInAddress(
	inAddress: string,
	write: (month: string) => void,
): [string, (month: string) => void] {
	// The month chosen and the address it was chosen from. Once the address moves on, by the
	// write below or by the back button, the choice is old and the screen goes where it says.
	const [pending, setPending] = useState<{ from: string; month: string } | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const writer = useRef(write);
	writer.current = write;
	const address = useRef(inAddress);
	address.current = inAddress;
	// Forgotten as soon as the address moves, so the back button to the address it was chosen
	// from does not bring it back.
	if (pending !== null && pending.from !== inAddress) setPending(null);

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	const change = (month: string) => {
		const from = address.current;
		setPending({ from, month });
		if (timer.current) clearTimeout(timer.current);
		// Not over a move the person made meanwhile with the back button.
		timer.current = setTimeout(() => {
			if (address.current === from) writer.current(month);
		}, SETTLE_MS);
	};

	return [pending !== null && pending.from === inAddress ? pending.month : inAddress, change];
}
