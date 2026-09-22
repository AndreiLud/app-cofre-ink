// Cofre with no connection.
//
// The application is a web application and nothing else: a browser opens an address.
// What this file adds is the one thing a page cannot do by itself, which is keep
// working when the connection does not. The worker registered here holds the whole of
// the interface, so the page opens on a train, in a lift or on a plane, and the data
// was never anywhere but this browser anyway.
//
// A browser that offers to add the page to a home screen or a taskbar is welcome to,
// and the manifest next to this file is there for exactly that. Nothing in the
// interface asks for it.

/**
 * Registers the worker that makes the application open without a connection.
 *
 * Only in a build: in development the page is served by the dev server and a worker
 * caching it would serve yesterday's code with great efficiency.
 */
export function keepWorkingOffline(): void {
	if (!("serviceWorker" in navigator)) return;
	if (!import.meta.env.PROD) return;

	window.addEventListener("load", () => {
		// Against the base of the build, so that a copy served from a folder registers
		// the worker of that folder and claims only the pages inside it.
		void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
			// A browser that refuses the worker still works, online.
		});
	});
}
