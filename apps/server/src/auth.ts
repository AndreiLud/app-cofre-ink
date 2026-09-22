// Authentication, by a library rather than by hand.
//
// Better Auth owns the four tables named below and is the source of truth for who a
// person is. Cofre keeps its own `users` row in step with it, because every space and
// every record points at that row. The mapping is spelled out so the library writes
// the snake case names the rest of the schema uses.

import { uuidV7 } from "@cofre/core";
import { betterAuth } from "better-auth";
import type { Config } from "./config.ts";
import type { OpenedDatabase } from "./database.ts";

export function createAuth(config: Config, database: OpenedDatabase) {
	const store = database.postgres ?? database.sqlite;
	if (!store) throw new Error("the database was opened without a handle for authentication");

	return betterAuth({
		appName: "Cofre",
		baseURL: config.COFRE_PUBLIC_URL,
		basePath: "/api/auth",
		secret: config.COFRE_SECRET,
		database: store,
		trustedOrigins: [config.COFRE_WEB_ORIGIN, config.COFRE_PUBLIC_URL],

		emailAndPassword: {
			enabled: true,
			minPasswordLength: 10,
			// Nobody is sending email yet, so asking someone to confirm an address
			// would lock them out of their own data.
			requireEmailVerification: false,
		},

		/**
		 * Said out loud rather than left to a default.
		 *
		 * The library turns this on by itself when it believes it is in production, and
		 * a server at home is very often not started that way. Guessing a password is
		 * the one attack a Cofre on the open internet actually faces, so the limit is
		 * written here where somebody can read it and change it.
		 *
		 * Five attempts a minute at signing in, five accounts an hour, and sixty of
		 * anything else. It counts per address, which is why the header a proxy sets has
		 * to be named in the configuration: without it, everybody behind the proxy
		 * counts as one caller.
		 */
		rateLimit: {
			enabled: config.NODE_ENV !== "test",
			window: 60,
			max: 60,
			customRules: {
				"/sign-in/email": { window: 60, max: 5 },
				"/sign-up/email": { window: 60 * 60, max: 5 },
			},
		},

		advanced: {
			database: {
				generateId: () => uuidV7(),
			},
			// Behind a proxy, and inside a container, the address of the socket is the
			// proxy. The owner names the header their proxy sets, and only then is it
			// believed.
			...(config.COFRE_CLIENT_IP_HEADER
				? { ipAddress: { ipAddressHeaders: [config.COFRE_CLIENT_IP_HEADER] } }
				: {}),
		},

		user: {
			modelName: "auth_users",
			fields: {
				emailVerified: "email_verified",
				createdAt: "created_at",
				updatedAt: "updated_at",
			},
		},
		session: {
			modelName: "auth_sessions",
			fields: {
				userId: "user_id",
				expiresAt: "expires_at",
				ipAddress: "ip_address",
				userAgent: "user_agent",
				createdAt: "created_at",
				updatedAt: "updated_at",
			},
		},
		account: {
			modelName: "auth_accounts",
			fields: {
				userId: "user_id",
				accountId: "account_id",
				providerId: "provider_id",
				accessToken: "access_token",
				refreshToken: "refresh_token",
				idToken: "id_token",
				accessTokenExpiresAt: "access_token_expires_at",
				refreshTokenExpiresAt: "refresh_token_expires_at",
				createdAt: "created_at",
				updatedAt: "updated_at",
			},
		},
		verification: {
			modelName: "auth_verifications",
			fields: {
				expiresAt: "expires_at",
				createdAt: "created_at",
				updatedAt: "updated_at",
			},
		},
	});
}

/** The shape the rest of the server sees, inferred from the options above. */
export type Auth = ReturnType<typeof createAuth>;
