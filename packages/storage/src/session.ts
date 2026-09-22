// A session ties a person, a device and a database together, and hands out the
// repositories. Nothing in the application reaches a table except through here.

import { createHybridClock, type HybridClock } from "@cofre/core";
import { type Actor, can, type Membership, type Permission } from "./actor.ts";
import type { Driver } from "./driver.ts";
import { createAccountsRepository } from "./repositories/accounts.ts";
import { createCategoriesRepository } from "./repositories/categories.ts";
import { createChangesRepository } from "./repositories/changes.ts";
import type { RepositoryContext } from "./repositories/context.ts";
import { createInvitationsRepository } from "./repositories/invitations.ts";
import { createMembersRepository } from "./repositories/members.ts";
import { createRecurrencesRepository } from "./repositories/recurrences.ts";
import { createRulesRepository } from "./repositories/rules.ts";
import { createSavedFiltersRepository } from "./repositories/savedFilters.ts";
import { createSpacesRepository } from "./repositories/spaces.ts";
import { createTransactionsRepository } from "./repositories/transactions.ts";
import { createUsersRepository } from "./repositories/users.ts";
import type { WriteContext } from "./writer.ts";

export type SessionOptions = {
	driver: Driver;
	userId: string;
	/** Identifies this browser, phone or desktop in the change log. */
	deviceId: string;
	clock?: HybridClock;
	now?: () => number;
};

export type Session = {
	readonly actor: Actor;
	readonly driver: Driver;
	refresh(): Promise<void>;
	spaces: ReturnType<typeof createSpacesRepository>;
	members: ReturnType<typeof createMembersRepository>;
	invitations: ReturnType<typeof createInvitationsRepository>;
	accounts: ReturnType<typeof createAccountsRepository>;
	categories: ReturnType<typeof createCategoriesRepository>;
	transactions: ReturnType<typeof createTransactionsRepository>;
	rules: ReturnType<typeof createRulesRepository>;
	recurrences: ReturnType<typeof createRecurrencesRepository>;
	savedFilters: ReturnType<typeof createSavedFiltersRepository>;
	changes: ReturnType<typeof createChangesRepository>;
	users: ReturnType<typeof createUsersRepository>;
};

/** Reads which spaces a person belongs to, and with which role. */
export async function loadMemberships(driver: Driver, userId: string): Promise<Membership[]> {
	const rows = await driver.all(
		`SELECT m."space_id", m."role", m."state"
		 FROM "space_members" m
		 JOIN "spaces" s ON s."id" = m."space_id"
		 WHERE m."user_id" = ? AND m."deleted_at" IS NULL AND s."deleted_at" IS NULL`,
		[userId],
	);
	return rows.map((row) => ({
		spaceId: String(row.space_id),
		role: String(row.role) as Membership["role"],
		state: String(row.state) as Membership["state"],
	}));
}

export async function openSession(options: SessionOptions): Promise<Session> {
	const now = options.now ?? (() => Date.now());
	const clock = options.clock ?? createHybridClock(options.deviceId, now);

	const state: { actor: Actor } = {
		actor: {
			userId: options.userId,
			deviceId: options.deviceId,
			memberships: await loadMemberships(options.driver, options.userId),
		},
	};

	const write = (): WriteContext => ({
		driver: options.driver,
		actor: state.actor,
		clock,
		now,
	});

	const context: RepositoryContext = {
		driver: options.driver,
		actor: () => state.actor,
		clock,
		now,
		write,
		can: (spaceId: string, permission: Permission) => can(state.actor, spaceId, permission),
		refreshActor: async () => {
			state.actor = {
				...state.actor,
				memberships: await loadMemberships(options.driver, options.userId),
			};
		},
	};

	return {
		get actor() {
			return state.actor;
		},
		driver: options.driver,
		refresh: context.refreshActor,
		spaces: createSpacesRepository(context),
		members: createMembersRepository(context),
		invitations: createInvitationsRepository(context),
		accounts: createAccountsRepository(context),
		categories: createCategoriesRepository(context),
		transactions: createTransactionsRepository(context),
		rules: createRulesRepository(context),
		recurrences: createRecurrencesRepository(context),
		savedFilters: createSavedFiltersRepository(context),
		changes: createChangesRepository(context),
		users: createUsersRepository(context),
	};
}
