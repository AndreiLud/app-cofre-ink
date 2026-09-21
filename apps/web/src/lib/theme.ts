import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "cofreTheme";

function storedChoice(): ThemeChoice {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === "light" || stored === "dark") return stored;
	} catch {
		// Storage can be blocked. Following the system is a fine default.
	}
	return "system";
}

function apply(choice: ThemeChoice): void {
	const root = document.documentElement;
	if (choice === "system") {
		delete root.dataset.theme;
		return;
	}
	root.dataset.theme = choice;
}

/** Remembers the theme per device. It is a preference, never shared data. */
export function useTheme(): { choice: ThemeChoice; setChoice: (next: ThemeChoice) => void } {
	const [choice, setStateChoice] = useState<ThemeChoice>(storedChoice);

	useEffect(() => {
		apply(choice);
	}, [choice]);

	const setChoice = useCallback((next: ThemeChoice) => {
		// Applied right away, before React renders again. A child effect that reads a
		// token would otherwise run before the parent effect that swaps the theme, and
		// would read the palette that is on its way out.
		apply(next);
		setStateChoice(next);
		try {
			if (next === "system") localStorage.removeItem(STORAGE_KEY);
			else localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// The choice still applies for this session.
		}
	}, []);

	return { choice, setChoice };
}

/** Reads a design token from the document, so the gallery shows the live value. */
export function readToken(name: string): string {
	if (typeof document === "undefined") return "";
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
