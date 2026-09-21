import { spaceMembers } from "@cofre/db";
import { assertCan, type Role, readableSpaceIds, roleIn } from "../actor.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { type SpaceMember, toSpaceMember } from "../models.ts";
import { insertRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

export type InviteInput = {
	spaceId: string;
	userId: string;
	role: Exclude<Role, "owner">;
};

const SELECT = `SELECT "id", "space_id", "user_id", "role", "state", "invited_by", "accepted_at",
	"created_at", "updated_at"
	FROM "space_members"`;

export function createMembersRepository(context: RepositoryContext) {
	async function rowOf(spaceId: string, userId: string): Promise<SpaceMember | null> {
		const rows = await context.driver.all(
			`${SELECT} WHERE "space_id" = ? AND "user_id" = ? AND "deleted_at" IS NULL`,
			[spaceId, userId],
		);
		const first = rows[0];
		return first ? toSpaceMember(first) : null;
	}

	async function kindOfSpace(spaceId: string): Promise<string> {
		const rows = await context.driver.all(
			`SELECT "kind" FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
			[spaceId],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("space", spaceId);
		return String(first.kind);
	}

	async function owners(spaceId: string): Promise<SpaceMember[]> {
		const rows = await context.driver.all(
			`${SELECT} WHERE "space_id" = ? AND "role" = 'owner' AND "state" = 'active' AND "deleted_at" IS NULL`,
			[spaceId],
		);
		return rows.map(toSpaceMember);
	}

	return {
		async list(spaceId: string): Promise<SpaceMember[]> {
			assertCan(context.actor(), spaceId, "member.read");
			const rows = await context.driver.all(
				`${SELECT} WHERE "space_id" = ? AND "state" <> 'removed' AND "deleted_at" IS NULL
				 ORDER BY "created_at"`,
				[spaceId],
			);
			return rows.map(toSpaceMember);
		},

		/**
		 * Invites someone into a shared space. The invitation waits for the person to
		 * accept, so nobody is added to a space without knowing.
		 */
		async invite(input: InviteInput): Promise<SpaceMember> {
			assertCan(context.actor(), input.spaceId, "member.invite");

			if ((await kindOfSpace(input.spaceId)) === "personal") {
				throw new RuleError(
					"personalSpaceIsPrivate",
					"the personal space belongs to one person and cannot receive members",
				);
			}

			const existing = await rowOf(input.spaceId, input.userId);
			if (existing && existing.state !== "removed") {
				throw new RuleError("alreadyInvited", "this person is already in the space");
			}

			if (existing) {
				await updateRow(context.write(), {
					table: spaceMembers,
					spaceId: input.spaceId,
					id: existing.id,
					values: {
						role: input.role,
						state: "invited",
						invited_by: context.actor().userId,
						accepted_at: null,
					},
				});
			} else {
				await insertRow(context.write(), {
					table: spaceMembers,
					spaceId: input.spaceId,
					values: {
						user_id: input.userId,
						role: input.role,
						state: "invited",
						invited_by: context.actor().userId,
						accepted_at: null,
					},
				});
			}

			const saved = await rowOf(input.spaceId, input.userId);
			if (!saved) throw new NotFoundError("member", input.userId);
			return saved;
		},

		/** The invited person, and only them, turns the invitation into membership. */
		async accept(spaceId: string): Promise<SpaceMember> {
			const actor = context.actor();
			const membership = await rowOf(spaceId, actor.userId);
			if (membership?.state !== "invited") {
				throw new NotFoundError("invitation", spaceId);
			}

			await updateRow(context.write(), {
				table: spaceMembers,
				spaceId,
				id: membership.id,
				values: { state: "active", accepted_at: context.now() },
			});

			await context.refreshActor();
			const saved = await rowOf(spaceId, actor.userId);
			if (!saved) throw new NotFoundError("member", actor.userId);
			return saved;
		},

		async changeRole(spaceId: string, userId: string, role: Exclude<Role, "owner">): Promise<void> {
			const actor = context.actor();
			assertCan(actor, spaceId, "member.changeRole");

			if (userId === actor.userId) {
				throw new RuleError(
					"noSelfPromotion",
					"you cannot change your own role, ask another administrator",
				);
			}

			const membership = await rowOf(spaceId, userId);
			if (!membership) throw new NotFoundError("member", userId);

			if (membership.role === "owner") {
				throw new RuleError(
					"ownerRoleIsTransferred",
					"the role of owner changes only by transferring the space",
				);
			}

			await updateRow(context.write(), {
				table: spaceMembers,
				spaceId,
				id: membership.id,
				values: { role },
			});
		},

		async remove(spaceId: string, userId: string): Promise<void> {
			const actor = context.actor();
			assertCan(actor, spaceId, "member.remove");

			if (userId === actor.userId) {
				throw new RuleError("useLeave", "to leave a space, use the option that leaves it");
			}

			const membership = await rowOf(spaceId, userId);
			if (!membership) throw new NotFoundError("member", userId);
			if (membership.role === "owner") {
				throw new RuleError("ownerStays", "the owner of a space cannot be removed from it");
			}

			await updateRow(context.write(), {
				table: spaceMembers,
				spaceId,
				id: membership.id,
				values: { state: "removed" },
			});
		},

		/** Leaving keeps what was written in the space, because it is shared history. */
		async leave(spaceId: string): Promise<void> {
			const actor = context.actor();
			const role = roleIn(actor, spaceId);
			if (role === null) throw new NotFoundError("space", spaceId);
			if (role === "owner") {
				throw new RuleError(
					"transferBeforeLeaving",
					"the owner transfers the space to someone else before leaving it",
				);
			}
			assertCan(actor, spaceId, "space.leave");

			const membership = await rowOf(spaceId, actor.userId);
			if (!membership) throw new NotFoundError("member", actor.userId);

			await updateRow(context.write(), {
				table: spaceMembers,
				spaceId,
				id: membership.id,
				values: { state: "removed" },
			});
			await context.refreshActor();
		},

		async transferOwnership(spaceId: string, toUserId: string): Promise<void> {
			const actor = context.actor();
			if (roleIn(actor, spaceId) !== "owner") {
				throw new RuleError("onlyOwnerTransfers", "only the owner can transfer a space");
			}

			const target = await rowOf(spaceId, toUserId);
			if (target?.state !== "active") throw new NotFoundError("member", toUserId);

			const current = (await owners(spaceId)).find((member) => member.userId === actor.userId);
			if (!current) throw new NotFoundError("member", actor.userId);

			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				await updateRow(write, {
					table: spaceMembers,
					spaceId,
					id: target.id,
					values: { role: "owner" },
				});
				await updateRow(write, {
					table: spaceMembers,
					spaceId,
					id: current.id,
					values: { role: "admin" },
				});
			});

			await context.refreshActor();
		},

		/** Used by the session to learn what this person may see. */
		async membershipsOf(userId: string): Promise<SpaceMember[]> {
			const rows = await context.driver.all(
				`${SELECT} WHERE "user_id" = ? AND "deleted_at" IS NULL`,
				[userId],
			);
			return rows.map(toSpaceMember);
		},

		/** Spaces the current person can read, for the consolidated view. */
		readableSpaces(): string[] {
			return readableSpaceIds(context.actor());
		},
	};
}

export type MembersRepository = ReturnType<typeof createMembersRepository>;
