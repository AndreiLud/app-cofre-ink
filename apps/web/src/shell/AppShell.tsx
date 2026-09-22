// The frame every screen sits in: who you are, which space you are in, and the way to
// everything else. The space is named in the header at all times, which is the whole
// defence against writing a personal expense into the family space.

import { Button, Callout, Icon, Skeleton, type SpaceColour, SpaceRule } from "@cofre/ui";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LanguageToggle, PrivacyToggle, ThemeToggle } from "../components/Controls.tsx";
import { useTheme } from "../lib/theme.ts";
import { ModeChooserPage } from "../pages/ModeChooserPage.tsx";
import { OnboardingPage } from "../pages/OnboardingPage.tsx";
import { SignInPage } from "../pages/SignInPage.tsx";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import { CommandPalette, useCommandPalette } from "./CommandPalette.tsx";
import { SpaceSwitcher } from "./SpaceSwitcher.tsx";

function Navigation() {
	const { t } = useTranslation();
	const path = useRouterState({ select: (state) => state.location.pathname });

	const entries = [
		{ to: ROUTES.dashboard, label: t("nav.dashboard") },
		{ to: ROUTES.transactions, label: t("nav.transactions") },
		{ to: ROUTES.invoices, label: t("nav.invoices") },
		{ to: ROUTES.accounts, label: t("nav.accounts") },
		{ to: ROUTES.spaces, label: t("nav.spaces") },
		{ to: ROUTES.members, label: t("nav.members") },
	];

	return (
		<nav aria-label={t("nav.label")} className="flex gap-1 overflow-x-auto">
			{entries.map((entry) => (
				<Link
					key={entry.to}
					to={entry.to}
					className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
						path === entry.to
							? "border-ink font-medium text-ink"
							: "border-transparent text-graphite hover:text-ink"
					}`}
				>
					{entry.label}
				</Link>
			))}
		</nav>
	);
}

function Loading() {
	const { t } = useTranslation();
	return (
		<div className="mx-auto max-w-5xl px-4 py-16">
			<p className="mb-6 text-sm text-graphite">{t("shell.opening")}</p>
			<Skeleton lines={4} />
		</div>
	);
}

function Failure({ message }: { message: string | null }) {
	const { t } = useTranslation();
	return (
		<div className="mx-auto max-w-2xl px-4 py-16">
			<Callout tone="problem" title={t("shell.failedTitle")}>
				<p>{t("shell.failedBody")}</p>
				{message ? <p className="mt-2 font-mono text-xs">{message}</p> : null}
			</Callout>
		</div>
	);
}

/**
 * The backend that persists in the browser takes the file exclusively, so a second tab
 * cannot open it. Saying that is much better than opening an empty database, which
 * would look exactly like losing everything.
 */
function Busy() {
	const { t } = useTranslation();
	return (
		<div className="mx-auto max-w-2xl px-4 py-16">
			<Callout
				tone="attention"
				title={t("shell.busyTitle")}
				action={
					<Button variant="secondary" size="small" onClick={() => window.location.reload()}>
						{t("shell.tryAgain")}
					</Button>
				}
			>
				{t("shell.busyBody")}
			</Callout>
		</div>
	);
}

export function AppShell({ children }: { children: ReactNode }) {
	const { t } = useTranslation();
	const cofre = useCofre();
	const { choice, setChoice } = useTheme();
	const palette = useCommandPalette();

	const isDark =
		choice === "dark" ||
		(choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

	if (cofre.status === "opening") return <Loading />;
	if (cofre.status === "failed") return <Failure message={cofre.error} />;
	if (cofre.status === "busy") return <Busy />;
	if (cofre.status === "needsMode") return <ModeChooserPage />;
	if (cofre.status === "needsProfile") return <OnboardingPage />;
	// The address is kept while this shows, so signing in from an invitation link
	// lands back on the invitation.
	if (cofre.status === "needsSignIn") return <SignInPage />;

	const colour = (cofre.currentSpace?.colour ?? "slate") as SpaceColour;

	return (
		<div className="min-h-dvh bg-paper text-ink">
			<header className="sticky top-0 z-20 bg-paper">
				<div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
					<div className="flex min-w-0 items-center gap-3">
						<Link to={ROUTES.dashboard} className="font-serif text-lg font-semibold">
							{t("app.name")}
						</Link>
						<SpaceSwitcher />
					</div>
					<div className="flex items-center gap-1">
						<Button
							size="small"
							variant="quiet"
							onClick={palette.open}
							icon={<Icon name="search" />}
							aria-keyshortcuts="Control+K"
						>
							<span className="hidden font-mono text-xs md:inline">{t("palette.shortcut")}</span>
						</Button>
						<PrivacyToggle hidden={cofre.amountsHidden} onChange={cofre.setAmountsHidden} />
						<LanguageToggle />
						<ThemeToggle choice={choice} isDark={isDark} onChange={setChoice} />
					</div>
				</div>
				<div className="mx-auto max-w-5xl px-4">
					<Navigation />
				</div>
				<SpaceRule colour={colour} />
			</header>

			<main className="mx-auto max-w-5xl px-4 py-8">
				{cofre.persistent ? null : (
					<Callout tone="attention" title={t("shell.notPersistentTitle")} className="mb-6">
						{t("shell.notPersistentBody")}
					</Callout>
				)}
				{children}
			</main>

			<CommandPalette state={palette} />
		</div>
	);
}
