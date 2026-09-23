// Routes are declared in code, not generated from file names, so the tree is readable
// and no build step is needed to understand where a screen lives.
//
// Two screens are in the first download and the rest are not. The overview is where
// somebody lands and the records screen is where they go next, so those two are the
// application. Everything else arrives when it is asked for, which keeps the reader of
// a PDF, the drives, the charts and the design system out of the first seconds of a
// connection that may be a telephone on a train. The worker keeps every piece once it
// has been fetched, so this costs one wait and never a second one.

import { Skeleton } from "@cofre/ui";
import {
	createRootRoute,
	createRoute,
	createRouter,
	lazyRouteComponent,
	Outlet,
} from "@tanstack/react-router";
import { DashboardPage } from "./pages/DashboardPage.tsx";
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
	component: lazyRouteComponent(() => import("./pages/SpacesPage.tsx"), "SpacesPage"),
});

const membersRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/membros",
	component: lazyRouteComponent(() => import("./pages/MembersPage.tsx"), "MembersPage"),
});

const accountsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/contas",
	component: lazyRouteComponent(() => import("./pages/AccountsPage.tsx"), "AccountsPage"),
});

const transactionsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/lancamentos",
	component: TransactionsPage,
});

const reportsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/relatorios",
	component: lazyRouteComponent(() => import("./pages/ReportsPage.tsx"), "ReportsPage"),
});

const budgetRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/orcamento",
	component: lazyRouteComponent(() => import("./pages/BudgetPage.tsx"), "BudgetPage"),
});

const calendarRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/calendario",
	component: lazyRouteComponent(() => import("./pages/CalendarPage.tsx"), "CalendarPage"),
});

const categoriesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/categorias",
	component: lazyRouteComponent(() => import("./pages/CategoriesPage.tsx"), "CategoriesPage"),
});

const invoicesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/faturas",
	component: lazyRouteComponent(() => import("./pages/InvoicePage.tsx"), "InvoicePage"),
});

const projectionRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/projecao",
	component: lazyRouteComponent(() => import("./pages/ProjectionPage.tsx"), "ProjectionPage"),
});

const investmentsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/investimentos",
	component: lazyRouteComponent(() => import("./pages/InvestmentsPage.tsx"), "InvestmentsPage"),
});

const advisorRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/diagnostico",
	component: lazyRouteComponent(() => import("./pages/AdvisorPage.tsx"), "AdvisorPage"),
});

const dataRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/dados",
	component: lazyRouteComponent(() => import("./pages/DataPage.tsx"), "DataPage"),
});

const importRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/importar",
	component: lazyRouteComponent(() => import("./pages/ImportPage.tsx"), "ImportPage"),
});

const invitationRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/convite/$token",
	component: lazyRouteComponent(() => import("./pages/InvitationPage.tsx"), "InvitationPage"),
});

const designSystemRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/designSystem",
	component: lazyRouteComponent(() => import("./pages/DesignSystemPage.tsx"), "DesignSystemPage"),
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
	advisorRoute,
	dataRoute,
	importRoute,
	invitationRoute,
	designSystemRoute,
]);

// The base of the build, so that a copy served from a folder of a domain reads and
// writes addresses inside that folder. At the root of a domain it is a single slash and
// nothing changes.
export const router = createRouter({
	routeTree,
	basepath: import.meta.env.BASE_URL,
	// While a screen is being fetched. The same skeleton every other wait uses, so a
	// slow connection looks like a slow query and not like a broken page.
	defaultPendingComponent: () => <Skeleton lines={5} />,
	defaultPendingMs: 150,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

export { ROUTES } from "./routes.ts";
