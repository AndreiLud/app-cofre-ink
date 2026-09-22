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
	[ROUTES.calendar]: "nav.calendar",
	[ROUTES.reports]: "nav.reports",
	[ROUTES.budget]: "nav.budget",
	[ROUTES.invoices]: "nav.invoices",
	[ROUTES.categories]: "nav.categories",
	[ROUTES.spaces]: "nav.spaces",
	[ROUTES.members]: "nav.members",
	[ROUTES.accounts]: "nav.accounts",
	[ROUTES.projection]: "nav.projection",
	[ROUTES.investments]: "nav.investments",
	[ROUTES.data]: "nav.data",
	[ROUTES.import]: "data.importTitle",
};

/** The screen, then the space, then the product, which is the order somebody reads. */
export function useDocumentTitle(space: string | null): void {
	const { t } = useTranslation();
	const path = useRouterState({ select: (state) => state.location.pathname });

	useEffect(() => {
		const key = NAMED[path];
		const parts = [key ? t(key) : null, space, t("app.name")].filter(Boolean);
		document.title = parts.join(" | ");
	}, [path, space, t]);
}
