// What a screen is allowed to ask for, whichever mode it is running in.
//
// The local session and the remote one both satisfy this. Declaring it here, rather
// than letting the screens depend on the local implementation, is what makes the two
// modes interchangeable instead of merely similar.

import type {
	Account,
	AccountBalance,
	AccountKind,
	Backup,
	BenefitKind,
	Budget,
	BudgetWithProgress,
	Card,
	CardKind,
	CategorizationRule,
	Category,
	CategoryTotal,
	Change,
	CreateBudgetInput,
	CreateCategoryInput,
	CreateGoalInput,
	CreateHoldingInput,
	CreateRecurrenceInput,
	CreateRuleInput,
	CreateSavedFilterInput,
	CreateScenarioInput,
	CreateTransactionInput,
	DayTotal,
	EraseEverythingResult,
	EraseResult,
	ExpenseSplit,
	Finding,
	Goal,
	GoalProgress,
	HoldingPrice,
	HoldingValue,
	ImportedRecord,
	ImportResult,
	IndexRate,
	IndexSeries,
	KnownRecord,
	MonthTotal,
	PeriodTotals,
	PersonBalance,
	PriorityTotal,
	Projection,
	RecordForExport,
	Recurrence,
	ReportRange,
	RestoreResult,
	Role,
	SavedFilter,
	SavingsProgress,
	SavingsRule,
	Scenario,
	Settlement,
	SettleSuggestion,
	Space,
	SpaceKind,
	SpaceMember,
	SplitInput,
	Transaction,
	TransactionFilter,
	TransactionKind,
	UpdateCategoryInput,
	UpdateGoalInput,
	UpdateHoldingInput,
	UpdateRecurrenceInput,
	UpdateRuleInput,
	UpdateSavedFilterInput,
	UpdateScenarioInput,
	UpdateTransactionInput,
	User,
} from "@cofre/storage";

export type CreateSpaceInput = {
	name: string;
	kind?: SpaceKind;
	colour?: string;
	icon?: string;
	baseCurrency?: string;
};

export type CreateAccountInput = {
	spaceId: string;
	kind: AccountKind;
	name: string;
	currency?: string;
	initialBalance?: number;
	institution?: string | null;
	/** Only a credit card carries these, and without them a purchase has no invoice. */
	closingDay?: number | null;
	dueDay?: number | null;
	creditLimit?: number | null;
	/** Only a voucher carries this: which pot it is, VR, VA, VT and the rest. */
	benefit?: BenefitKind | null;
};

export type CreateCardInput = {
	spaceId: string;
	kind: CardKind;
	name: string;
	lastFour?: string | null;
	creditAccountId?: string | null;
	debitAccountId?: string | null;
};

export type UpdateCardInput = {
	name?: string;
	lastFour?: string | null;
	creditAccountId?: string | null;
	debitAccountId?: string | null;
};

export type AssignableRole = Exclude<Role, "owner">;

