// The front door, and the only question that is hard to change later: where does the
// money data live.
//
// This application is served from anywhere, so the person in front of it can be
// somebody who cloned the repository and runs a server, or somebody who followed a
// link and has never heard of any of this. Both answers below are honest and neither
// of them puts a single row anywhere that belongs to this project: one keeps the
// database in the browser, the other asks them where theirs is.
//
// The first one asks nothing at all. A form between a stranger and the thing they came
// to see is a form most of them close, and every default it would have asked about can
// be corrected from inside.

import type { Driver } from "@cofre/storage";
import { Button, Callout, Field, Icon } from "@cofre/ui";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { DonateLink, LanguageToggle, ThemeToggle } from "../components/Controls.tsx";
import { Wordmark } from "../components/Wordmark.tsx";
import { sayWhy } from "../lib/sayWhy.ts";
import { useTheme } from "../lib/theme.ts";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import { chooseDestination } from "../storage/destinations.ts";
import { normaliseServer } from "../storage/mode.ts";
import { startLocalProfile } from "../storage/startProfile.ts";

/** Which of the two ways of syncing is being set up, if either. */
type Way = "server" | "database" | null;

export function ModeChooserPage() {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const { chooseMode, startHere, error } = useCofre();
	const { choice, setChoice } = useTheme();
	const [way, setWay] = useState<Way>(null);
	const [address, setAddress] = useState("http://localhost:4321");
	const [demo, setDemo] = useState(false);
	const [busy, setBusy] = useState(false);

	const isDark =
		choice === "dark" ||
		(choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

	const language = i18n.resolvedLanguage === "en" ? "en" : "pt";

	/**
	 * Everything they would have been asked, answered with what can be changed later.
	 *
	 * The demonstration data is an argument rather than the state, because the box that
	 * asks for it is inside the browser section and only that door offers it. The other
	 * door used to take the same flag along without ever having shown the box.
	 */
	function enter(driver: Driver, withDemo: boolean) {
		return startLocalProfile(driver, {
			name: t("mode.defaultName"),
			spaceName: t("onboarding.personalDefault"),
			language,
			demo: withDemo,
		});
	}

	async function keepItHere() {
		if (busy) return;
		setBusy(true);
		await startHere((driver) => enter(driver, demo));
		setBusy(false);
	}

	/**
	 * A database of theirs in the cloud needs no server and no account, so the way in is
	 * the ordinary one and the screen that asks for the address is the data screen. The
	 * destination is written down first, which is what makes that screen open on it.
	 */
	async function throughADatabase() {
		if (busy) return;
		setBusy(true);
		// Only which place, and never the fields of one. Writing the empty settings threw
		// away the address, the user and the application password of a WebDAV folder that
		// somebody had set up, and carrying them over handed a database the folder's
		// password as a token, which every run then sent to the folder's address.
		chooseDestination("database");
		void navigate({ to: ROUTES.data });
		await startHere((driver) => enter(driver, false));
		setBusy(false);
	}

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
				<Wordmark className="font-serif text-lg text-quiet" />
				<div className="flex items-center gap-1">
					<LanguageToggle />
					<ThemeToggle choice={choice} isDark={isDark} onChange={setChoice} />
					<DonateLink />
				</div>
			</div>

			<h1 className="mt-6 text-3xl">{t("mode.title")}</h1>
			<p className="mt-2 max-w-[60ch] text-quiet">{t("mode.subtitle")}</p>

			{/* In words, through the one translator. It printed what the engine threw, in
			    English, as the explanation under a Portuguese heading, and that heading
			    says a connection failed when what usually fails here is opening the
			    database in this browser, which connects to nothing. */}
			{error ? (
				<Callout tone="problem" className="mt-6" title={t("mode.failedTitle")}>
					{sayWhy(error, t)}
				</Callout>
			) : null}

			<div className="mt-8 space-y-4">
				<section className="border border-line p-5">
					<Icon name="wallet" size="medium" className="text-quiet" />
					<h2 className="mt-2 font-serif text-xl">{t("mode.browserTitle")}</h2>
					<p className="mt-2 text-sm text-quiet">{t("mode.browserBody")}</p>
					{/* Said plainly and once, in one line rather than a paragraph of red.
					    Somebody who loses a year of records to a cleared browser was told,
					    and somebody merely trying the thing out is not frightened off it.
					    What they can do about it comes straight after, in the ordinary
					    colour, because it is not a warning. */}
					<p className="mt-2 text-sm text-seal">{t("mode.browserCaveat")}</p>
					<p className="mt-1 text-sm text-quiet">{t("mode.browserLater")}</p>

					<label className="mt-4 flex items-start gap-3 text-sm">
						<input
							type="checkbox"
							checked={demo}
							onChange={(event) => setDemo(event.target.checked)}
							className="mt-1 size-4 accent-[var(--ink)]"
						/>
						<span>
							<span className="font-medium text-ink">{t("mode.demo")}</span>
							<span className="block text-quiet">{t("mode.demoHint")}</span>
						</span>
					</label>

					<Button variant="primary" className="mt-4" disabled={busy} onClick={keepItHere}>
						{busy ? t("mode.opening") : t("mode.browserAction")}
					</Button>
				</section>

				<section className="border border-line p-5">
					<Icon name="transfer" size="medium" className="text-quiet" />
					<h2 className="mt-2 font-serif text-xl">{t("mode.syncTitle")}</h2>
					<p className="mt-2 text-sm text-quiet">{t("mode.syncBody")}</p>

					{way === null ? (
						<Button variant="secondary" className="mt-4" onClick={() => setWay("server")}>
							{t("mode.syncAction")}
						</Button>
					) : (
						<div className="mt-4 space-y-4">
							<div className="flex w-fit max-w-full flex-wrap gap-1 rounded-sm border border-line bg-sunken p-1">
								{(["server", "database"] as const).map((option) => (
									<button
										key={option}
										type="button"
										aria-pressed={way === option}
										onClick={() => setWay(option)}
										className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
											way === option
												? "bg-panel font-medium text-ink shadow-sm"
												: "text-quiet hover:text-ink"
										}`}
									>
										{t(`mode.${option}Way`)}
									</button>
								))}
							</div>

							{way === "server" ? (
								<form onSubmit={connect} className="space-y-3">
									<p className="text-sm text-quiet">{t("mode.serverWayBody")}</p>
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
								<div className="space-y-3">
									<p className="text-sm text-quiet">{t("mode.databaseWayBody")}</p>
									<Button variant="primary" disabled={busy} onClick={throughADatabase}>
										{busy ? t("mode.opening") : t("mode.databaseAction")}
									</Button>
								</div>
							)}
						</div>
					)}
				</section>
			</div>

			<p className="mt-8 text-xs text-quiet">{t("mode.changeLater")}</p>
		</div>
	);
}
