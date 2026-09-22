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
	closingDay: z.number().int().min(1).max(31).nullable().optional(),
	dueDay: z.number().int().min(1).max(31).nullable().optional(),
	creditLimit: z.number().int().nonnegative().nullable().optional(),
});

const roleInput = z.enum(["admin", "editor", "viewer", "logger"]);

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected a calendar date");

const priority = z.enum(["essential", "important", "desirable", "superfluous"]);

const categoryInput = z.object({
	name: z.string().trim().min(1).max(60),
	kind: z.enum(["expense", "income"]),
	priority: priority.optional(),
	parentId: z.string().min(1).nullable().optional(),
	colour: z.string().trim().max(20).nullable().optional(),
	icon: z.string().trim().max(40).nullable().optional(),
	position: z.number().int().min(0).max(999).optional(),
});

const budgetInput = z.object({
	scope: z.enum(["total", "priority", "category"]),
	amount: z.number().int().positive(),
	categoryId: z.string().min(1).nullable().optional(),
	priority: priority.nullable().optional(),
	month: z
		.string()
		.regex(/^\d{4}-\d{2}$/)
		.nullable()
		.optional(),
});

const goalInput = z.object({
	name: z.string().trim().min(1).max(80),
	targetAmount: z.number().int().positive(),
	accountId: z.string().min(1),
	targetDate: calendarDate.nullable().optional(),
	notes: z.string().trim().max(2000).nullable().optional(),
});

const savingsInput = z.object({
	mode: z.enum(["percent", "fixed"]),
	/** Hundredths of a percent, or minor units, depending on the mode. */
	value: z.number().int().positive(),
	accountId: z.string().min(1).nullable().optional(),
});

const splitInput = z.object({
	method: z.enum(["evenly", "shares", "income"]),
	userIds: z.array(z.string().min(1)).max(20).optional(),
	weights: z.array(z.number().int().min(0).max(1_000_000)).max(20).optional(),
	paidBy: z.string().min(1).nullable().optional(),
});

const settlementInput = z.object({
	fromUserId: z.string().min(1),
	toUserId: z.string().min(1),
	amount: z.number().int().positive(),
	happenedOn: calendarDate,
	note: z.string().trim().max(200).nullable().optional(),
});

const ruleInput = z.object({
	matchText: z.string().trim().min(2).max(80),
	categoryId: z.string().min(1),
	accountId: z.string().min(1).nullable().optional(),
	kind: z.enum(["income", "expense", "transfer"]).nullable().optional(),
	priority: priority.nullable().optional(),
	position: z.number().int().min(0).max(999).optional(),
	disabled: z.boolean().optional(),
});

const recurrenceInput = z.object({
	description: z.string().trim().min(1).max(200),
	kind: z.enum(["income", "expense", "transfer"]),
	amount: z.number().int().positive(),
	accountId: z.string().min(1),
	counterAccountId: z.string().min(1).nullable().optional(),
	categoryId: z.string().min(1).nullable().optional(),
	priority: priority.nullable().optional(),
	frequency: z.enum(["weekly", "monthly", "yearly"]),
	intervalCount: z.number().int().min(1).max(60).optional(),
	dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
	monthOfYear: z.number().int().min(1).max(12).nullable().optional(),
	startsOn: calendarDate,
	endsOn: calendarDate.nullable().optional(),
	notes: z.string().trim().max(2000).nullable().optional(),
});

const transactionInput = z.object({
	kind: z.enum(["income", "expense", "transfer"]),
	// Always positive: the direction comes from the kind, as registry 0010 says.
	amount: z.number().int().positive(),
	happenedOn: calendarDate,
	description: z.string().trim().min(1).max(200),
	accountId: z.string().min(1),
	counterAccountId: z.string().min(1).nullable().optional(),
	status: z.enum(["planned", "settled"]).optional(),
	currency: z.string().trim().length(3).optional(),
	fxRate: z.number().int().positive().nullable().optional(),
	notes: z.string().trim().max(2000).nullable().optional(),
	installments: z.number().int().min(1).max(420).optional(),
	categoryId: z.string().min(1).nullable().optional(),
	priority: priority.nullable().optional(),
});

const transactionPatch = z.object({
	amount: z.number().int().positive().optional(),
	happenedOn: calendarDate.optional(),
	description: z.string().trim().min(1).max(200).optional(),
	accountId: z.string().min(1).optional(),
	counterAccountId: z.string().min(1).nullable().optional(),
	status: z.enum(["planned", "settled"]).optional(),
	notes: z.string().trim().max(2000).nullable().optional(),
	categoryId: z.string().min(1).nullable().optional(),
	priority: priority.nullable().optional(),
});

/** A selection, kept small enough that one request cannot lock the database. */
const selection = z.array(z.string().min(1)).min(1).max(500);

