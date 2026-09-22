// The frame every screen sits in: who you are, which space you are in, and the way to
// everything else. The space is named in the header at all times, which is the whole
// defence against writing a personal expense into the family space.

import {
	Button,
	Callout,
	Icon,
	Menu,
	MenuItem,
	MenuLabel,
	Skeleton,
	type SpaceColour,
	SpaceRule,
} from "@cofre/ui";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
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
		{ to: ROUTES.dashboard, label: t("nav.dashboard"), children: [] },
		{
			to: ROUTES.transactions,
			label: t("nav.transactions"),
			children: [
				{ to: ROUTES.transactions, label: t("nav.allRecords") },
				{ to: ROUTES.invoices, label: t("nav.invoices") },
				{ to: ROUTES.calendar, label: t("nav.calendar") },
			],
		},
		{
			to: ROUTES.budget,
			label: t("nav.planning"),
			children: [
				{ to: ROUTES.budget, label: t("nav.budget") },
				{ to: ROUTES.projection, label: t("nav.projection") },
				{ to: ROUTES.investments, label: t("nav.investments") },
			],
		},
		{ to: ROUTES.reports, label: t("nav.reports"), children: [] },
		{
			to: ROUTES.accounts,
			label: t("nav.settings"),
			children: [
				{ to: ROUTES.accounts, label: t("nav.accounts") },
				{ to: ROUTES.categories, label: t("nav.categories") },
				{ to: ROUTES.data, label: t("nav.data") },
			],
		},
	];
}

function Navigation() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const path = useRouterState({ select: (state) => state.location.pathname });

	const sections = sectionsOf(t);
	const here =
		sections.find(
			(section) => section.to === path || section.children.some((child) => child.to === path),
		) ?? sections[0];

	const inside = here?.children ?? [];

	return (
		<nav aria-label={t("nav.label")}>
			{/* The section you are in is filled, not underlined. An underline is the same
			    weight as every other line on the page and disappears into it. */}
			<div className="hidden flex-wrap gap-1 pb-2 lg:flex">
				{sections.map((section) => (
					<Link
						key={section.label}
						to={section.to}
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

			{/* The screens inside the section you are in. It only appears where there is
			    more than one, so a section with a single screen adds no furniture. */}
			{inside.length > 1 ? (
				<div className="hidden flex-wrap items-center gap-1 pb-2 lg:flex">
					{inside.map((child) => (
						<Link
							key={child.to}
							to={child.to}
							className={`rounded-sm px-2.5 py-1 text-sm transition-colors ${
								child.to === path
									? "font-medium text-accent"
									: "text-quiet hover:bg-sunken hover:text-ink"
							}`}
						>
							{child.label}
						</Link>
					))}
				</div>
			) : null}

			{/* On a phone the two levels are one menu, with the grouping kept. */}
			<div className="py-1 lg:hidden">
				<Menu
					align="start"
					trigger={
						<Button size="small" variant="quiet" className="font-medium text-ink">
							{inside.find((child) => child.to === path)?.label ?? here?.label}
							<Icon name="chevronDown" className="ml-1 text-quiet" />
						</Button>
					}
				>
					{sections.map((section) =>
						section.children.length > 0 ? (
							<Fragment key={section.label}>
								<MenuLabel>{section.label}</MenuLabel>
								{section.children.map((child) => (
									<MenuItem
										key={child.to}
										onSelect={() => void navigate({ to: child.to })}
										selected={child.to === path}
										detail={child.to === path ? <Icon name="check" /> : undefined}
									>
										{child.label}
									</MenuItem>
								))}
							</Fragment>
						) : (
							<MenuItem
								key={section.label}
								onSelect={() => void navigate({ to: section.to })}
								selected={section.to === path}
								detail={section.to === path ? <Icon name="check" /> : undefined}
							>
								{section.label}
							</MenuItem>
						),
					)}
				</Menu>
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
					<Navigation />
				</div>
				<SpaceRule colour={colour} />
			</header>

			<main
				id="conteudo"
				tabIndex={-1}
				className="mx-auto max-w-5xl px-4 py-8 print:max-w-none print:px-0 print:py-0"
			>
				{cofre.persistent ? null : (
					<Callout
						tone="attention"
						title={t("shell.notPersistentTitle")}
						className="mb-6 print:hidden"
					>
						{t("shell.notPersistentBody")}
					</Callout>
				)}
				{children}
			</main>

			<CommandPalette state={palette} />
		</div>
	);
}
