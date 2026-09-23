// Invitations to a shared space, by link.
//
// The link carries a token that is single use and expires. Reading it tells you the
// name of the space and the role on offer, and nothing about the people or the money
// inside, because a link can be forwarded to anyone.

import { randomToken, uuidV7 } from "@cofre/core";
import { spaceInvitations } from "@cofre/db";
import { assertCan, type Role } from "../actor.ts";
import type { Driver } from "../driver.ts";
import { asNumber, asOptionalNumber, asText, type Row } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { marks, quoted } from "../sql.ts";
import type { RepositoryContext } from "./context.ts";

export type Invitation = {
	id: string;
	spaceId: string;
	token: string;
	role: Role;
	email: string | null;
	invitedBy: string;
	expiresAt: number;
	acceptedAt: number | null;
	acceptedBy: string | null;
	revokedAt: number | null;
	createdAt: number;
};

/** What someone holding a link is allowed to learn before they accept it. */
export type InvitationPreview = {
	spaceName: string;
	spaceColour: string;
	role: Role;
	invitedByName: string;
	expiresAt: number;
};

const SELECT = `SELECT "id", "space_id", "token", "role", "email", "invited_by", "expires_at",
	"accepted_at", "accepted_by", "revoked_at", "created_at"
	FROM "space_invitations"`;

export const INVITATION_LIFETIME_MILLIS = 7 * 24 * 60 * 60 * 1000;

function toInvitation(row: Row): Invitation {
	return {
		id: asText(row.id),
		spaceId: asText(row.space_id),
		token: asText(row.token),
		role: asText(row.role) as Role,
		email: row.email === null || row.email === undefined ? null : asText(row.email),
		invitedBy: asText(row.invited_by),
		expiresAt: asNumber(row.expires_at),
		acceptedAt: asOptionalNumber(row.accepted_at),
		acceptedBy:
			row.accepted_by === null || row.accepted_by === undefined ? null : asText(row.accepted_by),
		revokedAt: asOptionalNumber(row.revoked_at),
		createdAt: asNumber(row.created_at),
	};
}

export type CreateInvitationInput = {
	spaceId: string;
	role: Exclude<Role, "owner">;
	/** Given when the invitation is meant for one person, checked on acceptance. */
	email?: string | null;
};

/** Reads an invitation without a session, because whoever holds the link has none. */
export async function previewInvitation(
	driver: Driver,
	token: string,
	now: () => number = Date.now,
): Promise<InvitationPreview> {
	const rows = await driver.all(
		`SELECT i."role", i."expires_at", i."accepted_at", i."revoked_at",
		        s."name" AS space_name, s."colour" AS space_colour, u."name" AS invited_by_name
		 FROM "space_invitations" i
		 JOIN "spaces" s ON s."id" = i."space_id"
		 LEFT JOIN "users" u ON u."id" = i."invited_by"
		 WHERE i."token" = ? AND s."deleted_at" IS NULL`,
		[token],
	);
	const row = rows[0];
	if (!row) throw new NotFoundError("invitation", token);

	const expiresAt = asNumber(row.expires_at);
	if (row.revoked_at !== null && row.revoked_at !== undefined) {
		throw new RuleError("invitationRevoked", "this invitation was cancelled");
	}
	if (row.accepted_at !== null && row.accepted_at !== undefined) {
		throw new RuleError("invitationUsed", "this invitation was already used");
	}
	if (expiresAt < now()) {
		throw new RuleError("invitationExpired", "this invitation has expired, ask for another one");
	}

	return {
		spaceName: asText(row.space_name),
		spaceColour: asText(row.space_colour),
		role: asText(row.role) as Role,
		invitedByName: row.invited_by_name === null ? "" : asText(row.invited_by_name),
		expiresAt,
	};
}

