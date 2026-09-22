// Routes are declared in code, not generated from file names, so the tree is readable
// and no build step is needed to understand where a screen lives.

import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { AccountsPage } from "./pages/AccountsPage.tsx";
import { BudgetPage } from "./pages/BudgetPage.tsx";
import { CalendarPage } from "./pages/CalendarPage.tsx";
import { CategoriesPage } from "./pages/CategoriesPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { DataPage } from "./pages/DataPage.tsx";
import { DesignSystemPage } from "./pages/DesignSystemPage.tsx";
import { ImportPage } from "./pages/ImportPage.tsx";
import { InvestmentsPage } from "./pages/InvestmentsPage.tsx";
import { InvitationPage } from "./pages/InvitationPage.tsx";
import { InvoicePage } from "./pages/InvoicePage.tsx";
import { MembersPage } from "./pages/MembersPage.tsx";
import { ProjectionPage } from "./pages/ProjectionPage.tsx";
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

const projectionRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/projecao",
	component: ProjectionPage,
});

const investmentsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/investimentos",
	component: InvestmentsPage,
});

const dataRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/dados",
	component: DataPage,
});

const importRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/importar",
	component: ImportPage,
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
	projectionRoute,
	investmentsRoute,
	dataRoute,
	importRoute,
	invitationRoute,
	designSystemRoute,
]);

// The base of the build, so that a copy served from a folder of a domain reads and
// writes addresses inside that folder. At the root of a domain it is a single slash and
// nothing changes.
export const router = createRouter({ routeTree, basepath: import.meta.env.BASE_URL });

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
	projection: "/projecao",
	investments: "/investimentos",
	data: "/dados",
	import: "/importar",
	designSystem: "/designSystem",
} as const;
