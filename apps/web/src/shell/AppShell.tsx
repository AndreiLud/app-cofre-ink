// The frame every screen sits in: who you are, which space you are in, and the way to
// everything else. The space is named in the header at all times, which is the whole
// defence against writing a personal expense into the family space.

import { Button, Callout, Icon, Skeleton, type SpaceColour, SpaceRule } from "@cofre/ui";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LanguageToggle, PrivacyToggle, ThemeToggle } from "../components/Controls.tsx";
import { useTheme } from "../lib/theme.ts";
import { useDocumentTitle } from "../lib/title.ts";
import { ModeChooserPage } from "../pages/ModeChooserPage.tsx";
import { OnboardingPage } from "../pages/OnboardingPage.tsx";
import { SignInPage } from "../pages/SignInPage.tsx";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";
import { CommandPalette, useCommandPalette } from "./CommandPalette.tsx";
import { SpaceSwitcher } from "./SpaceSwitcher.tsx";

/**
 * Eleven links in a row is a list nobody reads: it is eleven decisions before the first
 * one, and on a laptop it wrapped onto two lines.
 *
 * So the screens are grouped into five, by the question somebody came to answer rather
 * than by what the code calls them. The five are always there. The screens inside the
 * one you are in are on a second line under it, and the rest are out of the way until
 * you go there. Nothing is hidden behind a gesture and nothing needs a hover.
 */
function sectionsOf(t: (key: string) => string) {
	return [
		{ to: ROUTES.dashboard, label: t("nav.dashboard"), icon: "home" as const, children: [] },
		{
			to: ROUTES.transactions,
			label: t("nav.transactions"),
			icon: "records" as const,
			children: [
				{ to: ROUTES.transactions, label: t("nav.allRecords") },
				{ to: ROUTES.invoices, label: t("nav.invoices") },
				{ to: ROUTES.calendar, label: t("nav.calendar") },
			],
		},
		{
			to: ROUTES.budget,
			label: t("nav.planning"),
			icon: "target" as const,
			children: [
				{ to: ROUTES.budget, label: t("nav.budget") },
				{ to: ROUTES.projection, label: t("nav.projection") },
				{ to: ROUTES.investments, label: t("nav.investments") },
			],
		},
		{ to: ROUTES.reports, label: t("nav.reports"), icon: "chart" as const, children: [] },
		{
			to: ROUTES.accounts,
			label: t("nav.settings"),
			icon: "settings" as const,
			children: [
				{ to: ROUTES.accounts, label: t("nav.accounts") },
				{ to: ROUTES.categories, label: t("nav.categories") },
				{ to: ROUTES.data, label: t("nav.data") },
			],
		},
	];
}

/** The five sections and the one you are in, however wide the screen is. */
function useWhereIAm() {
	const { t } = useTranslation();
	const path = useRouterState({ select: (state) => state.location.pathname });

	const sections = sectionsOf(t);
	const here =
		sections.find(
			(section) => section.to === path || section.children.some((child) => child.to === path),
		) ?? sections[0];

	return { sections, here, inside: here?.children ?? [], path };
}

/**
 * The five sections, on a wide screen, across the top.
 *
 * The one you are in is filled rather than underlined, because an underline is the
 * same weight as every other line on the page and disappears into it.
 */
function Sections() {
	const { t } = useTranslation();
	const { sections, here } = useWhereIAm();

	return (
		<nav aria-label={t("nav.label")} className="hidden md:block">
			<div className="flex flex-wrap gap-1 pb-2">
				{sections.map((section) => (
					<Link
						key={section.label}
						to={section.to}
						aria-current={section === here ? "page" : undefined}
						className={`whitespace-nowrap rounded-sm px-3 py-1.5 text-sm transition-colors ${
							section === here
								? "bg-accentSoft font-medium text-ink"
								: "text-quiet hover:bg-sunken hover:text-ink"
						}`}
					>
						{section.label}
					</Link>
				))}
			</div>
		</nav>
	);
}

/**
 * The screens inside the section you are in.
 *
 * Built like the switch the rest of the interface uses, a track with the chosen one
 * raised out of it, so that two levels of navigation do not look like two lists of
 * links with nothing to tell them apart. It sits with the content rather than in the
 * header, which is where it belongs: it moves you inside a section, not between them.
 */
