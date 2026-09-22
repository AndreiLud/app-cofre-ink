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

/**
 * Everybody who has a profile in this database, so that a browser can offer to change
 * between them: one machine at home, two people, a Cofre each.
 *
 * A profile is somebody who owns a personal space here, and that is the difference
 * between a person and a row in the people table. A shared space brings the names of
 * the people in it along with the records that point at them, so the table also holds
 * somebody who has never touched this machine and never will. Offering to become them
 * would be offering to read a space as a person who cannot open it.
 *
 * It takes the database directly, and that is the whole of its contract: it is for the
 * browser, where the database belongs to the device in front of you. On a server the
 * same question is asked through a session, which answers only for people who share a
 * space, because there a list of everybody is a list of the customers.
 */
export async function listProfiles(driver: Driver): Promise<User[]> {
	const rows = await driver.all(
		`${SELECT} u WHERE EXISTS (
			SELECT 1 FROM "spaces" s
			JOIN "space_members" m ON m."space_id" = s."id"
			WHERE s."kind" = 'personal' AND s."deleted_at" IS NULL
			  AND m."user_id" = u."id" AND m."deleted_at" IS NULL AND m."role" = 'owner'
		 )
		 ORDER BY u."created_at"`,
	);
	return rows.map(toUser);
}

/**
 * The name of a profile on this device, changed.
 *
 * It takes the database directly, like the rest of what the browser does before there
 * is anybody to ask permission of, and it is for the browser alone. On a server the
 * name belongs to the authentication layer, which writes it over on every sign in, so
 * changing it here would last until the next one.
 *
 * It exists because a device can now be opened without being asked anything, and a
 * name nobody was asked for has to be a name they can correct. The name travels with
 * the people a space brings along, so somebody else's copy learns the new one on the
 * next sync without a record moving.
 */
export async function renameProfile(
	driver: Driver,
	userId: string,
	name: string,
	now: () => number = Date.now,
): Promise<User> {
	const wanted = name.trim();
	if (wanted === "") throw new RuleError("nameIsRequired", "a person needs a name");

	await driver.run(`UPDATE "users" SET "name" = ?, "updated_at" = ? WHERE "id" = ?`, [
		wanted,
		now(),
		userId,
	]);

	const rows = await driver.all(`${SELECT} WHERE "id" = ?`, [userId]);
	const first = rows[0];
	if (!first) throw new NotFoundError("user", userId);
	return toUser(first);
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
