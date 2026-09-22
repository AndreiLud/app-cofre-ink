import { Button, Icon } from "@cofre/ui";
import { useTranslation } from "react-i18next";
import { applyLanguage, LANGUAGES, type Language } from "../i18n/index.ts";
import type { ThemeChoice } from "../lib/theme.ts";

export type ThemeToggleProps = {
	choice: ThemeChoice;
	isDark: boolean;
	onChange: (next: ThemeChoice) => void;
};

export function ThemeToggle({ isDark, onChange }: ThemeToggleProps) {
	const { t } = useTranslation();
	return (
		<Button
			size="small"
			variant="quiet"
			aria-label={isDark ? t("theme.light") : t("theme.dark")}
			onClick={() => onChange(isDark ? "light" : "dark")}
			icon={<Icon name={isDark ? "sun" : "moon"} />}
		/>
	);
}

export function LanguageToggle() {
	const { t, i18n } = useTranslation();
	const current = (i18n.resolvedLanguage ?? "pt") as Language;
	const next: Language = current === "pt" ? "en" : "pt";

	return (
		<Button
			size="small"
			variant="quiet"
			aria-label={t("language.label")}
			onClick={() => {
				void applyLanguage(next);
			}}
		>
			{LANGUAGES.map((language) => (
				<span key={language} className={language === current ? "text-ink" : "text-quiet"}>
					{language.toUpperCase()}
				</span>
			))}
		</Button>
	);
}

export type PrivacyToggleProps = {
	hidden: boolean;
	onChange: (next: boolean) => void;
};

export function PrivacyToggle({ hidden, onChange }: PrivacyToggleProps) {
	const { t } = useTranslation();
	return (
		<Button
			size="small"
			variant="quiet"
			aria-pressed={hidden}
			aria-label={hidden ? t("privacy.show") : t("privacy.hide")}
			onClick={() => onChange(!hidden)}
			icon={<Icon name={hidden ? "eyeOff" : "eye"} />}
		/>
	);
}
