// The last way somebody paid, per space, kept in this browser.
//
// A form that opens on the first account by name opens on whichever account happens to
// be called something early in the alphabet, which for most households is a pocket
// rather than the bank. The one line reader had the same default and the same problem.
//
// It lives in the browser rather than in the space, because it is a habit of the person
// at this device and not a fact about the household: two people sharing a space pay for
// different things with different cards, and neither should be setting the other's
// default. Nothing here is money, so losing it costs a click.

const KEY = "cofreLastWay";

function read(): Record<string, string> {
	try {
		const raw = window.localStorage.getItem(KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return {};
		return parsed as Record<string, string>;
	} catch {
		// A browser with storage blocked, or a value somebody else wrote. Either way the
		// form opens on the first way to pay, which is what it did before this existed.
		return {};
	}
}

/** The way to pay this browser used last in one space, or nothing when it has none. */
export function lastWayUsed(spaceId: string): string | null {
	return read()[spaceId] ?? null;
}

export function rememberWayUsed(spaceId: string, way: string): void {
	if (spaceId === "" || way === "") return;
	try {
		window.localStorage.setItem(KEY, JSON.stringify({ ...read(), [spaceId]: way }));
	} catch {
		// Nothing to do and nothing lost.
	}
}

// There was a function here to forget these, exported and never called. Erasing everything
// on this device already removes every key of this application, this one among them, so it
// was a second answer to a question that has one. An entry left for a space that has gone
// costs nothing: the form checks that the remembered way is still one of the ways to pay
// before it opens on it.
