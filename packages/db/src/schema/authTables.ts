// Tables owned by the authentication library, kept apart from the tables owned by the
// product. The library writes and reads them through its own adapter, and Cofre only
// mirrors the person into its own `users` table when they sign in.
//
// They live in our schema description anyway, so there is one migration path for every
// mode. In browser mode they simply stay empty, because there is nobody to sign in to.

import { defineTable } from "./types.ts";

export const authUsers = defineTable({
	name: "auth_users",
	scope: "global",
	replicated: false,
	columns: [
		{ name: "name", type: "text", notNull: true },
		{ name: "email", type: "text", notNull: true, unique: true },
		{ name: "email_verified", type: "boolean", notNull: true, defaultTo: "FALSE" },
		{ name: "image", type: "text" },
		{ name: "created_at", type: "timestampText", notNull: true },
		{ name: "updated_at", type: "timestampText", notNull: true },
	],
});

export const authSessions = defineTable({
	name: "auth_sessions",
	scope: "global",
	replicated: false,
	columns: [
		{
			name: "user_id",
			type: "text",
			notNull: true,
			references: { table: "auth_users", column: "id", onDelete: "cascade" },
		},
		{ name: "token", type: "text", notNull: true, unique: true },
		{ name: "expires_at", type: "timestampText", notNull: true },
		{ name: "ip_address", type: "text" },
		{ name: "user_agent", type: "text" },
		{ name: "created_at", type: "timestampText", notNull: true },
		{ name: "updated_at", type: "timestampText", notNull: true },
	],
	indexes: [{ name: "auth_sessions_by_user", columns: ["user_id"] }],
});

/** Holds the password hash for email sign in, and tokens for any social provider. */
export const authAccounts = defineTable({
	name: "auth_accounts",
	scope: "global",
	replicated: false,
	columns: [
		{
			name: "user_id",
			type: "text",
			notNull: true,
			references: { table: "auth_users", column: "id", onDelete: "cascade" },
		},
		{ name: "account_id", type: "text", notNull: true },
		{ name: "provider_id", type: "text", notNull: true },
		{ name: "password", type: "text" },
		{ name: "access_token", type: "text" },
		{ name: "refresh_token", type: "text" },
		{ name: "id_token", type: "text" },
		{ name: "access_token_expires_at", type: "timestampText" },
		{ name: "refresh_token_expires_at", type: "timestampText" },
		{ name: "scope", type: "text" },
		{ name: "created_at", type: "timestampText", notNull: true },
		{ name: "updated_at", type: "timestampText", notNull: true },
	],
	indexes: [{ name: "auth_accounts_by_user", columns: ["user_id"] }],
});

export const authVerifications = defineTable({
	name: "auth_verifications",
	scope: "global",
	replicated: false,
	columns: [
		{ name: "identifier", type: "text", notNull: true },
		{ name: "value", type: "text", notNull: true },
		{ name: "expires_at", type: "timestampText", notNull: true },
		{ name: "created_at", type: "timestampText", notNull: true },
		{ name: "updated_at", type: "timestampText", notNull: true },
	],
	indexes: [{ name: "auth_verifications_by_identifier", columns: ["identifier"] }],
});

/**
 * An invitation to a shared space, reachable by a link. It carries the role, it is
 * single use, and it expires, so a link that leaks does not become a key.
 */
export const spaceInvitations = defineTable({
	name: "space_invitations",
	scope: "membership",
	replicated: false,
	columns: [
		{ name: "token", type: "text", notNull: true, unique: true },
		{ name: "role", type: "text", notNull: true },
		{ name: "email", type: "text" },
		{ name: "invited_by", type: "text", notNull: true },
		{ name: "expires_at", type: "bigint", notNull: true },
		{ name: "accepted_at", type: "bigint" },
		{ name: "accepted_by", type: "text" },
		{ name: "revoked_at", type: "bigint" },
		{ name: "created_at", type: "bigint", notNull: true },
	],
	indexes: [{ name: "space_invitations_by_token", columns: ["token"], unique: true }],
});

export const AUTH_TABLES = [
	authUsers,
	authSessions,
	authAccounts,
	authVerifications,
	spaceInvitations,
] as const;
