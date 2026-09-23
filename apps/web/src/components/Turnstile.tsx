// A widget from Cloudflare, for the owner who asked for one.
//
// It is off unless a site key is configured on the server, and it is off by default on
// purpose: it is a third party being told the address of everybody who opens the sign
// in page of a private server, and this project says nothing leaves without the owner
// asking. Somebody who wants it asks by filling in two lines of the configuration.
//
// What is always there, with or without this, is the work the browser does before the
// server reads a password. This sits on top of that rather than instead of it, which is
// why nothing here fails closed: if Cloudflare does not answer, the sign in is refused
// by the server, not quietly let through by the screen.

import { useEffect, useRef } from "react";

type Turnstile = {
	render: (
		element: HTMLElement,
		options: {
			sitekey: string;
			callback: (token: string) => void;
			"expired-callback"?: () => void;
		},
	) => string;
	remove: (id: string) => void;
};

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Loaded once per page, however many times this is mounted. */
let loading: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
	if (!loading) {
		loading = new Promise<Turnstile>((resolve, reject) => {
			const ready = (window as { turnstile?: Turnstile }).turnstile;
			if (ready) {
				resolve(ready);
				return;
			}
			const tag = document.createElement("script");
			tag.src = SCRIPT;
			tag.async = true;
			tag.onload = () => {
				const loaded = (window as { turnstile?: Turnstile }).turnstile;
				if (loaded) resolve(loaded);
				else reject(new Error("turnstile did not load"));
			};
			tag.onerror = () => reject(new Error("turnstile did not load"));
			document.head.append(tag);
		});
	}
	return loading;
}

export type TurnstileProps = {
	siteKey: string;
	/** Called with the answer, and with nothing when it expires. */
	onToken: (token: string | null) => void;
};

export function Turnstile({ siteKey, onToken }: TurnstileProps) {
	const holder = useRef<HTMLDivElement | null>(null);
	const told = useRef(onToken);
	told.current = onToken;

	useEffect(() => {
		const element = holder.current;
		if (!element) return;

		let widget: string | null = null;
		let alive = true;

		void loadTurnstile()
			.then((turnstile) => {
				if (!alive || !holder.current) return;
				widget = turnstile.render(holder.current, {
					sitekey: siteKey,
					callback: (token) => told.current(token),
					"expired-callback": () => told.current(null),
				});
			})
			.catch(() => {
				// Nothing to say here. The server refuses the sign in without an answer,
				// and saying it twice would be a screen shouting about Cloudflare.
				told.current(null);
			});

		return () => {
			alive = false;
			if (widget === null) return;
			void loadTurnstile().then((turnstile) => turnstile.remove(widget as string));
		};
	}, [siteKey]);

	return <div ref={holder} className="min-h-[65px]" />;
}
