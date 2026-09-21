// Signing in to a server. The same screen creates an account, because on a server
// somebody runs for themselves the two are the same visit.

import { Button, Callout, Field } from "@cofre/ui";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageToggle, ThemeToggle } from "../components/Controls.tsx";
import { useTheme } from "../lib/theme.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { createRemoteSession, ServerError } from "../storage/remoteSession.ts";

type Intent = "signIn" | "signUp";

export function SignInPage() {
	const { t } = useTranslation();
	const { client, server, adoptServerSession, chooseMode } = useCofre();
	const { choice, setChoice } = useTheme();

	const [intent, setIntent] = useState<Intent>("signIn");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	const isDark =
		choice === "dark" ||
		(choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (!client || !server || busy) return;

		setBusy(true);
		setProblem(null);
		try {
			if (intent === "signUp") {
				await client.signUp({ name: name.trim(), email: email.trim(), password });
			} else {
				await client.signIn({ email: email.trim(), password });
			}

			// A person with no space yet gets the personal one, named in their language.
			const remote = createRemoteSession(server);
			const spaces = await remote.spaces.list();
			if (spaces.length === 0) {
				await remote.spaces.create({ name: t("onboarding.personalDefault"), kind: "personal" });
			}

			await adoptServerSession();
		} catch (error) {
			if (error instanceof ServerError) {
				setProblem(intent === "signUp" ? t("signIn.signUpFailed") : t("signIn.signInFailed"));
			} else {
				setProblem(t("signIn.unreachable", { server }));
			}
			setBusy(false);
		}
	}

	return (
		<div className="mx-auto min-h-dvh max-w-md px-4 py-10">
			<div className="flex items-center justify-between gap-4">
				<p className="font-serif text-lg text-graphite">{t("app.name")}</p>
				<div className="flex items-center gap-1">
					<LanguageToggle />
					<ThemeToggle choice={choice} isDark={isDark} onChange={setChoice} />
				</div>
			</div>

			<h1 className="mt-6 text-3xl">
				{intent === "signIn" ? t("signIn.title") : t("signIn.signUpTitle")}
			</h1>
			<p className="mt-2 text-sm text-graphite">{t("signIn.connectedTo", { server })}</p>

			<form onSubmit={submit} className="mt-8 space-y-5">
				{intent === "signUp" ? (
					<Field
						label={t("onboarding.name")}
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder={t("onboarding.namePlaceholder")}
						autoComplete="name"
						required={true}
					/>
				) : null}

				<Field
					label={t("onboarding.email")}
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					placeholder={t("onboarding.emailPlaceholder")}
					type="email"
					autoComplete="email"
					required={true}
				/>

				<Field
					label={t("signIn.password")}
					hint={intent === "signUp" ? t("signIn.passwordHint") : undefined}
					value={password}
					onChange={(event) => setPassword(event.target.value)}
					type="password"
					autoComplete={intent === "signUp" ? "new-password" : "current-password"}
					required={true}
					minLength={10}
				/>

				{problem ? (
					<Callout tone="problem" title={t("signIn.failedTitle")}>
						{problem}
					</Callout>
				) : null}

				<div className="flex flex-wrap items-center gap-3">
					<Button type="submit" variant="primary" disabled={busy}>
						{busy
							? t("signIn.working")
							: intent === "signIn"
								? t("signIn.action")
								: t("signIn.signUpAction")}
					</Button>
					<Button
						variant="quiet"
						onClick={() => {
							setIntent(intent === "signIn" ? "signUp" : "signIn");
							setProblem(null);
						}}
					>
						{intent === "signIn" ? t("signIn.toSignUp") : t("signIn.toSignIn")}
					</Button>
				</div>
			</form>

			<Button
				variant="quiet"
				size="small"
				className="mt-8 px-0"
				onClick={() => void chooseMode("browser")}
			>
				{t("signIn.useThisDevice")}
			</Button>
		</div>
	);
}
