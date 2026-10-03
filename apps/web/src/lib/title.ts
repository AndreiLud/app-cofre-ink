// What the tab is called.
//
// A single page application keeps whatever title the first page had, so every tab says
// "Cofre" and somebody with six of them open is guessing. It also means a screen reader
// announces nothing when the screen changes, because the thing it announces is the
// title. Both are the same fix.

import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ROUTES } from "../routes.ts";

const NAMED: Record<string, string> = {
	[ROUTES.dashboard]: "nav.dashboard",
	[ROUTES.transactions]: "nav.transactions",
	[ROUTES.recurring]: "nav.recurring",
	[ROUTES.month]: "nav.month",
	[ROUTES.calendar]: "nav.calendar",
	[ROUTES.reports]: "nav.reports",
	[ROUTES.budget]: "nav.budget",
	[ROUTES.advisor]: "nav.advisor",
	[ROUTES.invoices]: "nav.invoices",
	[ROUTES.categories]: "nav.categories",
	[ROUTES.spaces]: "nav.spaces",
	[ROUTES.accounts]: "nav.accounts",
	[ROUTES.projection]: "nav.projection",
	[ROUTES.investments]: "nav.investments",
	[ROUTES.data]: "nav.data",
	[ROUTES.import]: "data.importTitle",
};

/**
 * The screens that name themselves, which this one leaves alone.
 *
 * The month on paper is the only one, and it is not a preference: the title of the document
 * is the name a browser suggests for the file when somebody chooses Save as PDF, so that
 * page writes `cofre_relatorio_2026-09` and means it. Both effects were running, and which
 * one won was whichever ran last: the page set its name first and this one wrote "Pessoal |
 * Cofre Ink" over it the moment the space arrived, so the file came out named after the tab.
 * The browser tests did not catch it because a title assertion succeeds the first time it
 * matches, and it matched for a moment.
 */
const OWNS_ITS_NAME = new Set<string>([ROUTES.paper]);

/** The screen, then the space, then the product, which is the order somebody reads. */
export function useDocumentTitle(space: string | null): void {
	const { t } = useTranslation();
	const path = useRouterState({ select: (state) => state.location.pathname });

	useEffect(() => {
		if (OWNS_ITS_NAME.has(path)) return;
		const key = NAMED[path];
		const parts = [key ? t(key) : null, space, t("app.name")].filter(Boolean);
		document.title = parts.join(" | ");
	}, [path, space, t]);
}
