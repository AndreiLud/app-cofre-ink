// Where every screen lives, as plain strings.
//
// Apart from the router on purpose. The router imports the shell, the shell names the
// screens, and a list of addresses that lived inside the router would make that a
// circle: the shell would read an empty object while the router was still being built,
// which is a blank page and a confusing morning.

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
