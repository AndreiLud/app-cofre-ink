// Where every screen lives, as plain strings.
//
// Apart from the router on purpose. The router imports the shell, the shell names the
// screens, and a list of addresses that lived inside the router would make that a
// circle: the shell would read an empty object while the router was still being built,
// which is a blank page and a confusing morning.

export const ROUTES = {
	dashboard: "/",
	transactions: "/lancamentos",
	/** The things that happen again: rent, a subscription, a salary. */
	recurring: "/recorrentes",
	month: "/mes",
	calendar: "/calendario",
	reports: "/relatorios",
	/** The whole month on one page, made for paper and for the PDF a browser writes. */
	paper: "/relatorio",
	budget: "/orcamento",
	invoices: "/faturas",
	categories: "/categorias",
	spaces: "/espacos",
	accounts: "/contas",
	projection: "/projecao",
	investments: "/investimentos",
	advisor: "/diagnostico",
	data: "/dados",
	import: "/importar",
	designSystem: "/designSystem",
} as const;
