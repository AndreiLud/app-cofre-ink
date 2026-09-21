// People. In server and cloud mode the authentication layer owns this table, and in
// browser mode it holds the one local profile. Reading someone else is limited to
// people who share a space with you, because a name and a picture are still personal.

import { uuidV7 } from "@cofre/core";
import { readableSpaceIds } from "../actor.ts";
import type { Driver } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { toUser, type User } from "../models.ts";
import { marks } from "../sql.ts";
import type { RepositoryContext } from "./context.ts";

const SELECT = `SELECT "id", "email", "name", "image", "created_at", "updated_at" FROM "users"`;

export type CreateUserInput = {
	email: string;
	name: string;
	image?: string | null;
	id?: string;
};

/**
 * Creating a person happens before there is anyone to ask permission of, so it takes
 * the database directly instead of going through a session.
 */
export async function createUser(
	driver: Driver,
	input: CreateUserInput,
	now: () => number = Date.now,
): Promise<User> {
	const email = input.email.trim().toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new RuleError("emailLooksWrong", `"${input.email}" does not look like an email address`);
	}
	if (input.name.trim() === "") {
		throw new RuleError("nameIsRequired", "a person needs a name");
	}

	const existing = await driver.all(`${SELECT} WHERE "email" = ?`, [email]);
	if (existing.length > 0) {
		throw new RuleError("emailTaken", "there is already an account with this email address");
	}

	const id = input.id ?? uuidV7();
	const moment = now();
	await driver.run(
		`INSERT INTO "users" ("id", "email", "name", "image", "email_verified", "created_at", "updated_at")
		 VALUES (${marks(7)})`,
		[id, email, input.name.trim(), input.image ?? null, 0, moment, moment],
	);

	const rows = await driver.all(`${SELECT} WHERE "id" = ?`, [id]);
	const first = rows[0];
	if (!first) throw new NotFoundError("user", id);
	return toUser(first);
}

export async function findUserByEmail(driver: Driver, email: string): Promise<User | null> {
	const rows = await driver.all(`${SELECT} WHERE "email" = ?`, [email.trim().toLowerCase()]);
	const first = rows[0];
	return first ? toUser(first) : null;
}

/**
 * Used before opening a session, to tell a profile that was never created from one
 * whose database was wiped. The browser can drop the data and keep the identifier.
 */
export async function findUserById(driver: Driver, userId: string): Promise<User | null> {
	const rows = await driver.all(`${SELECT} WHERE "id" = ?`, [userId]);
	const first = rows[0];
	return first ? toUser(first) : null;
}

export type IdentityInput = {
	id: string;
	email: string;
	name: string;
	image?: string | null;
};

/**
 * Keeps the product's own row for a person in step with whoever signed in.
 *
 * In server mode the authentication layer owns the identity, and every space, member
 * and record in Cofre points at this row instead. One direction only: what is typed
 * in the sign in screen wins.
 */
export async function upsertUserFromIdentity(
	driver: Driver,
	identity: IdentityInput,
	now: () => number = Date.now,
): Promise<User> {
	const email = identity.email.trim().toLowerCase();
	const name = identity.name.trim() === "" ? email : identity.name.trim();
	const moment = now();

	const existing = await driver.all(`${SELECT} WHERE "id" = ?`, [identity.id]);
	if (existing.length === 0) {
		await driver.run(
			`INSERT INTO "users" ("id", "email", "name", "image", "email_verified", "created_at", "updated_at")
			 VALUES (${marks(7)})`,
			[identity.id, email, name, identity.image ?? null, 0, moment, moment],
		);
	} else {
		await driver.run(
			`UPDATE "users" SET "email" = ?, "name" = ?, "image" = ?, "updated_at" = ? WHERE "id" = ?`,
			[email, name, identity.image ?? null, moment, identity.id],
		);
	}

	const rows = await driver.all(`${SELECT} WHERE "id" = ?`, [identity.id]);
	const first = rows[0];
	if (!first) throw new NotFoundError("user", identity.id);
	return toUser(first);
}

export function createUsersRepository(context: RepositoryContext) {
	return {
		/** The person who is asking. */
		async me(): Promise<User> {
			const rows = await context.driver.all(`${SELECT} WHERE "id" = ?`, [context.actor().userId]);
			const first = rows[0];
			if (!first) throw new NotFoundError("user", context.actor().userId);
			return toUser(first);
		},

		/** Only someone who shares a space with this person, or the person themselves. */
		async get(userId: string): Promise<User> {
			const actor = context.actor();
			if (userId !== actor.userId) {
				const spaceIds = readableSpaceIds(actor);
				if (spaceIds.length === 0) throw new NotFoundError("user", userId);
				const shared = await context.driver.all(
					`SELECT "id" FROM "space_members"
					 WHERE "user_id" = ? AND "state" = 'active' AND "deleted_at" IS NULL
					 AND "space_id" IN (${marks(spaceIds.length)})`,
					[userId, ...spaceIds],
				);
				if (shared.length === 0) throw new NotFoundError("user", userId);
			}

			const rows = await context.driver.all(`${SELECT} WHERE "id" = ?`, [userId]);
			const first = rows[0];
			if (!first) throw new NotFoundError("user", userId);
			return toUser(first);
		},

		/** Everyone this person shares a space with, which is who they can mention. */
		async peers(): Promise<User[]> {
			const spaceIds = readableSpaceIds(context.actor());
			if (spaceIds.length === 0) return [];
			const rows = await context.driver.all(
				`SELECT DISTINCT u."id", u."email", u."name", u."image", u."created_at", u."updated_at"
				 FROM "users" u
				 JOIN "space_members" m ON m."user_id" = u."id"
				 WHERE m."state" = 'active' AND m."deleted_at" IS NULL
				 AND m."space_id" IN (${marks(spaceIds.length)})
				 ORDER BY u."name"`,
				spaceIds,
			);
			return rows.map(toUser);
		},
	};
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
