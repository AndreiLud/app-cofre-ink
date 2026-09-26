// The interface in two languages, with one of them in the first download.
//
// Both files together are about a fifth of what a browser has to fetch before the first
// screen, and almost everybody reads one of the two. So the one being used is bundled
// and the other arrives when somebody asks for it, which is a click that already
// expects the screen to change.
//
// Which of the two opens is decided by `firstLanguage` in the core package, where the
// order is written out and tested. This file is the part that cannot be pure: reading
// the address, reading the clock, and writing a choice down.

import { firstLanguage, isLanguage, LANGUAGES, type Language } from "@cofre/core";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import pt from "../locales/pt.json";

export { LANGUAGES, type Language };

/**
 * What the product is called, in one place.
 *
 * It used to be written out inside eighteen sentences in each language, which meant
 * thirty six places to remember and two languages to get out of step. Every one of
 * those sentences now says {{app}}, and this is what fills it in, without a single
 * screen having to pass it.
 */
export const APP_NAME = "Cofre Ink";

/** The interface language and the formatting locale are two different choices. */
export const LOCALE_OF: Record<Language, string> = {
	pt: "pt-BR",
	en: "en-US",
};

const STORAGE_KEY = "cofreLanguage";

/** The language somebody chose here before, or nothing if nobody has. */
function storedLanguage(): Language | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return isLanguage(stored) ? stored : null;
	} catch {
		// Storage can be blocked. Everything below still decides.
		return null;
	}
}

export function rememberLanguage(language: Language): void {
	try {
		localStorage.setItem(STORAGE_KEY, language);
	} catch {
		// Not being able to remember the choice is not a reason to fail.
	}
}

/** What the device says about itself, which is the only thing ever asked of it. */
function deviceTimezone(): string | null {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
	} catch {
		return null;
	}
}

/** The language the site sent this person here with, if it sent one. */
function askedInTheAddress(): string | null {
	try {
		return new URL(window.location.href).searchParams.get("lang");
	} catch {
		return null;
	}
}

/**
 * Takes the parameter back out of the address bar.
 *
 * It has been read and written down, and leaving it there would mean every link
 * somebody copies out of this application carries a language with it, handed to
 * whoever they send it to. The path, the rest of the query and the fragment are put
 * back exactly as they were, and the entry is replaced rather than added so the back
 * button does not lead to the address that was just cleaned.
 */
function forgetTheAddress(): void {
	try {
		const address = new URL(window.location.href);
		address.searchParams.delete("lang");
		const query = address.searchParams.toString();
		window.history.replaceState(
			window.history.state,
			"",
			`${address.pathname}${query === "" ? "" : `?${query}`}${address.hash}`,
		);
	} catch {
		// An address this cannot rewrite is one the person keeps. Nothing else breaks.
	}
}

void i18next.use(initReactI18next).init({
	resources: { pt: { translation: pt } },
	lng: "pt",
	fallbackLng: "pt",
	interpolation: { escapeValue: false, defaultVariables: { app: APP_NAME } },
});

/**
 * Brings a language in and switches to it, without deciding whether it was a choice.
 *
 * Portuguese is already here. English is fetched once, kept by the browser and by the
 * worker, and never fetched again. Somebody with no connection who has never asked for
 * English stays in Portuguese, which is the language they were already reading.
 */
async function bringIn(language: Language): Promise<void> {
	if (!i18next.hasResourceBundle(language, "translation")) {
		const { default: strings } = await import("../locales/en.json");
		i18next.addResourceBundle(language, "translation", strings);
	}
	await i18next.changeLanguage(language);
	speakTheDocument(language);
}

/** Somebody chose this one. It is applied and it is written down. */
export async function applyLanguage(language: Language): Promise<void> {
	await bringIn(language);
	rememberLanguage(language);
}

/**
 * Says which language the page is written in, on the page itself.
 *
 * A screen reader picks its pronunciation from this attribute and from nothing else, so
 * a document that still claims Portuguese while every word on it is English is read out
 * in Portuguese vowels. The strings changing without this changing is the whole of the
 * defect, and it is what WCAG names as the language of the page.
 */
function speakTheDocument(language: Language): void {
	document.documentElement.lang = LOCALE_OF[language];
}

const decided = firstLanguage({
	asked: askedInTheAddress(),
	remembered: storedLanguage(),
	timezone: deviceTimezone(),
});

// A language that came from the address was chosen, over on the site, so it is written
// down here exactly as a press of the button would be. One that came from the clock was
// guessed, and a guess is never written down: the button keeps the last word, and
// somebody who travels does not come back to an interface that translated itself.
if (decided.source === "address") {
	forgetTheAddress();
	rememberLanguage(decided.language);
}

// Applied once the first screen is up rather than before it: a person who reads
// Portuguese waits for nothing, and a person reading English sees one repaint instead
// of a blank page.
if (decided.language === "pt") speakTheDocument("pt");
else void bringIn(decided.language);

export default i18next;
