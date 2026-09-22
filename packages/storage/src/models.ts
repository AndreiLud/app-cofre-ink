// The shapes the application sees. Columns are snake case in the database and camel
// case here, and the translation happens in one place per entity.

import type { MemberState, Role } from "./actor.ts";
import { asJson, asNumber, asOptionalNumber, asOptionalText, asText, type Row } from "./driver.ts";

export type SpaceKind = "personal" | "shared";
export type AccountKind = "checking" | "savings" | "cash" | "credit" | "voucher" | "investment";
/** Which pot a voucher account is. Empty on every other kind. */
export type BenefitKind = "meal" | "food" | "transport" | "culture" | "mobility";
export type CardKind = "credit" | "debit" | "multiple" | "benefit" | "prepaid";
export type ChangeOperation = "insert" | "update" | "delete";
export type TransactionKind = "income" | "expense" | "transfer";
export type TransactionStatus = "planned" | "settled";
export type CategoryKind = "expense" | "income";
export type SpendingPriority = "essential" | "important" | "desirable" | "superfluous";

export type User = {
	id: string;
	email: string;
	name: string;
	image: string | null;
	createdAt: number;
	updatedAt: number;
};

export type Space = {
	id: string;
	kind: SpaceKind;
	name: string;
	colour: string;
	icon: string;
	baseCurrency: string;
	timezone: string;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

export type SpaceMember = {
	id: string;
	spaceId: string;
	userId: string;
	role: Role;
	state: MemberState;
	invitedBy: string | null;
	acceptedAt: number | null;
	/** Only used by the split that follows income, and only when somebody fills it in. */
	monthlyIncome: number | null;
	createdAt: number;
	updatedAt: number;
};

export type Account = {
	id: string;
	spaceId: string;
	kind: AccountKind;
	name: string;
	currency: string;
	initialBalance: number;
	institution: string | null;
	archivedAt: number | null;
	/** Only a credit card has these three. */
	closingDay: number | null;
	dueDay: number | null;
	creditLimit: number | null;
	/** Only a voucher account has this: which pot it is, VR, VA, VT and the rest. */
	benefit: BenefitKind | null;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

/**
 * A piece of plastic, which is a way to reach money and not the money itself.
 *
 * It charges an invoice, or takes from a balance, or both when it is a cartao
 * multiplo. Which of the two are filled is what the kind means, and the repository
 * refuses any other combination.
 */
export type Card = {
	id: string;
	spaceId: string;
	kind: CardKind;
	name: string;
	/** The four digits a statement names it by, or nothing. */
	lastFour: string | null;
	creditAccountId: string | null;
	debitAccountId: string | null;
	archivedAt: number | null;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

/** Where the money went, and how much it was needed. Two levels, never three. */
export type Category = {
	id: string;
	spaceId: string;
	name: string;
	kind: CategoryKind;
	priority: SpendingPriority;
	parentId: string | null;
	colour: string | null;
	icon: string | null;
	position: number;
	archivedAt: number | null;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

export type Transaction = {
	id: string;
	spaceId: string;
	kind: TransactionKind;
	status: TransactionStatus;
	/** Signed minor units. Negative is money leaving. */
	amount: number;
	currency: string;
	fxRate: number | null;
	amountInBase: number;
	happenedOn: string;
	description: string;
	accountId: string;
	counterAccountId: string | null;
	notes: string | null;
	reconciledAt: number | null;
	installmentGroup: string | null;
	installmentNumber: number | null;
	installmentCount: number | null;
	invoiceMonth: string | null;
	categoryId: string | null;
	/** Empty means the priority of its category, which is the usual case. */
	priority: SpendingPriority | null;
	/** Set on the records a recurrence wrote, so the series can be followed. */
	recurrenceId: string | null;
	/** Who put the money in, which in a shared space is not always who wrote it down. */
	paidBy: string | null;
	/** What the bank called this entry, when it came from a file that said. */
	externalId: string | null;
	/** Which piece of plastic was used, when one was. The account is still the truth. */
	cardId: string | null;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

/** What an account is worth, counting what has happened and what is still planned. */
export type AccountBalance = {
	accountId: string;
	currency: string;
	settled: number;
	projected: number;
};

/**
 * A question somebody asks often, kept so they can ask it again in one click. The query
 * is whatever the screen put there, which is why it is not typed further here: the
 * screen owns its own filters and this layer only stores and returns them.
 */
export type SavedFilter = {
	id: string;
	spaceId: string;
	name: string;
	query: Record<string, unknown>;
	position: number;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

export type RecurrenceFrequency = "weekly" | "monthly" | "yearly";

/** A rule that sorts a record into a category without anybody being asked. */
export type CategorizationRule = {
	id: string;
	spaceId: string;
	matchText: string;
	accountId: string | null;
	kind: TransactionKind | null;
	categoryId: string;
	priority: SpendingPriority | null;
	position: number;
	disabledAt: number | null;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

/** Something that happens again: rent, a subscription, a salary. */
export type Recurrence = {
	id: string;
	spaceId: string;
	description: string;
	kind: TransactionKind;
	amount: number;
	currency: string;
	accountId: string;
	counterAccountId: string | null;
	categoryId: string | null;
	priority: SpendingPriority | null;
	frequency: RecurrenceFrequency;
	intervalCount: number;
	dayOfMonth: number | null;
	weekday: number | null;
	monthOfYear: number | null;
	startsOn: string;
	endsOn: string | null;
	notes: string | null;
	pausedAt: number | null;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

export type BudgetScope = "total" | "priority" | "category";
export type SavingsMode = "percent" | "fixed";

/** A limit somebody set, on everything, on a priority or on one category. */
export type Budget = {
	id: string;
	spaceId: string;
	scope: BudgetScope;
	categoryId: string | null;
	priority: SpendingPriority | null;
	/** Empty means every month. A month of its own overrides the standing one. */
	month: string | null;
	amount: number;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

export type Goal = {
	id: string;
	spaceId: string;
	name: string;
	targetAmount: number;
	targetDate: string | null;
	accountId: string;
	notes: string | null;
	achievedAt: number | null;
	archivedAt: number | null;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

/** Put money aside before anything else. One rule per space. */
export type SavingsRule = {
	id: string;
	spaceId: string;
	mode: SavingsMode;
	/** Hundredths of a percent, or minor units, depending on the mode. */
	value: number;
	accountId: string | null;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

/** The part of one expense that belongs to one person. */
export type ExpenseSplit = {
	id: string;
	spaceId: string;
	transactionId: string;
	userId: string;
	amount: number;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

export type Settlement = {
	id: string;
	spaceId: string;
	fromUserId: string;
	toUserId: string;
	amount: number;
	currency: string;
	happenedOn: string;
	note: string | null;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

export type Change = {
	id: string;
	spaceId: string;
	entity: string;
	entityId: string;
	operation: ChangeOperation;
	payload: Record<string, unknown>;
	hlc: string;
	deviceId: string;
	actorId: string | null;
	createdAt: number;
};

export function toUser(row: Row): User {
	return {
		id: asText(row.id),
		email: asText(row.email),
		name: asText(row.name),
		image: asOptionalText(row.image),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toSpace(row: Row): Space {
	return {
		id: asText(row.id),
		kind: asText(row.kind) as SpaceKind,
		name: asText(row.name),
		colour: asText(row.colour),
		icon: asText(row.icon),
		baseCurrency: asText(row.base_currency),
		timezone: asText(row.timezone),
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toSpaceMember(row: Row): SpaceMember {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		userId: asText(row.user_id),
		role: asText(row.role) as Role,
		state: asText(row.state) as MemberState,
		invitedBy: asOptionalText(row.invited_by),
		acceptedAt: asOptionalNumber(row.accepted_at),
		monthlyIncome: asOptionalNumber(row.monthly_income),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toAccount(row: Row): Account {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		kind: asText(row.kind) as AccountKind,
		name: asText(row.name),
		currency: asText(row.currency),
		initialBalance: asNumber(row.initial_balance),
		institution: asOptionalText(row.institution),
		archivedAt: asOptionalNumber(row.archived_at),
		closingDay: asOptionalNumber(row.closing_day),
		dueDay: asOptionalNumber(row.due_day),
		creditLimit: asOptionalNumber(row.credit_limit),
		benefit: asOptionalText(row.benefit) as BenefitKind | null,
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toCard(row: Row): Card {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		kind: asText(row.kind) as CardKind,
		name: asText(row.name),
		lastFour: asOptionalText(row.last_four),
		creditAccountId: asOptionalText(row.credit_account_id),
		debitAccountId: asOptionalText(row.debit_account_id),
		archivedAt: asOptionalNumber(row.archived_at),
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toCategory(row: Row): Category {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		name: asText(row.name),
		kind: asText(row.kind) as CategoryKind,
		priority: asText(row.priority) as SpendingPriority,
		parentId: asOptionalText(row.parent_id),
		colour: asOptionalText(row.colour),
		icon: asOptionalText(row.icon),
		position: asNumber(row.position),
		archivedAt: asOptionalNumber(row.archived_at),
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toTransaction(row: Row): Transaction {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		kind: asText(row.kind) as TransactionKind,
		status: asText(row.status) as TransactionStatus,
		amount: asNumber(row.amount),
		currency: asText(row.currency),
		fxRate: asOptionalNumber(row.fx_rate),
		amountInBase: asNumber(row.amount_in_base),
		happenedOn: asText(row.happened_on),
		description: asText(row.description),
		accountId: asText(row.account_id),
		counterAccountId: asOptionalText(row.counter_account_id),
		notes: asOptionalText(row.notes),
		reconciledAt: asOptionalNumber(row.reconciled_at),
		installmentGroup: asOptionalText(row.installment_group),
		installmentNumber: asOptionalNumber(row.installment_number),
		installmentCount: asOptionalNumber(row.installment_count),
		invoiceMonth: asOptionalText(row.invoice_month),
		categoryId: asOptionalText(row.category_id),
		priority: asOptionalText(row.priority) as SpendingPriority | null,
		recurrenceId: asOptionalText(row.recurrence_id),
		paidBy: asOptionalText(row.paid_by),
		externalId: asOptionalText(row.external_id),
		cardId: asOptionalText(row.card_id),
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toSavedFilter(row: Row): SavedFilter {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		name: asText(row.name),
		query: asJson<Record<string, unknown>>(row.query),
		position: asNumber(row.position),
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toCategorizationRule(row: Row): CategorizationRule {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		matchText: asText(row.match_text),
		accountId: asOptionalText(row.account_id),
		kind: asOptionalText(row.kind) as TransactionKind | null,
		categoryId: asText(row.category_id),
		priority: asOptionalText(row.priority) as SpendingPriority | null,
		position: asNumber(row.position),
		disabledAt: asOptionalNumber(row.disabled_at),
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toRecurrence(row: Row): Recurrence {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		description: asText(row.description),
		kind: asText(row.kind) as TransactionKind,
		amount: asNumber(row.amount),
		currency: asText(row.currency),
		accountId: asText(row.account_id),
		counterAccountId: asOptionalText(row.counter_account_id),
		categoryId: asOptionalText(row.category_id),
		priority: asOptionalText(row.priority) as SpendingPriority | null,
		frequency: asText(row.frequency) as RecurrenceFrequency,
		intervalCount: asNumber(row.interval_count),
		dayOfMonth: asOptionalNumber(row.day_of_month),
		weekday: asOptionalNumber(row.weekday),
		monthOfYear: asOptionalNumber(row.month_of_year),
		startsOn: asText(row.starts_on),
		endsOn: asOptionalText(row.ends_on),
		notes: asOptionalText(row.notes),
		pausedAt: asOptionalNumber(row.paused_at),
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toBudget(row: Row): Budget {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		scope: asText(row.scope) as BudgetScope,
		categoryId: asOptionalText(row.category_id),
		priority: asOptionalText(row.priority) as SpendingPriority | null,
		month: asOptionalText(row.month),
		amount: asNumber(row.amount),
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toGoal(row: Row): Goal {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		name: asText(row.name),
		targetAmount: asNumber(row.target_amount),
		targetDate: asOptionalText(row.target_date),
		accountId: asText(row.account_id),
		notes: asOptionalText(row.notes),
		achievedAt: asOptionalNumber(row.achieved_at),
		archivedAt: asOptionalNumber(row.archived_at),
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toSavingsRule(row: Row): SavingsRule {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		mode: asText(row.mode) as SavingsMode,
		value: asNumber(row.value),
		accountId: asOptionalText(row.account_id),
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toExpenseSplit(row: Row): ExpenseSplit {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		transactionId: asText(row.transaction_id),
		userId: asText(row.user_id),
		amount: asNumber(row.amount),
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toSettlement(row: Row): Settlement {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		fromUserId: asText(row.from_user_id),
		toUserId: asText(row.to_user_id),
		amount: asNumber(row.amount),
		currency: asText(row.currency),
		happenedOn: asText(row.happened_on),
		note: asOptionalText(row.note),
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export type HoldingKind =
	| "fixedIncome"
	| "fund"
	| "stock"
	| "realEstate"
	| "crypto"
	| "pension"
	| "other";

export type Holding = {
	id: string;
	spaceId: string;
	accountId: string;
	name: string;
	kind: HoldingKind;
	ticker: string | null;
	/** Scaled by ten to the eighth, because a fund has fractional quantities. */
	quantity: number;
	/** Minor units for one unit of it. */
	unitPrice: number;
	currency: string;
	/** What was paid in total, which is what a gain is measured against. */
	cost: number;
	boughtOn: string | null;
	/** The day the price was last typed in, so a stale number can say it is stale. */
	pricedOn: string | null;
	notes: string | null;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

export type HoldingPrice = {
	id: string;
	spaceId: string;
	holdingId: string;
	onDay: string;
	unitPrice: number;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

export type IndexSeries = "cdi" | "selic" | "ipca";

/** What an index did in one month, as published, in hundredths of a percent. */
export type IndexRate = {
	series: IndexSeries;
	month: string;
	rate: number;
	fetchedAt: number;
};

export type Scenario = {
	id: string;
	spaceId: string;
	name: string;
	/** Whatever the screen put there, as the saved filters do. */
	adjustments: Record<string, unknown>[];
	position: number;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
};

export function toHolding(row: Row): Holding {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		accountId: asText(row.account_id),
		name: asText(row.name),
		kind: asText(row.kind) as HoldingKind,
		ticker: asOptionalText(row.ticker),
		quantity: asNumber(row.quantity),
		unitPrice: asNumber(row.unit_price),
		currency: asText(row.currency),
		cost: asNumber(row.cost),
		boughtOn: asOptionalText(row.bought_on),
		pricedOn: asOptionalText(row.priced_on),
		notes: asOptionalText(row.notes),
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toHoldingPrice(row: Row): HoldingPrice {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		holdingId: asText(row.holding_id),
		onDay: asText(row.on_day),
		unitPrice: asNumber(row.unit_price),
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toIndexRate(row: Row): IndexRate {
	return {
		series: asText(row.series) as IndexSeries,
		month: asText(row.month),
		rate: asNumber(row.rate),
		fetchedAt: asNumber(row.fetched_at),
	};
}

export function toScenario(row: Row): Scenario {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		name: asText(row.name),
		adjustments: asJson<Record<string, unknown>[]>(row.adjustments),
		position: asNumber(row.position),
		createdBy: asText(row.created_by),
		createdAt: asNumber(row.created_at),
		updatedAt: asNumber(row.updated_at),
	};
}

export function toChange(row: Row): Change {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		entity: asText(row.entity),
		entityId: asText(row.entity_id),
		operation: asText(row.operation) as ChangeOperation,
		payload: asJson<Record<string, unknown>>(row.payload),
		hlc: asText(row.hlc),
		deviceId: asText(row.device_id),
		actorId: asOptionalText(row.actor_id),
		createdAt: asNumber(row.created_at),
	};
}
