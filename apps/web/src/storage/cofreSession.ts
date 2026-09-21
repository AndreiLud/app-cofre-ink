// What a screen is allowed to ask for, whichever mode it is running in.
//
// The local session and the remote one both satisfy this. Declaring it here, rather
// than letting the screens depend on the local implementation, is what makes the two
// modes interchangeable instead of merely similar.

import type {
	Account,
	AccountBalance,
	AccountKind,
	Change,
	CreateTransactionInput,
	Role,
	Space,
	SpaceKind,
	SpaceMember,
	Transaction,
	TransactionFilter,
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
	};
	members: {
		list: (spaceId: string) => Promise<SpaceMember[]>;
		changeRole: (spaceId: string, userId: string, role: AssignableRole) => Promise<void>;
		remove: (spaceId: string, userId: string) => Promise<void>;
		leave: (spaceId: string) => Promise<void>;
	};
	accounts: {
		list: (spaceId: string, options?: { includeArchived?: boolean }) => Promise<Account[]>;
		listEverywhere: (options?: { includeArchived?: boolean }) => Promise<Account[]>;
		create: (input: CreateAccountInput) => Promise<Account>;
		update: (
			id: string,
			input: { name?: string; institution?: string | null; initialBalance?: number },
		) => Promise<Account>;
		archive: (id: string) => Promise<Account>;
		unarchive: (id: string) => Promise<Account>;
		remove: (id: string) => Promise<void>;
	};
	transactions: {
		list: (filter?: TransactionFilter) => Promise<Transaction[]>;
		create: (input: CreateTransactionInput) => Promise<Transaction[]>;
		update: (id: string, input: UpdateTransactionInput) => Promise<Transaction>;
		settle: (id: string) => Promise<Transaction>;
		reconcile: (id: string, reconciled: boolean) => Promise<Transaction>;
		remove: (id: string) => Promise<void>;
		removeGroup: (groupId: string) => Promise<number>;
		balances: (spaceId: string) => Promise<AccountBalance[]>;
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