export type CofreSession = {
	users: {
		me: () => Promise<User>;
		peers: () => Promise<User[]>;
	};
	spaces: {
		list: () => Promise<Space[]>;
		create: (input: CreateSpaceInput) => Promise<Space>;
		update: (id: string, input: { name?: string; colour?: string }) => Promise<Space>;
		remove: (id: string) => Promise<void>;
		/** Takes a space that arrived from somewhere else and has nobody in it. */
		adopt: (id: string) => Promise<Space>;
	};
	members: {
		list: (spaceId: string) => Promise<SpaceMember[]>;
		changeRole: (spaceId: string, userId: string, role: AssignableRole) => Promise<void>;
		/** Only the division that follows income reads this. Empty clears it. */
		setIncome: (spaceId: string, userId: string, monthlyIncome: number | null) => Promise<void>;
		remove: (spaceId: string, userId: string) => Promise<void>;
		leave: (spaceId: string) => Promise<void>;
	};
	accounts: {
		list: (spaceId: string, options?: { includeArchived?: boolean }) => Promise<Account[]>;
		listEverywhere: (options?: { includeArchived?: boolean }) => Promise<Account[]>;
		create: (input: CreateAccountInput) => Promise<Account>;
		update: (
			id: string,
			input: {
				name?: string;
				institution?: string | null;
				initialBalance?: number;
				benefit?: BenefitKind | null;
			},
		) => Promise<Account>;
		archive: (id: string) => Promise<Account>;
		unarchive: (id: string) => Promise<Account>;
		remove: (id: string) => Promise<void>;
	};
	/**
	 * The only door that deletes rather than hides. It is separate from everything else
	 * on purpose, so that nothing reaches it without meaning to.
	 */
	erasure: {
		eraseSpace: (spaceId: string) => Promise<EraseResult>;
		eraseEverything: () => Promise<EraseEverythingResult>;
	};
	cards: {
		list: (spaceId: string, options?: { includeArchived?: boolean }) => Promise<Card[]>;
		create: (input: CreateCardInput) => Promise<Card>;
		update: (id: string, input: UpdateCardInput) => Promise<Card>;
		archive: (id: string) => Promise<Card>;
		unarchive: (id: string) => Promise<Card>;
		remove: (id: string) => Promise<void>;
	};
	categories: {
		list: (spaceId: string, options?: { includeArchived?: boolean }) => Promise<Category[]>;
		create: (input: CreateCategoryInput) => Promise<Category>;
		update: (id: string, input: UpdateCategoryInput) => Promise<Category>;
		archive: (id: string) => Promise<Category>;
		unarchive: (id: string) => Promise<Category>;
		remove: (id: string) => Promise<void>;
		/** The starting set, written once into a space that has none. */
		installDefaults: (input: { spaceId: string; language?: "pt" | "en" }) => Promise<Category[]>;
	};
	transactions: {
		list: (filter?: TransactionFilter) => Promise<Transaction[]>;
		create: (input: CreateTransactionInput) => Promise<Transaction[]>;
		update: (id: string, input: UpdateTransactionInput) => Promise<Transaction>;
		/** The same change over a selection, all of it or none of it. */
		updateMany: (ids: string[], input: UpdateTransactionInput) => Promise<number>;
		settle: (id: string) => Promise<Transaction>;
		reconcile: (id: string, reconciled: boolean) => Promise<Transaction>;
		remove: (id: string) => Promise<void>;
		removeMany: (ids: string[]) => Promise<number>;
		removeGroup: (groupId: string) => Promise<number>;
		balances: (spaceId: string) => Promise<AccountBalance[]>;
	};
	rules: {
		list: (spaceId: string) => Promise<CategorizationRule[]>;
		create: (input: CreateRuleInput) => Promise<CategorizationRule>;
		update: (id: string, input: UpdateRuleInput) => Promise<CategorizationRule>;
		remove: (id: string) => Promise<void>;
		/** What the rules would do to one record, without writing anything. */
		suggest: (input: {
			spaceId: string;
			description: string;
			accountId: string;
			kind: TransactionKind;
		}) => Promise<CategorizationRule | null>;
		/** Runs them over the records nobody has sorted yet. Returns how many changed. */
		applyToExisting: (input: { spaceId: string; from?: string; to?: string }) => Promise<number>;
	};
	recurrences: {
		list: (spaceId: string) => Promise<Recurrence[]>;
		create: (input: CreateRecurrenceInput) => Promise<Recurrence>;
		update: (id: string, input: UpdateRecurrenceInput) => Promise<Recurrence>;
		remove: (id: string, options?: { keepPlanned?: boolean }) => Promise<number>;
		/** Writes the planned records the series owe. Safe to call on every load. */
		materialize: (input: { spaceId: string; until?: string }) => Promise<number>;
	};
	reports: {
		/** Every method takes no space for the consolidated view across the spaces. */
		totals: (range: ReportRange) => Promise<PeriodTotals>;
		byCategory: (range: ReportRange) => Promise<CategoryTotal[]>;
		incomeByCategory: (range: ReportRange) => Promise<CategoryTotal[]>;
		byPriority: (range: ReportRange) => Promise<PriorityTotal[]>;
		byMonth: (range: ReportRange) => Promise<MonthTotal[]>;
		byDay: (range: ReportRange) => Promise<DayTotal[]>;
	};
	budgets: {
		list: (spaceId: string) => Promise<Budget[]>;
		create: (input: CreateBudgetInput) => Promise<Budget>;
		update: (id: string, input: { amount?: number; month?: string | null }) => Promise<Budget>;
		remove: (id: string) => Promise<void>;
		/** Every limit that applies to a month, with what has been spent against it. */
		progress: (input: {
			spaceId: string;
			month: string;
			today?: string;
		}) => Promise<BudgetWithProgress[]>;
	};
	goals: {
		list: (spaceId: string, options?: { includeArchived?: boolean }) => Promise<Goal[]>;
		create: (input: CreateGoalInput) => Promise<Goal>;
		update: (id: string, input: UpdateGoalInput) => Promise<Goal>;
		markAchieved: (id: string) => Promise<Goal>;
		remove: (id: string) => Promise<void>;
		progress: (input: { spaceId: string; today: string }) => Promise<GoalProgress[]>;
		readRule: (spaceId: string) => Promise<SavingsRule | null>;
		setRule: (input: {
			spaceId: string;
			mode: "percent" | "fixed";
			value: number;
			accountId?: string | null;
		}) => Promise<SavingsRule>;
		clearRule: (spaceId: string) => Promise<void>;
		savings: (input: { spaceId: string; month: string }) => Promise<SavingsProgress>;
	};
	sharing: {
		splitsOf: (transactionId: string) => Promise<ExpenseSplit[]>;
		split: (input: SplitInput) => Promise<ExpenseSplit[]>;
		clearSplit: (transactionId: string) => Promise<void>;
		balances: (spaceId: string) => Promise<PersonBalance[]>;
		suggestSettlements: (spaceId: string) => Promise<SettleSuggestion[]>;
		settlements: (spaceId: string) => Promise<Settlement[]>;
		settle: (input: {
			spaceId: string;
			fromUserId: string;
			toUserId: string;
			amount: number;
			happenedOn: string;
			note?: string | null;
		}) => Promise<Settlement>;
		forgetSettlement: (id: string) => Promise<void>;
	};
	savedFilters: {
		list: (spaceId: string) => Promise<SavedFilter[]>;
		create: (input: CreateSavedFilterInput) => Promise<SavedFilter>;
		update: (id: string, input: UpdateSavedFilterInput) => Promise<SavedFilter>;
		remove: (id: string) => Promise<void>;
	};
	advice: {
		/** Everything the figures of a space have to say, heaviest first. */
		findings: (input: { spaceId: string; today: string }) => Promise<Finding[]>;
	};
	projections: {
		monthsAhead: (input: {
			spaceId: string;
			from: string;
			months: number;
			window?: number;
		}) => Promise<Projection>;
	};
	scenarios: {
		list: (spaceId: string) => Promise<Scenario[]>;
		create: (input: CreateScenarioInput) => Promise<Scenario>;
		update: (id: string, input: UpdateScenarioInput) => Promise<Scenario>;
		remove: (id: string) => Promise<void>;
	};
	investments: {
		list: (spaceId: string) => Promise<HoldingValue[]>;
		total: (spaceId: string) => Promise<{ value: number; cost: number; gain: number }>;
		create: (input: CreateHoldingInput) => Promise<HoldingValue>;
		update: (id: string, input: UpdateHoldingInput) => Promise<HoldingValue>;
		/** A new price on a day. The old one is kept, so a portfolio has a line. */
		price: (input: { id: string; unitPrice: number; onDay?: string }) => Promise<HoldingValue>;
		prices: (id: string) => Promise<HoldingPrice[]>;
		remove: (id: string) => Promise<void>;
	};
	indices: {
		list: (series: IndexSeries, range?: { from?: string; to?: string }) => Promise<IndexRate[]>;
		latest: () => Promise<Record<string, IndexRate | null>>;
		/** Asks the Banco Central for what this installation does not have. */
		refresh: (input: { series: IndexSeries[]; from: string }) => Promise<Record<string, number>>;
	};
	imports: {
		/** What the space already has around those days, so a repeat can be marked. */
		existing: (
			spaceId: string,
			range?: { from?: string; to?: string; accountId?: string },
		) => Promise<KnownRecord[]>;
		/** A whole file at once, all of it or none of it. */
		create: (input: {
			spaceId: string;
			accountId: string;
			/** The plastic the file named, when it named one. */
			cardId?: string | null;
			records: ImportedRecord[];
		}) => Promise<ImportResult>;
	};
	backup: {
		exportSpace: (spaceId: string) => Promise<Backup>;
		exportEverything: () => Promise<Backup>;
		recordsForExport: (
			spaceId: string,
			range?: { from?: string; to?: string },
		) => Promise<RecordForExport[]>;
		restore: (backup: Backup) => Promise<RestoreResult>;
	};
	changes: {
		list: (input: { spaceId: string; after?: string }) => Promise<Change[]>;
	};
	refresh: () => Promise<void>;
};

/** Inviting differs between the modes, so the screens ask before offering it. */
export type LinkInvitations = {
	create: (input: {
		spaceId: string;
		role: AssignableRole;
		email?: string | null;
	}) => Promise<{ token: string; link: string }>;
};
