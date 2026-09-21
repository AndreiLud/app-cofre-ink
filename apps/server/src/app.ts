// The API.
//
// Every route below does the same three things: it finds out who is asking, it opens
// a session on the repository layer with that person, and it calls one method. The
// rules about who may do what live in the repository layer, not here, which is what
// keeps the server and the browser honest about the same model.

import type { Session } from "@cofre/storage";
import {
	NotFoundError,
	openSession,
	PermissionError,
	previewInvitation,
	RuleError,
	upsertUserFromIdentity,
} from "@cofre/storage";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { Auth } from "./auth.ts";
import type { Config } from "./config.ts";
import type { OpenedDatabase } from "./database.ts";

export type AppDependencies = {
	config: Config;
	database: OpenedDatabase;
	auth: Auth;
};

type Variables = {
	session: Session;
	userId: string;
};

const spaceInput = z.object({
	name: z.string().trim().min(1).max(80),
	// The personal space is created by the interface right after signing up, through
	// the same route. The repository layer is what refuses a second one.
	kind: z.enum(["personal", "shared"]).optional(),
	colour: z.string().trim().min(1).max(20).optional(),
	icon: z.string().trim().min(1).max(40).optional(),
	baseCurrency: z.string().trim().length(3).optional(),
	timezone: z.string().trim().min(1).max(60).optional(),
});

const accountInput = z.object({
	kind: z.enum(["checking", "savings", "cash", "credit", "voucher", "investment"]),
	name: z.string().trim().min(1).max(80),
	currency: z.string().trim().length(3).optional(),
	initialBalance: z.number().int().optional(),
	institution: z.string().trim().max(80).nullable().optional(),
});

const roleInput = z.enum(["admin", "editor", "viewer", "logger"]);

