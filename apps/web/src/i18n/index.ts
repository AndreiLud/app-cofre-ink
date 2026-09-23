// The interface in two languages, with one of them in the first download.
//
// Both files together are about a fifth of what a browser has to fetch before the first
// screen, and almost everybody reads one of the two. So the one being used is bundled
// and the other arrives when somebody asks for it, which is a click that already
// expects the screen to change.

import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import pt from "../locales/pt.json";

export const LANGUAGES = ["pt", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

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

function storedLanguage(): Language {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === "pt" || stored === "en") return stored;
	} catch {
		// Storage can be blocked. The default language still works.
	}
	return "pt";
}

export function rememberLanguage(language: Language): void {
	try {
		localStorage.setItem(STORAGE_KEY, language);
	} catch {
		// Not being able to remember the choice is not a reason to fail.
	}
}

void i18next.use(initReactI18next).init({
	resources: { pt: { translation: pt } },
	lng: "pt",
	fallbackLng: "pt",
	interpolation: { escapeValue: false, defaultVariables: { app: APP_NAME } },
});

/**
 * Brings a language in and switches to it.
 *
 * Portuguese is already here. English is fetched once, kept by the browser and by the
 * worker, and never fetched again. Somebody with no connection who has never asked for
 * English stays in Portuguese, which is the language they were already reading.
 */
export async function applyLanguage(language: Language): Promise<void> {
	if (!i18next.hasResourceBundle(language, "translation")) {
		const { default: strings } = await import("../locales/en.json");
		i18next.addResourceBundle(language, "translation", strings);
	}
	await i18next.changeLanguage(language);
	rememberLanguage(language);
}

// The language chosen last time, applied once the first screen is up rather than before
// it: a person who reads Portuguese waits for nothing, and a person who chose English
// sees one repaint instead of a blank page.
const chosen = storedLanguage();
if (chosen !== "pt") void applyLanguage(chosen);

export default i18next;
