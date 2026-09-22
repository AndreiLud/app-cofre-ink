// The first screen. Short on purpose: a name, where the money is counted, and one
// decision about demonstration data. Everything else can wait.

import { createUser, openSession } from "@cofre/storage";
import { Button, Callout, Field, Select } from "@cofre/ui";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageToggle, ThemeToggle } from "../components/Controls.tsx";
import { seedDemo } from "../demo/seed.ts";
import { useTheme } from "../lib/theme.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { deviceId } from "../storage/localProfile.ts";

const CURRENCIES = ["BRL", "USD", "EUR", "GBP"];

/**
 * The address a profile gets when nobody types one. It carries a few random letters
 * because a browser can keep the database and lose the profile identifier, and then a
 * second profile with the same name would collide with the first.
 */
function localAddress(name: string): string {
	const slug = name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "")
		.slice(0, 20);
	const tail = Math.random().toString(36).slice(2, 7);
	return `${slug === "" ? "eu" : slug}.${tail}@dispositivo.local`;
}

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
			const person = await createUser(driver, {
				name: name.trim(),
				email: email.trim() === "" ? localAddress(name) : email.trim(),
			});

			const session = await openSession({ driver, userId: person.id, deviceId: deviceId() });
			const personal = await session.spaces.create({
				name: spaceName.trim() === "" ? t("onboarding.personalDefault") : spaceName.trim(),
				kind: "personal",
				baseCurrency: currency,
			});

			// The starting set of categories, in the language the screen is in. Anybody
			// who wants none of it can throw it away in one screen.
			await session.categories.installDefaults({
				spaceId: personal.id,
				language: i18n.resolvedLanguage === "en" ? "en" : "pt",
			});

			if (withDemo) await seedDemo(driver, session, personal.id);

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
				<p className="font-serif text-lg text-quiet">{t("app.name")}</p>
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
