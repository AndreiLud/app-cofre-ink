// The first question, and the only one that is hard to change later: where does the
// money data live. Both answers are honest, so the screen explains the consequence of
// each instead of nudging.

import { Button, Callout, Field, Icon } from "@cofre/ui";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageToggle, ThemeToggle } from "../components/Controls.tsx";
import { useTheme } from "../lib/theme.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { normaliseServer } from "../storage/mode.ts";

export function ModeChooserPage() {
	const { t } = useTranslation();
	const { chooseMode, error } = useCofre();
	const { choice, setChoice } = useTheme();
	const [askingServer, setAskingServer] = useState(false);
	const [address, setAddress] = useState("http://localhost:4321");
	const [busy, setBusy] = useState(false);

	const isDark =
		choice === "dark" ||
		(choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

	async function connect(event: FormEvent) {
		event.preventDefault();
		if (busy) return;
		setBusy(true);
		await chooseMode("server", normaliseServer(address));
		setBusy(false);
	}

	return (
		<div className="mx-auto min-h-dvh max-w-2xl px-4 py-10">
			<div className="flex items-center justify-between gap-4">
				<p className="font-serif text-lg text-graphite">{t("app.name")}</p>
				<div className="flex items-center gap-1">
					<LanguageToggle />
					<ThemeToggle choice={choice} isDark={isDark} onChange={setChoice} />
				</div>
			</div>

			<h1 className="mt-6 text-3xl">{t("mode.title")}</h1>
			<p className="mt-2 max-w-[60ch] text-graphite">{t("mode.subtitle")}</p>

			{error ? (
				<Callout tone="problem" className="mt-6" title={t("mode.failedTitle")}>
					{error}
				</Callout>
			) : null}

			<div className="mt-8 grid gap-4 md:grid-cols-2">
				<section className="flex flex-col justify-between gap-4 border border-rule p-5">
					<div className="space-y-2">
						<Icon name="wallet" size="medium" className="text-graphite" />
						<h2 className="font-serif text-xl">{t("mode.browserTitle")}</h2>
						<p className="text-sm text-graphite">{t("mode.browserBody")}</p>
						<p className="text-xs text-graphite">{t("mode.browserCaveat")}</p>
					</div>
					<Button variant="primary" onClick={() => void chooseMode("browser")}>
						{t("mode.browserAction")}
					</Button>
				</section>

				<section className="flex flex-col justify-between gap-4 border border-rule p-5">
					<div className="space-y-2">
						<Icon name="transfer" size="medium" className="text-graphite" />
						<h2 className="font-serif text-xl">{t("mode.serverTitle")}</h2>
						<p className="text-sm text-graphite">{t("mode.serverBody")}</p>
						<p className="text-xs text-graphite">{t("mode.serverCaveat")}</p>
					</div>

					{askingServer ? (
						<form onSubmit={connect} className="space-y-3">
							<Field
								label={t("mode.serverAddress")}
								hint={t("mode.serverAddressHint")}
								value={address}
								onChange={(event) => setAddress(event.target.value)}
								placeholder="http://localhost:4321"
								required={true}
							/>
							<Button type="submit" variant="primary" disabled={busy}>
								{busy ? t("mode.connecting") : t("mode.connect")}
							</Button>
						</form>
					) : (
						<Button variant="secondary" onClick={() => setAskingServer(true)}>
							{t("mode.serverAction")}
						</Button>
					)}
				</section>
			</div>

			<p className="mt-8 text-xs text-graphite">{t("mode.changeLater")}</p>
		</div>
	);
}
