// Routes are declared in code, not generated from file names, so the tree is readable
// and no build step is needed to understand where a screen lives.

import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { AccountsPage } from "./pages/AccountsPage.tsx";
import { BudgetPage } from "./pages/BudgetPage.tsx";
import { CalendarPage } from "./pages/CalendarPage.tsx";
import { CategoriesPage } from "./pages/CategoriesPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { DesignSystemPage } from "./pages/DesignSystemPage.tsx";
import { InvitationPage } from "./pages/InvitationPage.tsx";
import { InvoicePage } from "./pages/InvoicePage.tsx";
import { MembersPage } from "./pages/MembersPage.tsx";
import { ReportsPage } from "./pages/ReportsPage.tsx";
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

const reportsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/relatorios",
	component: ReportsPage,
});

const budgetRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/orcamento",
	component: BudgetPage,
});

const calendarRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/calendario",
	component: CalendarPage,
});

const categoriesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/categorias",
	component: CategoriesPage,
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
	calendarRoute,
	reportsRoute,
	budgetRoute,
	invoicesRoute,
	categoriesRoute,
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
	calendar: "/calendario",
	reports: "/relatorios",
	budget: "/orcamento",
	invoices: "/faturas",
	categories: "/categorias",
	spaces: "/espacos",
	members: "/membros",
	accounts: "/contas",
	designSystem: "/designSystem",
} as const;
