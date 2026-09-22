// Routes are declared in code, not generated from file names, so the tree is readable
// and no build step is needed to understand where a screen lives.

import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { AccountsPage } from "./pages/AccountsPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { DesignSystemPage } from "./pages/DesignSystemPage.tsx";
import { InvitationPage } from "./pages/InvitationPage.tsx";
import { InvoicePage } from "./pages/InvoicePage.tsx";
import { MembersPage } from "./pages/MembersPage.tsx";
import { SpacesPage } from "./pages/SpacesPage.tsx";
import { TransactionsPage } from "./pages/TransactionsPage.tsx";
import { AppShell } from "./shell/AppShell.tsx";

const rootRoute = createRootRoute({
	component: () => (
		<AppShell>
			<Outlet />
		</AppShell>
	),
});

const dashboardRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: DashboardPage,
});

const spacesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/espacos",
	component: SpacesPage,
});

const membersRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/membros",
	component: MembersPage,
});

const accountsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/contas",
	component: AccountsPage,
});

const transactionsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/lancamentos",
	component: TransactionsPage,
});

const invoicesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/faturas",
	component: InvoicePage,
});

const invitationRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/convite/$token",
	component: InvitationPage,
});

const designSystemRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/designSystem",
	component: DesignSystemPage,
});

const routeTree = rootRoute.addChildren([
	dashboardRoute,
	transactionsRoute,
	invoicesRoute,
	spacesRoute,
	membersRoute,
	accountsRoute,
	invitationRoute,
	designSystemRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

export const ROUTES = {
	dashboard: "/",
	transactions: "/lancamentos",
	invoices: "/faturas",
	spaces: "/espacos",
	members: "/membros",
	accounts: "/contas",
	designSystem: "/designSystem",
} as const;