function Inside() {
	const { t } = useTranslation();
	const { inside, path } = useWhereIAm();
	if (inside.length < 2) return null;

	return (
		<nav aria-label={t("nav.insideLabel")} className="print:hidden">
			<div className="flex w-fit max-w-full flex-wrap gap-1 rounded-sm border border-line bg-sunken p-1">
				{inside.map((child) => (
					<Link
						key={child.to}
						to={child.to}
						aria-current={child.to === path ? "page" : undefined}
						className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
							child.to === path
								? "bg-panel font-medium text-ink shadow-sm"
								: "text-quiet hover:text-ink"
						}`}
					>
						{child.label}
					</Link>
				))}
			</div>
		</nav>
	);
}

/**
 * On a telephone, a bar along the bottom instead of a menu.
 *
 * The menu it replaces was a word with an arrow, in a header that already had another
 * word with an arrow for switching space. Two of those, one above the other, and
 * nothing said which one moved you between screens.
 *
 * A bar shows all five at once, needs no tap to reveal itself, sits where a thumb
 * already is, and leaves the one arrow at the top meaning exactly one thing.
 */
function Bar() {
	const { t } = useTranslation();
	const { sections, here } = useWhereIAm();

	return (
		<nav
			aria-label={t("nav.label")}
			className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel md:hidden print:hidden"
			style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
		>
			<div className="flex">
				{sections.map((section) => (
					<Link
						key={section.label}
						to={section.to}
						aria-current={section === here ? "page" : undefined}
						className={`flex min-w-0 flex-1 flex-col items-center gap-1 pt-2 pb-2.5 text-[0.6875rem] leading-none transition-colors ${
							section === here ? "font-medium text-ink" : "text-quiet"
						}`}
					>
						{/* The one you are in is a filled shape and not only a colour, so it is
						    still the obvious one in grayscale or to somebody who does not see
						    the difference between these two. */}
						<span
							className={`rounded-full px-3 py-0.5 ${section === here ? "bg-accentSoft text-accent" : ""}`}
						>
							<Icon name={section.icon} size="medium" />
						</span>
						<span className="max-w-full truncate px-0.5">{section.label}</span>
					</Link>
				))}
			</div>
		</nav>
	);
}

function Loading() {
	const { t } = useTranslation();
	return (
		<div className="mx-auto max-w-5xl px-4 py-16">
			<p className="mb-6 text-sm text-quiet">{t("shell.opening")}</p>
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

	useDocumentTitle(cofre.currentSpace?.name ?? null);

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
		<div className="min-h-dvh bg-canvas text-ink">
			{/* The first thing a keyboard reaches, and the only way past a header with a
			    space switcher, a search, three toggles and two rows of links. It is out
			    of sight until it has focus, which is the whole of the pattern. */}
			<a
				href="#conteudo"
				className="sr-only rounded-sm bg-accent px-4 py-2 text-accentInk focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
			>
				{t("shell.skipToContent")}
			</a>

			{/* On the panel surface rather than the page, so the header is a thing the
			    page scrolls under instead of a piece of the page that happens to stay. */}
			<header className="sticky top-0 z-20 border-b border-line bg-panel print:hidden">
				<div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
					<div className="flex min-w-0 items-center gap-2 sm:gap-3">
						<Link to={ROUTES.dashboard} className="shrink-0 font-serif text-lg font-semibold">
							{t("app.name")}
						</Link>
						<SpaceSwitcher />
					</div>
					<div className="flex shrink-0 items-center gap-1">
						<Button
							size="small"
							variant="quiet"
							onClick={palette.open}
							icon={<Icon name="search" />}
							aria-label={t("palette.title")}
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
					<Sections />
				</div>
				<SpaceRule colour={colour} />
			</header>

			{/* Room for the bar at the bottom, which floats over the page on a telephone
			    and does not exist above it. */}
			<main
				id="conteudo"
				tabIndex={-1}
				className="mx-auto max-w-5xl space-y-5 px-4 pt-6 pb-24 md:pb-10 print:max-w-none print:px-0 print:py-0"
			>
				{cofre.persistent ? null : (
					<Callout tone="attention" title={t("shell.notPersistentTitle")} className="print:hidden">
						{t("shell.notPersistentBody")}
					</Callout>
				)}
				<Inside />
				{children}
			</main>

			<Bar />
			<CommandPalette state={palette} />
		</div>
	);
}
