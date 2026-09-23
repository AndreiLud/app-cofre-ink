// Setting up a person on this device, asked in full.
//
// It is no longer the way in: the front door makes a profile with the defaults and
// goes straight through. This is what somebody making room for a second person on the
// same machine sees, and what a browser that kept the mode and lost the profile lands
// on. Both of those are people who know what they are doing here.

import { Button, Callout, Field, Select } from "@cofre/ui";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageToggle, ThemeToggle } from "../components/Controls.tsx";
import { Wordmark } from "../components/Wordmark.tsx";
import { useTheme } from "../lib/theme.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { startLocalProfile } from "../storage/startProfile.ts";

const CURRENCIES = ["BRL", "USD", "EUR", "GBP"];

export function OnboardingPage() {
	const { t, i18n } = useTranslation();
	const { driver, adoptUser } = useCofre();
	const { choice, setChoice } = useTheme();
	const isDark =
		choice === "dark" ||
		(choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [currency, setCurrency] = useState("BRL");
	// Left empty on purpose: the placeholder follows the language, and an untouched
	// field falls back to the same word when it is submitted.
	const [spaceName, setSpaceName] = useState("");
	const [withDemo, setWithDemo] = useState(true);
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (!driver || busy) return;

		if (name.trim() === "") {
			setProblem(t("onboarding.nameMissing"));
			return;
		}

		setBusy(true);
		setProblem(null);
		try {
			const person = await startLocalProfile(driver, {
				name: name.trim(),
				email: email.trim(),
				currency,
				spaceName: spaceName.trim() === "" ? t("onboarding.personalDefault") : spaceName.trim(),
				language: i18n.resolvedLanguage === "en" ? "en" : "pt",
				demo: withDemo,
			});

			await adoptUser(person);
		} catch (error) {
			// A rule of the model has a name, so it can be said in the language of the
			// person instead of the language of the code.
			const rule =
				error !== null && typeof error === "object" && "rule" in error
					? String((error as { rule: unknown }).rule)
					: null;
			setProblem(
				rule === null
					? error instanceof Error
						? error.message
						: String(error)
					: t(`rules.${rule}`, { defaultValue: t("rules.unknown") }),
			);
			setBusy(false);
		}
	}

	return (
		<div className="mx-auto min-h-dvh max-w-xl px-4 py-10">
			<div className="flex items-center justify-between gap-4">
				<Wordmark className="font-serif text-lg text-quiet" />
				<div className="flex items-center gap-1">
					<LanguageToggle />
					<ThemeToggle choice={choice} isDark={isDark} onChange={setChoice} />
				</div>
			</div>
			<h1 className="mt-6 text-3xl">{t("onboarding.title")}</h1>
			<p className="mt-2 max-w-[55ch] text-quiet">{t("onboarding.subtitle")}</p>

			<form onSubmit={submit} className="mt-8 space-y-5">
				<Field
					label={t("onboarding.name")}
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder={t("onboarding.namePlaceholder")}
					autoComplete="name"
					required={true}
				/>

				<Field
					label={t("onboarding.email")}
					hint={t("onboarding.emailHint")}
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					placeholder={t("onboarding.emailPlaceholder")}
					type="email"
					autoComplete="email"
				/>

				<Select
					label={t("onboarding.currency")}
					value={currency}
					onChange={(event) => setCurrency(event.target.value)}
					options={CURRENCIES.map((code) => ({ value: code, label: code }))}
					hint={t("onboarding.currencyHint")}
				/>

				<Field
					label={t("onboarding.personalSpace")}
					hint={t("onboarding.personalSpaceHint")}
					value={spaceName}
					onChange={(event) => setSpaceName(event.target.value)}
					placeholder={t("onboarding.personalDefault")}
				/>

				<label className="flex items-start gap-3 text-sm">
					<input
						type="checkbox"
						checked={withDemo}
						onChange={(event) => setWithDemo(event.target.checked)}
						className="mt-1 size-4 accent-[var(--ink)]"
					/>
					<span>
						<span className="font-medium text-ink">{t("onboarding.demo")}</span>
						<span className="block text-quiet">{t("onboarding.demoHint")}</span>
					</span>
				</label>

				{problem ? (
					<Callout tone="problem" title={t("onboarding.failedTitle")}>
						{problem}
					</Callout>
				) : null}

				<div className="flex items-center gap-3 pt-2">
					<Button type="submit" variant="primary" disabled={busy}>
						{busy ? t("onboarding.working") : t("onboarding.start")}
					</Button>
					<p className="text-xs text-quiet">{t("onboarding.privacy")}</p>
				</div>
			</form>
		</div>
	);
}
