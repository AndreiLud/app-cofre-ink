import { useEffect, useState } from "react";
import { useTheme } from "./lib/theme.ts";
import { DesignSystemPage } from "./pages/DesignSystemPage.tsx";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Follows the system preference, so "from the system" really follows it. */
function useSystemPrefersDark(): boolean {
	const [prefersDark, setPrefersDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

	useEffect(() => {
		const query = window.matchMedia(DARK_QUERY);
		const listen = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
		query.addEventListener("change", listen);
		return () => query.removeEventListener("change", listen);
	}, []);

	return prefersDark;
}

export function App() {
	const { choice, setChoice } = useTheme();
	const systemPrefersDark = useSystemPrefersDark();
	const isDark = choice === "dark" || (choice === "system" && systemPrefersDark);

	return <DesignSystemPage themeChoice={choice} isDark={isDark} onThemeChange={setChoice} />;
}