export function createApp({ config, database, auth }: AppDependencies) {
	const app = new Hono<{ Variables: Variables }>();

	app.use(
		"/api/*",
		cors({
			origin: [config.COFRE_WEB_ORIGIN, config.COFRE_PUBLIC_URL],
			credentials: true,
			allowHeaders: ["Content-Type"],
			allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
		}),
	);

	app.get("/health", (context) => context.json({ ok: true }));

	// Sign up, sign in, sign out and everything else the library handles.
	app.on(["GET", "POST"], "/api/auth/*", (context) => auth.handler(context.req.raw));

	/** Anyone holding a link may read what it offers, before having an account. */
	app.get("/api/invitations/:token", async (context) => {
		const preview = await previewInvitation(database.driver, context.req.param("token"));
		return context.json(preview);
	});

	app.use("/api/*", async (context, next) => {
		if (context.req.path.startsWith("/api/auth")) return next();
		if (context.req.method === "GET" && /^\/api\/invitations\/[^/]+$/.test(context.req.path)) {
			return next();
		}

		const found = await auth.api.getSession({ headers: context.req.raw.headers });
		if (!found) return context.json({ error: "signedOut" }, 401);

		const person = await upsertUserFromIdentity(database.driver, {
			id: found.user.id,
			email: found.user.email,
			name: found.user.name,
			image: found.user.image ?? null,
		});

		context.set("userId", person.id);
		context.set(
			"session",
			await openSession({ driver: database.driver, userId: person.id, deviceId: "server" }),
		);
		return next();
	});

	app.get("/api/me", async (context) => {
		const session = context.get("session");
		const [me, spaces] = await Promise.all([session.users.me(), session.spaces.list()]);
		return context.json({ user: me, spaces });
	});

	/** Everyone this person shares a space with, which is who the screens can name. */
	app.get("/api/peers", async (context) =>
		context.json(await context.get("session").users.peers()),
	);

	app.get("/api/spaces", async (context) =>
		context.json(await context.get("session").spaces.list()),
	);

	app.post("/api/spaces", async (context) => {
		const input = spaceInput.parse(await context.req.json());
		const space = await context.get("session").spaces.create(input);
		return context.json(space, 201);
	});

	app.patch("/api/spaces/:id", async (context) => {
		const input = spaceInput.partial().parse(await context.req.json());
		const space = await context.get("session").spaces.update(context.req.param("id"), input);
		return context.json(space);
	});

	app.delete("/api/spaces/:id", async (context) => {
		await context.get("session").spaces.remove(context.req.param("id"));
		return context.body(null, 204);
	});

	app.get("/api/spaces/:id/members", async (context) =>
		context.json(await context.get("session").members.list(context.req.param("id"))),
	);

	app.patch("/api/spaces/:id/members/:userId", async (context) => {
		const input = z.object({ role: roleInput }).parse(await context.req.json());
		await context
			.get("session")
			.members.changeRole(context.req.param("id"), context.req.param("userId"), input.role);
		return context.body(null, 204);
	});

	app.delete("/api/spaces/:id/members/:userId", async (context) => {
		await context
			.get("session")
			.members.remove(context.req.param("id"), context.req.param("userId"));
		return context.body(null, 204);
	});

	app.post("/api/spaces/:id/leave", async (context) => {
		await context.get("session").members.leave(context.req.param("id"));
		return context.body(null, 204);
	});

	app.get("/api/spaces/:id/invitations", async (context) =>
		context.json(await context.get("session").invitations.list(context.req.param("id"))),
	);

	app.post("/api/spaces/:id/invitations", async (context) => {
		const input = z
			.object({ role: roleInput, email: z.string().email().nullable().optional() })
			.parse(await context.req.json());

		const invitation = await context.get("session").invitations.create({
			spaceId: context.req.param("id"),
			role: input.role,
			email: input.email ?? null,
		});

		return context.json(
			{ ...invitation, link: `${config.COFRE_WEB_ORIGIN}/convite/${invitation.token}` },
			201,
		);
	});

	app.delete("/api/spaces/:id/invitations/:invitationId", async (context) => {
		await context
			.get("session")
			.invitations.revoke(context.req.param("id"), context.req.param("invitationId"));
		return context.body(null, 204);
	});

	app.post("/api/invitations/:token/accept", async (context) => {
		const joined = await context.get("session").invitations.accept(context.req.param("token"));
		return context.json(joined);
	});

	app.get("/api/spaces/:id/accounts", async (context) => {
		const includeArchived = context.req.query("archived") === "true";
		return context.json(
			await context.get("session").accounts.list(context.req.param("id"), { includeArchived }),
		);
	});

	app.post("/api/spaces/:id/accounts", async (context) => {
		const input = accountInput.parse(await context.req.json());
		const account = await context
			.get("session")
			.accounts.create({ spaceId: context.req.param("id"), ...input });
		return context.json(account, 201);
	});

	app.patch("/api/accounts/:id", async (context) => {
		const input = accountInput
			.partial()
			.pick({ name: true, institution: true, initialBalance: true });
		const account = await context
			.get("session")
			.accounts.update(context.req.param("id"), input.parse(await context.req.json()));
		return context.json(account);
	});

	app.post("/api/accounts/:id/archive", async (context) =>
		context.json(await context.get("session").accounts.archive(context.req.param("id"))),
	);

	app.post("/api/accounts/:id/unarchive", async (context) =>
		context.json(await context.get("session").accounts.unarchive(context.req.param("id"))),
	);

	app.delete("/api/accounts/:id", async (context) => {
		await context.get("session").accounts.remove(context.req.param("id"));
		return context.body(null, 204);
	});

	app.get("/api/spaces/:id/changes", async (context) => {
		const after = context.req.query("after");
		return context.json(
			await context.get("session").changes.list({
				spaceId: context.req.param("id"),
				after: after === undefined ? undefined : after,
			}),
		);
	});

	// One place turns a rule of the model into a status code, so no route repeats it.
	app.onError((error, context) => {
		if (error instanceof PermissionError) {
			return context.json({ error: "notAllowed", permission: error.permission }, 403);
		}
		if (error instanceof NotFoundError) {
			return context.json({ error: "notFound", entity: error.entity }, 404);
		}
		if (error instanceof RuleError) {
			return context.json({ error: error.rule, message: error.message }, 409);
		}
		if (error instanceof z.ZodError) {
			return context.json({ error: "invalidInput", issues: error.issues }, 400);
		}
		console.error(error);
		return context.json({ error: "unexpected" }, 500);
	});

	return app;
}

export type App = ReturnType<typeof createApp>;
