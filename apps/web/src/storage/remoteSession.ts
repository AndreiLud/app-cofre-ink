// The same session, over the network.
//
// In server mode the repository layer runs on the server, because that is the only
// place where a permission check cannot be edited by whoever is holding the browser.
// What the screens get back has the same shape as the local one, so no screen knows
// which of the two it is talking to.

import { pickRule } from "@cofre/core";
import type {
	Account,
	AccountBalance,
	Budget,
	BudgetWithProgress,
	CategorizationRule,
	Category,
	CategoryTotal,
	Change,
	CreateBudgetInput,
	CreateCategoryInput,
	CreateGoalInput,
	CreateRecurrenceInput,
	CreateRuleInput,
	CreateSavedFilterInput,
	CreateTransactionInput,
	DayTotal,
	ExpenseSplit,
	Goal,
	GoalProgress,
	Invitation,
	MonthTotal,
	PeriodTotals,
	PersonBalance,
	PriorityTotal,
	Recurrence,
	ReportRange,
	SavedFilter,
	SavingsProgress,
	SavingsRule,
	Settlement,
	SettleSuggestion,
	Space,
	SpaceMember,
	SplitInput,
	Transaction,
	TransactionFilter,
	TransactionKind,
	UpdateCategoryInput,
	UpdateGoalInput,
	UpdateRecurrenceInput,
	UpdateRuleInput,
	UpdateSavedFilterInput,
	UpdateTransactionInput,
	User,
} from "@cofre/storage";
import type {
	AssignableRole,
	CofreSession,
	CreateAccountInput,
	CreateSpaceInput,
} from "./cofreSession.ts";

export type ServerProblem = {
	status: number;
	error: string;
	message?: string;
};

export class ServerError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(problem: ServerProblem) {
		super(problem.message ?? problem.error);
		this.name = "ServerError";
		this.status = problem.status;
		this.code = problem.error;
	}
}

export type InvitationWithLink = Invitation & { link: string };

/** Inviting by link exists only on the server, so it is named apart from the rest. */
export type RemoteInvitations = {
	list: (spaceId: string) => Promise<Invitation[]>;
	create: (input: {
		spaceId: string;
		role: AssignableRole;
		email?: string | null;
	}) => Promise<InvitationWithLink>;
	revoke: (spaceId: string, id: string) => Promise<void>;
	accept: (token: string) => Promise<{ spaceId: string; role: string }>;
};

export type InvitationPreview = {
	spaceName: string;
	spaceColour: string;
	role: string;
	invitedByName: string;
	expiresAt: number;
};

async function call<T>(server: string, path: string, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);
	if (init.body !== undefined) headers.set("Content-Type", "application/json");

	const response = await fetch(`${server}${path}`, {
		...init,
		headers,
		// The session lives in a cookie the server set, so it has to travel.
		credentials: "include",
	});

	if (response.status === 204) return undefined as T;

	const text = await response.text();
	const body = text === "" ? {} : (JSON.parse(text) as Record<string, unknown>);

	if (!response.ok) {
		throw new ServerError({
			status: response.status,
			error: typeof body.error === "string" ? body.error : "unexpected",
			message: typeof body.message === "string" ? body.message : undefined,
		});
	}
	return body as T;
}

/**
 * A report is one route with the kind in it, because six routes that differ by a word
 * would be six places to forget the same permission check.
 */
function reportPath(kind: string, range: ReportRange): string {
	const query = new URLSearchParams({ kind, from: range.from, to: range.to });
	if (range.spaceId) query.set("spaceId", range.spaceId);
	if (range.includePlanned) query.set("includePlanned", "true");
	return `/api/reports?${query.toString()}`;
}

