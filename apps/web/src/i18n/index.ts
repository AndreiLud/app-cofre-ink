import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import pt from "../locales/pt.json";

export const LANGUAGES = ["pt", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

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
	resources: {
		pt: { translation: pt },
		en: { translation: en },
	},
	lng: storedLanguage(),
	fallbackLng: "pt",
	interpolation: { escapeValue: false },
});

export default i18next;
