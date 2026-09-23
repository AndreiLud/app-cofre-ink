import { uuidV7 } from "@cofre/core";
import { spaceMembers, spaces } from "@cofre/db";
import { assertCan, readableSpaceIds } from "../actor.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { type Space, toSpace } from "../models.ts";
import { marks } from "../sql.ts";
import { insertRow, softDeleteRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

export type CreateSpaceInput = {
	name: string;
	kind?: "personal" | "shared";
	colour?: string;
	icon?: string;
	baseCurrency?: string;
	timezone?: string;
};

export type UpdateSpaceInput = {
	name?: string;
	colour?: string;
	icon?: string;
	baseCurrency?: string;
	timezone?: string;
};

const SELECT = `SELECT "id", "kind", "name", "colour", "icon", "base_currency", "timezone",
	"created_by", "created_at", "updated_at"
	FROM "spaces"`;

export function createSpacesRepository(context: RepositoryContext) {
	async function readable(id: string): Promise<Space> {
		const ids = readableSpaceIds(context.actor());
		if (!ids.includes(id)) throw new NotFoundError("space", id);
		const rows = await context.driver.all(`${SELECT} WHERE "id" = ? AND "deleted_at" IS NULL`, [
			id,
		]);
		const first = rows[0];
		if (!first) throw new NotFoundError("space", id);
		return toSpace(first);
	}

	return {
		/**
		 * Creates the space and makes whoever asked its owner, in one transaction. A
		 * person has exactly one personal space, and it can never be shared.
		 */
		async create(input: CreateSpaceInput): Promise<Space> {
			const kind = input.kind ?? "shared";
			const actor = context.actor();

			if (kind === "personal") {
				const existing = await context.driver.all(
					`SELECT s."id" FROM "spaces" s
					 JOIN "space_members" m ON m."space_id" = s."id"
					 WHERE s."kind" = 'personal' AND m."user_id" = ? AND s."deleted_at" IS NULL`,
					[actor.userId],
				);
				if (existing.length > 0) {
					throw new RuleError("onePersonalSpace", "this person already has a personal space");
				}
			}

			// The space is its own scope, so its identifier is needed before the insert.
			const spaceId = uuidV7();

			const id = await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				await insertRow(write, {
					table: spaces,
					spaceId,
					id: spaceId,
					values: {
						kind,
						name: input.name,
						colour: input.colour ?? "slate",
						icon: input.icon ?? "wallet",
						base_currency: input.baseCurrency ?? "BRL",
						timezone: input.timezone ?? "America/Sao_Paulo",
						created_by: actor.userId,
					},
				});

				await insertRow(write, {
					table: spaceMembers,
					spaceId,
					values: {
						user_id: actor.userId,
						role: "owner",
						state: "active",
						invited_by: null,
						accepted_at: context.now(),
					},
				});

				return spaceId;
			});

			await context.refreshActor();
			return readable(id);
		},

		/**
		 * Takes a space that arrived from somewhere else and has nobody in it.
		 *
		 * This is how a space born on a device reaches a server: the device pushes what
		 * it wrote, the space row arrives with it, and then whoever pushed it becomes its
		 * owner. A space that already has a member is never adopted, because that would
		 * be a way to walk into somebody else's money by guessing an identifier.
		 */
		async adopt(spaceId: string): Promise<Space> {
			const exists = await context.driver.all(
				`SELECT "id", "kind" FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
				[spaceId],
			);
			const space = exists[0];
			if (!space) throw new NotFoundError("space", spaceId);

			const members = await context.driver.all(
				`SELECT "user_id" FROM "space_members"
				 WHERE "space_id" = ? AND "deleted_at" IS NULL AND "state" <> 'removed'`,
				[spaceId],
			);
			if (members.length > 0) {
				// Already somebody's. If it is theirs they are a member and never get here.
				throw new NotFoundError("space", spaceId);
			}

			// A personal space is one per person, and a second one would break that rule
			// quietly. It arrives as a space of its own instead.
			const mine = await context.driver.all(
				`SELECT s."id" FROM "spaces" s
				 JOIN "space_members" m ON m."space_id" = s."id"
				 WHERE s."kind" = 'personal' AND m."user_id" = ? AND s."deleted_at" IS NULL
				   AND m."deleted_at" IS NULL`,
				[context.actor().userId],
			);
			if (String(space.kind) === "personal" && mine.length > 0) {
				// Two personal spaces cannot both be the personal space, and changing the
				// kind of this one would travel back to the device it came from and change
				// it there too. Moving a personal life between devices is what a backup is
				// for: restoring one merges it into the personal space that is already here.
				throw new RuleError(
					"onePersonalSpace",
					"this is the personal space of another device, and this person already has one, so bring it in with a backup instead",
				);
			}

			await insertRow(context.write(), {
				table: spaceMembers,
				spaceId,
				values: {
					user_id: context.actor().userId,
					role: "owner",
					state: "active",
					invited_by: null,
					accepted_at: context.now(),
				},
			});

			await context.refreshActor();
			return readable(spaceId);
		},

		/** Every space this person belongs to, personal first. */
		async list(): Promise<Space[]> {
			const ids = readableSpaceIds(context.actor());
			if (ids.length === 0) return [];
			const rows = await context.driver.all(
				`${SELECT} WHERE "id" IN (${marks(ids.length)}) AND "deleted_at" IS NULL
				 ORDER BY CASE WHEN "kind" = 'personal' THEN 0 ELSE 1 END, "name"`,
				ids,
			);
			return rows.map(toSpace);
		},

		async get(id: string): Promise<Space> {
			const space = await readable(id);
			assertCan(context.actor(), id, "space.read");
			return space;
		},

		async update(id: string, input: UpdateSpaceInput): Promise<Space> {
			await readable(id);
			assertCan(context.actor(), id, "space.update");

			const values: Record<string, string> = {};
			if (input.name !== undefined) values.name = input.name;
			if (input.colour !== undefined) values.colour = input.colour;
			if (input.icon !== undefined) values.icon = input.icon;
			if (input.baseCurrency !== undefined) values.base_currency = input.baseCurrency;
			if (input.timezone !== undefined) values.timezone = input.timezone;

			await updateRow(context.write(), { table: spaces, spaceId: id, id, values });
			return readable(id);
		},

		/**
		 * Removes a shared space for everyone. The personal space is not removed here:
		 * erasing it means erasing the account, which is a separate, louder action.
		 */
		async remove(id: string): Promise<void> {
			const space = await readable(id);
			assertCan(context.actor(), id, "space.delete");
			if (space.kind === "personal") {
				throw new RuleError(
					"personalSpaceStays",
					"the personal space cannot be removed here, use the option that erases the account",
				);
			}
			await softDeleteRow(context.write(), { table: spaces, spaceId: id, id });
			await context.refreshActor();
		},
	};
}

export type SpacesRepository = ReturnType<typeof createSpacesRepository>;