const savedFilterInput = z.object({
	name: z.string().trim().min(1).max(60),
	// Whatever the screen puts in it. The repository stores it and gives it back.
	query: z.record(z.string(), z.unknown()),
	position: z.number().int().min(0).max(999).optional(),
});

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
		const input = z
			.object({
				role: roleInput.optional(),
				monthlyIncome: z.number().int().nonnegative().nullable().optional(),
			})
			.parse(await context.req.json());

		const session = context.get("session");
		const spaceId = context.req.param("id");
		const userId = context.req.param("userId");

		if (input.role !== undefined) await session.members.changeRole(spaceId, userId, input.role);
		if (input.monthlyIncome !== undefined) {
			await session.members.setIncome(spaceId, userId, input.monthlyIncome);
		}
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

	app.get("/api/spaces/:id/categories", async (context) => {
		const includeArchived = context.req.query("archived") === "true";
		return context.json(
			await context.get("session").categories.list(context.req.param("id"), { includeArchived }),
		);
	});

	app.post("/api/spaces/:id/categories", async (context) => {
		const input = categoryInput.parse(await context.req.json());
		const category = await context
			.get("session")
			.categories.create({ spaceId: context.req.param("id"), ...input });
		return context.json(category, 201);
	});

	/** The starting set, written once and only into a space that has none. */
	app.post("/api/spaces/:id/categories/defaults", async (context) => {
		const input = z
			.object({ language: z.enum(["pt", "en"]).optional() })
			.parse(await context.req.json().catch(() => ({})));
		const written = await context
			.get("session")
			.categories.installDefaults({ spaceId: context.req.param("id"), language: input.language });
		return context.json(written, 201);
	});

	app.patch("/api/categories/:id", async (context) => {
		const input = categoryInput.partial().omit({ kind: true });
		return context.json(
			await context
				.get("session")
				.categories.update(context.req.param("id"), input.parse(await context.req.json())),
		);
	});

	app.post("/api/categories/:id/archive", async (context) =>
		context.json(await context.get("session").categories.archive(context.req.param("id"))),
	);

	app.post("/api/categories/:id/unarchive", async (context) =>
		context.json(await context.get("session").categories.unarchive(context.req.param("id"))),
	);

	app.delete("/api/categories/:id", async (context) => {
		await context.get("session").categories.remove(context.req.param("id"));
		return context.body(null, 204);
	});

	app.get("/api/spaces/:id/transactions", async (context) => {
		const query = context.req.query();
		return context.json(
			await context.get("session").transactions.list({
				spaceId: context.req.param("id"),
				accountId: query.accountId,
				kind: query.kind as "income" | "expense" | "transfer" | undefined,
				status: query.status as "planned" | "settled" | undefined,
				from: query.from,
				to: query.to,
				invoiceMonth: query.invoiceMonth,
				search: query.search,
				categoryIds:
					query.categoryIds === undefined || query.categoryIds === ""
						? undefined
						: query.categoryIds.split(","),
				withoutCategory: query.withoutCategory === "true",
				limit: query.limit === undefined ? undefined : Number(query.limit),
			}),
		);
	});

	app.post("/api/spaces/:id/transactions", async (context) => {
		const input = transactionInput.parse(await context.req.json());
		const written = await context
			.get("session")
			.transactions.create({ spaceId: context.req.param("id"), ...input });
		return context.json(written, 201);
	});

	app.get("/api/spaces/:id/balances", async (context) =>
		context.json(await context.get("session").transactions.balances(context.req.param("id"))),
	);

	// The same change over a selection. It comes before the route with the identifier
	// so that "several" is never read as a record called "several".
	app.patch("/api/transactions", async (context) => {
		const input = z
			.object({ ids: selection, patch: transactionPatch })
			.parse(await context.req.json());
		const changed = await context.get("session").transactions.updateMany(input.ids, input.patch);
		return context.json({ changed });
	});

	app.post("/api/transactions/remove", async (context) => {
		const input = z.object({ ids: selection }).parse(await context.req.json());
		const removed = await context.get("session").transactions.removeMany(input.ids);
		return context.json({ removed });
	});

	app.patch("/api/transactions/:id", async (context) => {
		const input = transactionPatch.parse(await context.req.json());
		return context.json(
			await context.get("session").transactions.update(context.req.param("id"), input),
		);
	});

	app.post("/api/transactions/:id/settle", async (context) =>
		context.json(await context.get("session").transactions.settle(context.req.param("id"))),
	);

	app.post("/api/transactions/:id/reconcile", async (context) => {
		const input = z.object({ reconciled: z.boolean() }).parse(await context.req.json());
		return context.json(
			await context
				.get("session")
				.transactions.reconcile(context.req.param("id"), input.reconciled),
		);
	});

	app.delete("/api/transactions/:id", async (context) => {
		await context.get("session").transactions.remove(context.req.param("id"));
		return context.body(null, 204);
	});

	app.delete("/api/installments/:groupId", async (context) => {
		const removed = await context
			.get("session")
			.transactions.removeGroup(context.req.param("groupId"));
		return context.json({ removed });
	});

	app.get("/api/spaces/:id/filters", async (context) =>
		context.json(await context.get("session").savedFilters.list(context.req.param("id"))),
	);

	app.post("/api/spaces/:id/filters", async (context) => {
		const input = savedFilterInput.parse(await context.req.json());
		const filter = await context
			.get("session")
			.savedFilters.create({ spaceId: context.req.param("id"), ...input });
		return context.json(filter, 201);
	});

	app.patch("/api/filters/:id", async (context) => {
		const input = savedFilterInput.partial().parse(await context.req.json());
		return context.json(
			await context.get("session").savedFilters.update(context.req.param("id"), input),
		);
	});

	app.delete("/api/filters/:id", async (context) => {
		await context.get("session").savedFilters.remove(context.req.param("id"));
		return context.body(null, 204);
	});

	app.get("/api/spaces/:id/rules", async (context) =>
		context.json(await context.get("session").rules.list(context.req.param("id"))),
	);

	app.post("/api/spaces/:id/rules", async (context) => {
		const input = ruleInput.omit({ disabled: true }).parse(await context.req.json());
		const rule = await context
			.get("session")
			.rules.create({ spaceId: context.req.param("id"), ...input });
		return context.json(rule, 201);
	});

	/** Runs the rules over the records that were never sorted by anybody. */
	app.post("/api/spaces/:id/rules/apply", async (context) => {
		const input = z
			.object({ from: calendarDate.optional(), to: calendarDate.optional() })
			.parse(await context.req.json().catch(() => ({})));
		const sorted = await context
			.get("session")
			.rules.applyToExisting({ spaceId: context.req.param("id"), ...input });
		return context.json({ sorted });
	});

	app.patch("/api/rules/:id", async (context) => {
		const input = ruleInput.partial().parse(await context.req.json());
		return context.json(await context.get("session").rules.update(context.req.param("id"), input));
	});

	app.delete("/api/rules/:id", async (context) => {
		await context.get("session").rules.remove(context.req.param("id"));
		return context.body(null, 204);
	});

	app.get("/api/spaces/:id/recurrences", async (context) =>
		context.json(await context.get("session").recurrences.list(context.req.param("id"))),
	);

	app.post("/api/spaces/:id/recurrences", async (context) => {
		const input = recurrenceInput.parse(await context.req.json());
		const series = await context
			.get("session")
			.recurrences.create({ spaceId: context.req.param("id"), ...input });
		return context.json(series, 201);
	});

	/** Writes the planned records the series owe, up to the horizon. */
	app.post("/api/spaces/:id/recurrences/materialize", async (context) => {
		const input = z
			.object({ until: calendarDate.optional() })
			.parse(await context.req.json().catch(() => ({})));
		const written = await context
			.get("session")
			.recurrences.materialize({ spaceId: context.req.param("id"), until: input.until });
		return context.json({ written });
	});

	app.patch("/api/recurrences/:id", async (context) => {
		const input = recurrenceInput
			.partial()
			.omit({ kind: true })
			.extend({ paused: z.boolean().optional() })
			.parse(await context.req.json());
		return context.json(
			await context.get("session").recurrences.update(context.req.param("id"), input),
		);
	});

	app.delete("/api/recurrences/:id", async (context) => {
		const keepPlanned = context.req.query("keepPlanned") === "true";
		const removed = await context
			.get("session")
			.recurrences.remove(context.req.param("id"), { keepPlanned });
		return context.json({ removed });
	});

	app.get("/api/spaces/:id/budgets", async (context) =>
		context.json(await context.get("session").budgets.list(context.req.param("id"))),
	);

	app.post("/api/spaces/:id/budgets", async (context) => {
		const input = budgetInput.parse(await context.req.json());
		const budget = await context
			.get("session")
			.budgets.create({ spaceId: context.req.param("id"), ...input });
		return context.json(budget, 201);
	});

	app.get("/api/spaces/:id/budgets/progress", async (context) => {
		const query = context.req.query();
		return context.json(
			await context.get("session").budgets.progress({
				spaceId: context.req.param("id"),
				month: query.month ?? "",
				today: query.today,
			}),
		);
	});

	app.patch("/api/budgets/:id", async (context) => {
		const input = budgetInput.partial().pick({ amount: true, month: true });
		return context.json(
			await context
				.get("session")
				.budgets.update(context.req.param("id"), input.parse(await context.req.json())),
		);
	});

	app.delete("/api/budgets/:id", async (context) => {
		await context.get("session").budgets.remove(context.req.param("id"));
		return context.body(null, 204);
	});

	app.get("/api/spaces/:id/goals", async (context) =>
		context.json(await context.get("session").goals.list(context.req.param("id"))),
	);

	app.post("/api/spaces/:id/goals", async (context) => {
		const input = goalInput.parse(await context.req.json());
		const goal = await context
			.get("session")
			.goals.create({ spaceId: context.req.param("id"), ...input });
		return context.json(goal, 201);
	});

	app.get("/api/spaces/:id/goals/progress", async (context) =>
		context.json(
			await context.get("session").goals.progress({
				spaceId: context.req.param("id"),
				today: context.req.query("today") ?? "",
			}),
		),
	);

	app.patch("/api/goals/:id", async (context) => {
		const input = goalInput
			.partial()
			.omit({ accountId: true })
			.extend({ archived: z.boolean().optional() });
		return context.json(
			await context
				.get("session")
				.goals.update(context.req.param("id"), input.parse(await context.req.json())),
		);
	});

	app.post("/api/goals/:id/achieved", async (context) =>
		context.json(await context.get("session").goals.markAchieved(context.req.param("id"))),
	);

	app.delete("/api/goals/:id", async (context) => {
		await context.get("session").goals.remove(context.req.param("id"));
		return context.body(null, 204);
	});

	app.get("/api/spaces/:id/savings", async (context) =>
		context.json(await context.get("session").goals.readRule(context.req.param("id"))),
	);

	app.post("/api/spaces/:id/savings", async (context) => {
		const input = savingsInput.parse(await context.req.json());
		const rule = await context
			.get("session")
			.goals.setRule({ spaceId: context.req.param("id"), ...input });
		return context.json(rule);
	});

	app.delete("/api/spaces/:id/savings", async (context) => {
		await context.get("session").goals.clearRule(context.req.param("id"));
		return context.body(null, 204);
	});

	app.get("/api/spaces/:id/savings/progress", async (context) =>
		context.json(
			await context.get("session").goals.savings({
				spaceId: context.req.param("id"),
				month: context.req.query("month") ?? "",
			}),
		),
	);

	app.get("/api/transactions/:id/splits", async (context) =>
		context.json(await context.get("session").sharing.splitsOf(context.req.param("id"))),
	);

	app.post("/api/transactions/:id/splits", async (context) => {
		const input = splitInput.parse(await context.req.json());
		return context.json(
			await context
				.get("session")
				.sharing.split({ transactionId: context.req.param("id"), ...input }),
		);
	});

	app.delete("/api/transactions/:id/splits", async (context) => {
		await context.get("session").sharing.clearSplit(context.req.param("id"));
		return context.body(null, 204);
	});

	app.get("/api/spaces/:id/sharing/balances", async (context) =>
		context.json(await context.get("session").sharing.balances(context.req.param("id"))),
	);

	app.get("/api/spaces/:id/sharing/suggested", async (context) =>
		context.json(await context.get("session").sharing.suggestSettlements(context.req.param("id"))),
	);

	app.get("/api/spaces/:id/sharing/settlements", async (context) =>
		context.json(await context.get("session").sharing.settlements(context.req.param("id"))),
	);

	app.post("/api/spaces/:id/sharing/settlements", async (context) => {
		const input = settlementInput.parse(await context.req.json());
		const settled = await context
			.get("session")
			.sharing.settle({ spaceId: context.req.param("id"), ...input });
		return context.json(settled, 201);
	});

	app.delete("/api/settlements/:id", async (context) => {
		await context.get("session").sharing.forgetSettlement(context.req.param("id"));
		return context.body(null, 204);
	});

	/**
	 * Every report goes through one route. Six routes that differ by a word would be six
	 * places to forget the same permission check.
	 */
	app.get("/api/reports", async (context) => {
		const query = z
			.object({
				kind: z.enum([
					"totals",
					"byCategory",
					"incomeByCategory",
					"byPriority",
					"byMonth",
					"byDay",
				]),
				from: calendarDate,
				to: calendarDate,
				spaceId: z.string().min(1).optional(),
				includePlanned: z.enum(["true", "false"]).optional(),
			})
			.parse(context.req.query());

		const range = {
			spaceId: query.spaceId,
			from: query.from,
			to: query.to,
			includePlanned: query.includePlanned === "true",
		};

		const reports = context.get("session").reports;
		switch (query.kind) {
			case "totals":
				return context.json(await reports.totals(range));
			case "byCategory":
				return context.json(await reports.byCategory(range));
			case "incomeByCategory":
				return context.json(await reports.incomeByCategory(range));
			case "byPriority":
				return context.json(await reports.byPriority(range));
			case "byMonth":
				return context.json(await reports.byMonth(range));
			default:
				return context.json(await reports.byDay(range));
		}
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