export function createServerClient(server: string) {
	const get = <T>(path: string) => call<T>(server, path);
	const send = <T>(path: string, method: string, body?: unknown) =>
		call<T>(server, path, {
			method,
			body: body === undefined ? undefined : JSON.stringify(body),
		});

	return {
		server,

		signUp: (person: { name: string; email: string; password: string }) =>
			send<unknown>("/api/auth/sign-up/email", "POST", person),

		signIn: (person: { email: string; password: string }) =>
			send<unknown>("/api/auth/sign-in/email", "POST", person),

		signOut: () => send<unknown>("/api/auth/sign-out", "POST", {}),

		me: () => get<{ user: User; spaces: Space[] }>("/api/me"),

		previewInvitation: (token: string) =>
			get<InvitationPreview>(`/api/invitations/${encodeURIComponent(token)}`),
	};
}

export type ServerClient = ReturnType<typeof createServerClient>;

/**
 * Builds the object the screens use. Every method is one call, named after the thing
 * it does rather than after the route, which is what keeps the two modes swappable.
 */
export function createRemoteSession(
	server: string,
): CofreSession & { invitations: RemoteInvitations } {
	const get = <T>(path: string) => call<T>(server, path);
	const send = <T>(path: string, method: string, body?: unknown) =>
		call<T>(server, path, {
			method,
			body: body === undefined ? undefined : JSON.stringify(body),
		});

	return {
		users: {
			me: async () => (await get<{ user: User }>("/api/me")).user,
			peers: () => get<User[]>("/api/peers"),
		},

		spaces: {
			list: () => get<Space[]>("/api/spaces"),
			create: (input: CreateSpaceInput) => send<Space>("/api/spaces", "POST", input),
			update: (id: string, input: { name?: string; colour?: string }) =>
				send<Space>(`/api/spaces/${id}`, "PATCH", input),
			remove: (id: string) => send<void>(`/api/spaces/${id}`, "DELETE"),
		},

		members: {
			list: (spaceId: string) => get<SpaceMember[]>(`/api/spaces/${spaceId}/members`),
			changeRole: (spaceId: string, userId: string, role: AssignableRole) =>
				send<void>(`/api/spaces/${spaceId}/members/${userId}`, "PATCH", { role }),
			setIncome: (spaceId: string, userId: string, monthlyIncome: number | null) =>
				send<void>(`/api/spaces/${spaceId}/members/${userId}`, "PATCH", { monthlyIncome }),
			remove: (spaceId: string, userId: string) =>
				send<void>(`/api/spaces/${spaceId}/members/${userId}`, "DELETE"),
			leave: (spaceId: string) => send<void>(`/api/spaces/${spaceId}/leave`, "POST", {}),
		},

		invitations: {
			list: (spaceId: string) => get<Invitation[]>(`/api/spaces/${spaceId}/invitations`),
			create: (input: { spaceId: string; role: AssignableRole; email?: string | null }) =>
				send<InvitationWithLink>(`/api/spaces/${input.spaceId}/invitations`, "POST", {
					role: input.role,
					email: input.email ?? null,
				}),
			revoke: (spaceId: string, id: string) =>
				send<void>(`/api/spaces/${spaceId}/invitations/${id}`, "DELETE"),
			accept: (token: string) =>
				send<{ spaceId: string; role: string }>(
					`/api/invitations/${encodeURIComponent(token)}/accept`,
					"POST",
					{},
				),
		},

		accounts: {
			list: (spaceId: string, options: { includeArchived?: boolean } = {}) =>
				get<Account[]>(
					`/api/spaces/${spaceId}/accounts${options.includeArchived ? "?archived=true" : ""}`,
				),
			listEverywhere: async (options: { includeArchived?: boolean } = {}) => {
				const spaces = await get<Space[]>("/api/spaces");
				const lists = await Promise.all(
					spaces.map((space) =>
						get<Account[]>(
							`/api/spaces/${space.id}/accounts${options.includeArchived ? "?archived=true" : ""}`,
						),
					),
				);
				return lists.flat().sort((left, right) => left.name.localeCompare(right.name));
			},
			create: (input: CreateAccountInput) => {
				const { spaceId, ...rest } = input;
				return send<Account>(`/api/spaces/${spaceId}/accounts`, "POST", rest);
			},
			update: (
				id: string,
				input: { name?: string; institution?: string | null; initialBalance?: number },
			) => send<Account>(`/api/accounts/${id}`, "PATCH", input),
			archive: (id: string) => send<Account>(`/api/accounts/${id}/archive`, "POST", {}),
			unarchive: (id: string) => send<Account>(`/api/accounts/${id}/unarchive`, "POST", {}),
			remove: (id: string) => send<void>(`/api/accounts/${id}`, "DELETE"),
		},

		categories: {
			list: (spaceId: string, options: { includeArchived?: boolean } = {}) =>
				get<Category[]>(
					`/api/spaces/${spaceId}/categories${options.includeArchived ? "?archived=true" : ""}`,
				),
			create: (input: CreateCategoryInput) => {
				const { spaceId, ...rest } = input;
				return send<Category>(`/api/spaces/${spaceId}/categories`, "POST", rest);
			},
			update: (id: string, input: UpdateCategoryInput) =>
				send<Category>(`/api/categories/${id}`, "PATCH", input),
			archive: (id: string) => send<Category>(`/api/categories/${id}/archive`, "POST", {}),
			unarchive: (id: string) => send<Category>(`/api/categories/${id}/unarchive`, "POST", {}),
			remove: (id: string) => send<void>(`/api/categories/${id}`, "DELETE"),
			installDefaults: (input: { spaceId: string; language?: "pt" | "en" }) =>
				send<Category[]>(`/api/spaces/${input.spaceId}/categories/defaults`, "POST", {
					language: input.language,
				}),
		},

		transactions: {
			list: (filter: TransactionFilter = {}) => {
				const { spaceId, limit, categoryIds, ...rest } = filter;
				const query = new URLSearchParams();
				for (const [name, value] of Object.entries(rest)) {
					if (value !== undefined && value !== "") query.set(name, String(value));
				}
				if (categoryIds && categoryIds.length > 0) query.set("categoryIds", categoryIds.join(","));
				if (limit !== undefined) query.set("limit", String(limit));
				const search = query.toString();
				// Without a space the server would have to walk every space of the person,
				// so the interface always asks about the one that is open.
				return get<Transaction[]>(
					`/api/spaces/${spaceId ?? ""}/transactions${search === "" ? "" : `?${search}`}`,
				);
			},
			create: (input: CreateTransactionInput) => {
				const { spaceId, ...rest } = input;
				return send<Transaction[]>(`/api/spaces/${spaceId}/transactions`, "POST", rest);
			},
			update: (id: string, input: UpdateTransactionInput) =>
				send<Transaction>(`/api/transactions/${id}`, "PATCH", input),
			updateMany: async (ids: string[], input: UpdateTransactionInput) =>
				ids.length === 0
					? 0
					: (await send<{ changed: number }>("/api/transactions", "PATCH", { ids, patch: input }))
							.changed,
			settle: (id: string) => send<Transaction>(`/api/transactions/${id}/settle`, "POST", {}),
			reconcile: (id: string, reconciled: boolean) =>
				send<Transaction>(`/api/transactions/${id}/reconcile`, "POST", { reconciled }),
			remove: (id: string) => send<void>(`/api/transactions/${id}`, "DELETE"),
			removeMany: async (ids: string[]) =>
				ids.length === 0
					? 0
					: (await send<{ removed: number }>("/api/transactions/remove", "POST", { ids })).removed,
			removeGroup: async (groupId: string) =>
				(await send<{ removed: number }>(`/api/installments/${groupId}`, "DELETE")).removed,
			balances: (spaceId: string) => get<AccountBalance[]>(`/api/spaces/${spaceId}/balances`),
		},

		rules: {
			list: (spaceId: string) => get<CategorizationRule[]>(`/api/spaces/${spaceId}/rules`),
			create: (input: CreateRuleInput) => {
				const { spaceId, ...rest } = input;
				return send<CategorizationRule>(`/api/spaces/${spaceId}/rules`, "POST", rest);
			},
			update: (id: string, input: UpdateRuleInput) =>
				send<CategorizationRule>(`/api/rules/${id}`, "PATCH", input),
			remove: (id: string) => send<void>(`/api/rules/${id}`, "DELETE"),
			suggest: async (input: {
				spaceId: string;
				description: string;
				accountId: string;
				kind: TransactionKind;
			}) => {
				// The server answers this one by writing nothing, so it is a plain read of
				// the rules and the same choosing logic the repository uses.
				const rules = await get<CategorizationRule[]>(`/api/spaces/${input.spaceId}/rules`);
				return (
					pickRule(
						rules.filter((rule) => rule.disabledAt === null),
						input,
					) ?? null
				);
			},
			applyToExisting: async (input: { spaceId: string; from?: string; to?: string }) => {
				const { spaceId, ...rest } = input;
				return (await send<{ sorted: number }>(`/api/spaces/${spaceId}/rules/apply`, "POST", rest))
					.sorted;
			},
		},

		recurrences: {
			list: (spaceId: string) => get<Recurrence[]>(`/api/spaces/${spaceId}/recurrences`),
			create: (input: CreateRecurrenceInput) => {
				const { spaceId, ...rest } = input;
				return send<Recurrence>(`/api/spaces/${spaceId}/recurrences`, "POST", rest);
			},
			update: (id: string, input: UpdateRecurrenceInput) =>
				send<Recurrence>(`/api/recurrences/${id}`, "PATCH", input),
			remove: async (id: string, options: { keepPlanned?: boolean } = {}) =>
				(
					await send<{ removed: number }>(
						`/api/recurrences/${id}${options.keepPlanned ? "?keepPlanned=true" : ""}`,
						"DELETE",
					)
				).removed,
			materialize: async (input: { spaceId: string; until?: string }) =>
				(
					await send<{ written: number }>(
						`/api/spaces/${input.spaceId}/recurrences/materialize`,
						"POST",
						{ until: input.until },
					)
				).written,
		},

		reports: {
			totals: (range: ReportRange) => get<PeriodTotals>(reportPath("totals", range)),
			byCategory: (range: ReportRange) => get<CategoryTotal[]>(reportPath("byCategory", range)),
			incomeByCategory: (range: ReportRange) =>
				get<CategoryTotal[]>(reportPath("incomeByCategory", range)),
			byPriority: (range: ReportRange) => get<PriorityTotal[]>(reportPath("byPriority", range)),
			byMonth: (range: ReportRange) => get<MonthTotal[]>(reportPath("byMonth", range)),
			byDay: (range: ReportRange) => get<DayTotal[]>(reportPath("byDay", range)),
		},

		budgets: {
			list: (spaceId: string) => get<Budget[]>(`/api/spaces/${spaceId}/budgets`),
			create: (input: CreateBudgetInput) => {
				const { spaceId, ...rest } = input;
				return send<Budget>(`/api/spaces/${spaceId}/budgets`, "POST", rest);
			},
			update: (id: string, input: { amount?: number; month?: string | null }) =>
				send<Budget>(`/api/budgets/${id}`, "PATCH", input),
			remove: (id: string) => send<void>(`/api/budgets/${id}`, "DELETE"),
			progress: (input: { spaceId: string; month: string; today?: string }) =>
				get<BudgetWithProgress[]>(
					`/api/spaces/${input.spaceId}/budgets/progress?month=${input.month}${
						input.today ? `&today=${input.today}` : ""
					}`,
				),
		},

		goals: {
			list: (spaceId: string, options: { includeArchived?: boolean } = {}) =>
				get<Goal[]>(
					`/api/spaces/${spaceId}/goals${options.includeArchived ? "?archived=true" : ""}`,
				),
			create: (input: CreateGoalInput) => {
				const { spaceId, ...rest } = input;
				return send<Goal>(`/api/spaces/${spaceId}/goals`, "POST", rest);
			},
			update: (id: string, input: UpdateGoalInput) =>
				send<Goal>(`/api/goals/${id}`, "PATCH", input),
			markAchieved: (id: string) => send<Goal>(`/api/goals/${id}/achieved`, "POST", {}),
			remove: (id: string) => send<void>(`/api/goals/${id}`, "DELETE"),
			progress: (input: { spaceId: string; today: string }) =>
				get<GoalProgress[]>(`/api/spaces/${input.spaceId}/goals/progress?today=${input.today}`),
			readRule: (spaceId: string) => get<SavingsRule | null>(`/api/spaces/${spaceId}/savings`),
			setRule: (input: {
				spaceId: string;
				mode: "percent" | "fixed";
				value: number;
				accountId?: string | null;
			}) => {
				const { spaceId, ...rest } = input;
				return send<SavingsRule>(`/api/spaces/${spaceId}/savings`, "POST", rest);
			},
			clearRule: (spaceId: string) => send<void>(`/api/spaces/${spaceId}/savings`, "DELETE"),
			savings: (input: { spaceId: string; month: string }) =>
				get<SavingsProgress>(`/api/spaces/${input.spaceId}/savings/progress?month=${input.month}`),
		},

		sharing: {
			splitsOf: (transactionId: string) =>
				get<ExpenseSplit[]>(`/api/transactions/${transactionId}/splits`),
			split: (input: SplitInput) => {
				const { transactionId, ...rest } = input;
				return send<ExpenseSplit[]>(`/api/transactions/${transactionId}/splits`, "POST", rest);
			},
			clearSplit: (transactionId: string) =>
				send<void>(`/api/transactions/${transactionId}/splits`, "DELETE"),
			balances: (spaceId: string) =>
				get<PersonBalance[]>(`/api/spaces/${spaceId}/sharing/balances`),
			suggestSettlements: (spaceId: string) =>
				get<SettleSuggestion[]>(`/api/spaces/${spaceId}/sharing/suggested`),
			settlements: (spaceId: string) =>
				get<Settlement[]>(`/api/spaces/${spaceId}/sharing/settlements`),
			settle: (input: {
				spaceId: string;
				fromUserId: string;
				toUserId: string;
				amount: number;
				happenedOn: string;
				note?: string | null;
			}) => {
				const { spaceId, ...rest } = input;
				return send<Settlement>(`/api/spaces/${spaceId}/sharing/settlements`, "POST", rest);
			},
			forgetSettlement: (id: string) => send<void>(`/api/settlements/${id}`, "DELETE"),
		},

		savedFilters: {
			list: (spaceId: string) => get<SavedFilter[]>(`/api/spaces/${spaceId}/filters`),
			create: (input: CreateSavedFilterInput) => {
				const { spaceId, ...rest } = input;
				return send<SavedFilter>(`/api/spaces/${spaceId}/filters`, "POST", rest);
			},
			update: (id: string, input: UpdateSavedFilterInput) =>
				send<SavedFilter>(`/api/filters/${id}`, "PATCH", input),
			remove: (id: string) => send<void>(`/api/filters/${id}`, "DELETE"),
		},

		changes: {
			list: (input: { spaceId: string; after?: string }) =>
				get<Change[]>(
					`/api/spaces/${input.spaceId}/changes${input.after ? `?after=${encodeURIComponent(input.after)}` : ""}`,
				),
		},

		refresh: async () => {
			await get<{ user: User }>("/api/me");
		},
	};
}

export type RemoteSession = ReturnType<typeof createRemoteSession>;
