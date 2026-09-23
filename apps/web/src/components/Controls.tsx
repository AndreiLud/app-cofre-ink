import { Button, buttonClasses, Icon } from "@cofre/ui";
import { useTranslation } from "react-i18next";
import { applyLanguage, LANGUAGES, type Language } from "../i18n/index.ts";
import type { ThemeChoice } from "../lib/theme.ts";

/** Where somebody who wants to pay for this goes. The only address here that is ours. */
const DONATE = "https://cofre.ink/donate";

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

/**
 * The one link in the interface that leaves it.
 *
 * An anchor and not a button, because it goes somewhere, and it says out loud that it
 * opens a tab of its own: a control that moves the ground under somebody without
 * warning them is the kind that gets pressed once and never again.
 *
 * It wears an edge while everything beside it is a bare word or a bare icon, which is
 * the whole of the emphasis: in a row of things that change the screen, this is the one
 * that does something else. Not the filled colour, which is spoken for by the action
 * each screen is actually for.
 */
export function DonateLink() {
	const { t } = useTranslation();
	return (
		<a
			href={DONATE}
			target="_blank"
			rel="noreferrer noopener"
			className={buttonClasses({ variant: "secondary", size: "small" })}
		>
			<Icon name="heart" />
			{t("donate.label")}
			<span className="sr-only">{t("donate.newTab")}</span>
		</a>
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
