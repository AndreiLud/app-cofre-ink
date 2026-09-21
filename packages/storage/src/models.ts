// The shapes the application sees. Columns are snake case in the database and camel
// case here, and the translation happens in one place per entity.

import type { MemberState, Role } from "./actor.ts";
import { asJson, asNumber, asOptionalNumber, asOptionalText, asText, type Row } from "./driver.ts";

export type SpaceKind = "personal" | "shared";
export type AccountKind = "checking" | "savings" | "cash" | "credit" | "voucher" | "investment";
export type ChangeOperation = "insert" | "update" | "delete";
export type TransactionKind = "income" | "expense" | "transfer";
export type TransactionStatus = "planned" | "settled";

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
