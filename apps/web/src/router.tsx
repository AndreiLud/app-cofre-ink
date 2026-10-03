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
import { readRecordsSearch } from "./lib/recordFilters.ts";
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

const accountsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/contas",
	component: lazyRouteComponent(() => import("./pages/AccountsPage.tsx"), "AccountsPage"),
});

const transactionsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/lancamentos",
	/**
	 * The filters of the list, in the address.
	 *
	 * A filtered list is a question, and a question nobody can link to, reload or hand to
	 * the other person in the space is one they have to ask again every time. The overview
	 * already had a link per account pointing here, and the screen ignored it.
	 *
	 * The names and the reading are in lib/recordFilters.ts, so the address and the screen
	 * cannot disagree about what a name means.
	 */
	validateSearch: readRecordsSearch,
	component: TransactionsPage,
});

const monthRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/mes",
	component: lazyRouteComponent(() => import("./pages/MonthPage.tsx"), "MonthPage"),
});

// The whole month on one page, made for paper. It is a screen of its own rather than a
// print stylesheet over the reports screen, because what goes on paper is a different
// order and more of it: registry 0046.
const paperRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/relatorio",
	component: lazyRouteComponent(() => import("./pages/PaperReportPage.tsx"), "PaperReportPage"),
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
	/**
	 * Which card, and which of its invoices.
	 *
	 * The overview has a block per card and every one of its buttons leads here, so the
	 * address has to be able to say which one: without this the screen always opened on
	 * whichever card came first and somebody with two of them had to find theirs again.
	 * Both are optional, and anything that is not a string is dropped rather than refused,
	 * because an address is typed by people and pasted by them too.
	 */
	validateSearch: (search: Record<string, unknown>): { cartao?: string; mes?: string } => ({
		cartao: typeof search.cartao === "string" && search.cartao !== "" ? search.cartao : undefined,
		mes:
			typeof search.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(search.mes)
				? search.mes
				: undefined,
	}),
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
	/**
	 * Which card an invoice is for, and which of its invoices, when the import was opened from
	 * the invoices of a card. Both optional and read as on the invoices screen.
	 */
	validateSearch: (search: Record<string, unknown>): { cartao?: string; mes?: string } => ({
		cartao: typeof search.cartao === "string" && search.cartao !== "" ? search.cartao : undefined,
		mes:
			typeof search.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(search.mes)
				? search.mes
				: undefined,
	}),
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
	monthRoute,
	calendarRoute,
	reportsRoute,
	budgetRoute,
	invoicesRoute,
	categoriesRoute,
	spacesRoute,
	accountsRoute,
	projectionRoute,
	investmentsRoute,
	advisorRoute,
	dataRoute,
	importRoute,
	paperRoute,
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