export function createInvitationsRepository(context: RepositoryContext) {
	async function byToken(token: string): Promise<Invitation> {
		const rows = await context.driver.all(`${SELECT} WHERE "token" = ?`, [token]);
		const first = rows[0];
		if (!first) throw new NotFoundError("invitation", token);
		return toInvitation(first);
	}

	return {
		async create(input: CreateInvitationInput): Promise<Invitation> {
			assertCan(context.actor(), input.spaceId, "member.invite");

			const kind = await context.driver.all(
				`SELECT "kind" FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
				[input.spaceId],
			);
			if (kind[0] === undefined) throw new NotFoundError("space", input.spaceId);
			if (String(kind[0].kind) === "personal") {
				throw new RuleError(
					"personalSpaceIsPrivate",
					"the personal space belongs to one person and cannot receive members",
				);
			}

			const moment = context.now();
			const token = randomToken();
			await context.driver.run(
				`INSERT INTO ${quoted(spaceInvitations.name)}
				 ("id", "space_id", "token", "role", "email", "invited_by", "expires_at",
				  "accepted_at", "accepted_by", "revoked_at", "created_at")
				 VALUES (${marks(11)})`,
				[
					uuidV7(),
					input.spaceId,
					token,
					input.role,
					input.email?.trim().toLowerCase() ?? null,
					context.actor().userId,
					moment + INVITATION_LIFETIME_MILLIS,
					null,
					null,
					null,
					moment,
				],
			);

			return byToken(token);
		},

		async list(spaceId: string): Promise<Invitation[]> {
			assertCan(context.actor(), spaceId, "member.invite");
			const rows = await context.driver.all(
				`${SELECT} WHERE "space_id" = ? AND "accepted_at" IS NULL AND "revoked_at" IS NULL
				 ORDER BY "created_at" DESC`,
				[spaceId],
			);
			return rows.map(toInvitation);
		},

		async revoke(spaceId: string, id: string): Promise<void> {
			assertCan(context.actor(), spaceId, "member.invite");
			await context.driver.run(
				`UPDATE "space_invitations" SET "revoked_at" = ? WHERE "id" = ? AND "space_id" = ?`,
				[context.now(), id, spaceId],
			);
		},

		/**
		 * Turns the link into membership. The person accepting has a session already,
		 * so the invitation knows who used it and cannot be used twice.
		 */
		async accept(token: string): Promise<{ spaceId: string; role: Role }> {
			const actor = context.actor();
			const invitation = await byToken(token);
			const moment = context.now();

			if (invitation.revokedAt !== null) {
				throw new RuleError("invitationRevoked", "this invitation was cancelled");
			}
			if (invitation.acceptedAt !== null) {
				throw new RuleError("invitationUsed", "this invitation was already used");
			}
			if (invitation.expiresAt < moment) {
				throw new RuleError(
					"invitationExpired",
					"this invitation has expired, ask for another one",
				);
			}

			const already = await context.driver.all(
				`SELECT "state" FROM "space_members"
				 WHERE "space_id" = ? AND "user_id" = ? AND "deleted_at" IS NULL`,
				[invitation.spaceId, actor.userId],
			);
			const state = already[0] === undefined ? null : String(already[0].state);
			if (state === "active") {
				throw new RuleError("alreadyInside", "you are already in this space");
			}

			await context.driver.transaction(async (tx) => {
				await tx.run(
					`UPDATE "space_invitations" SET "accepted_at" = ?, "accepted_by" = ? WHERE "id" = ?`,
					[moment, actor.userId, invitation.id],
				);

				if (state === null) {
					await tx.run(
						`INSERT INTO "space_members"
						 ("id", "space_id", "user_id", "role", "state", "invited_by", "accepted_at",
						  "created_at", "updated_at", "updated_by", "deleted_at", "hlc")
						 VALUES (${marks(12)})`,
						[
							uuidV7(),
							invitation.spaceId,
							actor.userId,
							invitation.role,
							"active",
							invitation.invitedBy,
							moment,
							moment,
							moment,
							actor.userId,
							null,
							context.clock.next(),
						],
					);
				} else {
					await tx.run(
						`UPDATE "space_members"
						 SET "role" = ?, "state" = 'active', "accepted_at" = ?, "updated_at" = ?,
						     "updated_by" = ?, "hlc" = ?
						 WHERE "space_id" = ? AND "user_id" = ?`,
						[
							invitation.role,
							moment,
							moment,
							actor.userId,
							context.clock.next(),
							invitation.spaceId,
							actor.userId,
						],
					);
				}
			});

			await context.refreshActor();
			return { spaceId: invitation.spaceId, role: invitation.role };
		},
	};
}

export type InvitationsRepository = ReturnType<typeof createInvitationsRepository>;
