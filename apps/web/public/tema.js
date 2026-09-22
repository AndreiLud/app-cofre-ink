// Applies the stored theme before the first paint, so the page never flashes.
//
// A file rather than a few lines inside the page, because the page forbids any script
// it did not fetch from itself, and a script written into the page is exactly what that
// rule exists to stop. This runs before the interface loads and does one thing.

try {
	const stored = localStorage.getItem("cofreTheme");
	if (stored === "light" || stored === "dark") {
		document.documentElement.dataset.theme = stored;
	}
} catch {
	// A browser with storage blocked follows the system, which is the default anyway.
}
