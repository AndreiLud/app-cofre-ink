// Putting the application on a phone.
//
// On Android and on a desktop, the browser offers to install and tells the page when it
// is about to, which is the moment to show a button. On an iPhone there is no such
// offer and never has been: the person taps share and then add to the home screen, so
// the interface says that instead of showing a button that cannot work.
//
// Once installed it is the same application, with the same data in the same browser
// storage, opened without the address bar and without a connection.

export type InstallOffer = {
	/** Available when the browser has offered, which is Android and the desktop. */
	prompt: (() => Promise<boolean>) | null;
	/** True when the only way in is the share menu, which is Safari on an iPhone. */
	byHand: boolean;
	/** True when it is already running as an installed application. */
	installed: boolean;
};

type InstallEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: string }>;
};

let waiting: InstallEvent | null = null;

/** The browser offers once, early, so the offer is kept until somebody asks for it. */
export function watchForInstall(onOffer: () => void): () => void {
	const keep = (event: Event) => {
		event.preventDefault();
		waiting = event as InstallEvent;
		onOffer();
	};
	const forget = () => {
		waiting = null;
		onOffer();
	};

	window.addEventListener("beforeinstallprompt", keep);
	window.addEventListener("appinstalled", forget);

	return () => {
		window.removeEventListener("beforeinstallprompt", keep);
		window.removeEventListener("appinstalled", forget);
	};
}

function isStandalone(): boolean {
	try {
		if (window.matchMedia("(display-mode: standalone)").matches) return true;
	} catch {
		// A browser that cannot answer is a browser that is not standalone.
	}
	// What an iPhone sets instead.
	return (navigator as { standalone?: boolean }).standalone === true;
}

function isApple(): boolean {
	const agent = navigator.userAgent;
	// An iPad says it is a Mac, and a Mac with a touch screen does not exist.
	return (
		/iPad|iPhone|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)
	);
}

export function installOffer(): InstallOffer {
	const installed = isStandalone();

	return {
		installed,
		byHand: !installed && waiting === null && isApple(),
		prompt:
			waiting === null || installed
				? null
				: async () => {
						const offer = waiting;
						if (!offer) return false;
						waiting = null;
						await offer.prompt();
						const choice = await offer.userChoice;
						return choice.outcome === "accepted";
					},
	};
}

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
		void navigator.serviceWorker.register("/sw.js").catch(() => {
			// A browser that refuses the worker still works, online.
		});
	});
}
