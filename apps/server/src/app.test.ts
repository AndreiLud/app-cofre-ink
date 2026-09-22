// The API, exercised the way a browser would use it: sign up, get a cookie, and then
// every request carries it. No network and no listening socket, because Hono answers
// a plain Request.

import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { type Config, readConfig } from "./config.ts";
import { type OpenedDatabase, openDatabase } from "./database.ts";

type Client = {
	request: (path: string, init?: RequestInit) => Promise<Response>;
	json: <T>(path: string, init?: RequestInit) => Promise<T>;
	signUp: (person: { name: string; email: string; password?: string }) => Promise<void>;
	signOut: () => Promise<void>;
};

const PASSWORD = "uma senha bem comprida";

function configure(): Config {
	return readConfig({
		COFRE_DATABASE: ":memory:",
		COFRE_SECRET: "a".repeat(40),
		COFRE_WEB_ORIGIN: "http://localhost:5174",
		COFRE_PUBLIC_URL: "http://localhost:4321",
		NODE_ENV: "test",
	} as NodeJS.ProcessEnv);
}

/** One browser: it keeps the cookies it is given and sends them back. */
function createClient(app: ReturnType<typeof createApp>): Client {
	const jar = new Map<string, string>();

	const request = async (path: string, init: RequestInit = {}) => {
		const headers = new Headers(init.headers);
		if (jar.size > 0) {
			headers.set(
				"Cookie",
				[...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
			);
		}
		if (init.body !== undefined && !headers.has("Content-Type")) {
			headers.set("Content-Type", "application/json");
		}

		const response = await app.request(`http://localhost:4321${path}`, { ...init, headers });

		for (const raw of response.headers.getSetCookie()) {
			const [pair] = raw.split(";");
			const separator = pair?.indexOf("=") ?? -1;
			if (pair && separator > 0) {
				jar.set(pair.slice(0, separator), pair.slice(separator + 1));
			}
		}
		return response;
	};

	return {
		request,
		json: async <T>(path: string, init?: RequestInit) => {
			const response = await request(path, init);
			return (await response.json()) as T;
		},
		signUp: async (person) => {
			const response = await request("/api/auth/sign-up/email", {
				method: "POST",
				body: JSON.stringify({
					name: person.name,
					email: person.email,
					password: person.password ?? PASSWORD,
				}),
			});
			expect(response.status, await response.clone().text()).toBeLessThan(300);
		},
		signOut: async () => {
			await request("/api/auth/sign-out", { method: "POST" });
			jar.clear();
		},
	};
}

describe("the api", () => {
	let database: OpenedDatabase;
	let app: ReturnType<typeof createApp>;

	beforeEach(async () => {
		const config = configure();
		database = await openDatabase(config);
		app = createApp({ config, database, auth: createAuth(config, database) });
	});

	it("answers that it is alive", async () => {
		const response = await app.request("http://localhost:4321/health");
		expect(response.status).toBe(200);
	});

	it("refuses anything without a session", async () => {
		const response = await app.request("http://localhost:4321/api/me");
		expect(response.status).toBe(401);
	});

	it("signs a person up and knows who they are afterwards", async () => {
		const ana = createClient(app);
		await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });

		const me = await ana.json<{ user: { name: string; email: string }; spaces: unknown[] }>(
			"/api/me",
		);
		expect(me.user.name).toBe("Ana");
		expect(me.user.email).toBe("ana@exemplo.com");
		expect(me.spaces).toEqual([]);
	});

	it("forgets the person after signing out", async () => {
		const ana = createClient(app);
		await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
		await ana.signOut();

		const response = await ana.request("/api/me");
		expect(response.status).toBe(401);
	});

	it("creates a space and lists it", async () => {
		const ana = createClient(app);
		await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });

		const created = await ana.request("/api/spaces", {
			method: "POST",
			body: JSON.stringify({ name: "Casa", colour: "clay" }),
		});
		expect(created.status).toBe(201);

		const spaces = await ana.json<Array<{ name: string }>>("/api/spaces");
		expect(spaces.map((space) => space.name)).toEqual(["Casa"]);
	});

	it("keeps one person's space out of another person's list", async () => {
		const ana = createClient(app);
		const joao = createClient(app);
		await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
		await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });

		const space = await ana.json<{ id: string }>("/api/spaces", {
			method: "POST",
			body: JSON.stringify({ name: "Casa" }),
		});

		expect(await joao.json("/api/spaces")).toEqual([]);
		const peek = await joao.request(`/api/spaces/${space.id}/accounts`);
		expect(peek.status).toBe(404);
	});

	it("refuses an amount that is not an integer of minor units", async () => {
		const ana = createClient(app);
		await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
		const space = await ana.json<{ id: string }>("/api/spaces", {
			method: "POST",
			body: JSON.stringify({ name: "Casa" }),
		});

		const response = await ana.request(`/api/spaces/${space.id}/accounts`, {
			method: "POST",
			body: JSON.stringify({ kind: "cash", name: "Dinheiro", initialBalance: 42.9 }),
		});
		expect(response.status).toBe(400);
	});

	describe("several records at once", () => {
		/** A space, an account and three planned bills in it. */
		async function threeBills(client: Client) {
			const space = await client.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});
			const account = await client.json<{ id: string }>(`/api/spaces/${space.id}/accounts`, {
				method: "POST",
				body: JSON.stringify({ kind: "checking", name: "Conta" }),
			});

			const ids: string[] = [];
			for (const description of ["Aluguel", "Luz", "Internet"]) {
				const [written] = await client.json<Array<{ id: string }>>(
					`/api/spaces/${space.id}/transactions`,
					{
						method: "POST",
						body: JSON.stringify({
							kind: "expense",
							amount: 10_000,
							happenedOn: "2026-09-10",
							description,
							accountId: account.id,
							status: "planned",
						}),
					},
				);
				ids.push(written?.id ?? "");
			}
			return { spaceId: space.id, accountId: account.id, ids };
		}

		it("settles a selection in one request", async () => {
			const ana = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			const { spaceId, ids } = await threeBills(ana);

			const answer = await ana.json<{ changed: number }>("/api/transactions", {
				method: "PATCH",
				body: JSON.stringify({ ids, patch: { status: "settled" } }),
			});
			expect(answer.changed).toBe(3);

			const rows = await ana.json<Array<{ status: string }>>(`/api/spaces/${spaceId}/transactions`);
			expect(rows.every((row) => row.status === "settled")).toBe(true);
		});

		it("removes a selection in one request", async () => {
			const ana = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			const { spaceId, ids } = await threeBills(ana);

			const answer = await ana.json<{ removed: number }>("/api/transactions/remove", {
				method: "POST",
				body: JSON.stringify({ ids }),
			});
			expect(answer.removed).toBe(3);
			expect(await ana.json(`/api/spaces/${spaceId}/transactions`)).toEqual([]);
		});

		it("refuses a selection that belongs to someone else", async () => {
			const ana = createClient(app);
			const joao = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });
			const { ids } = await threeBills(ana);

			const response = await joao.request("/api/transactions", {
				method: "PATCH",
				body: JSON.stringify({ ids, patch: { status: "settled" } }),
			});
			expect(response.status).toBe(404);
		});
	});

	describe("categories", () => {
		it("writes the starting set and lets one be added and picked", async () => {
			const ana = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });

			const space = await ana.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});
			const written = await ana.json<Array<{ name: string }>>(
				`/api/spaces/${space.id}/categories/defaults`,
				{ method: "POST", body: JSON.stringify({}) },
			);
			expect(written.some((category) => category.name === "Mercado")).toBe(true);

			const mine = await ana.json<{ id: string; name: string }>(
				`/api/spaces/${space.id}/categories`,
				{
					method: "POST",
					body: JSON.stringify({ name: "Padaria", kind: "expense", priority: "desirable" }),
				},
			);
			expect(mine.name).toBe("Padaria");

			const account = await ana.json<{ id: string }>(`/api/spaces/${space.id}/accounts`, {
				method: "POST",
				body: JSON.stringify({ kind: "checking", name: "Conta" }),
			});
			const [record] = await ana.json<Array<{ categoryId: string }>>(
				`/api/spaces/${space.id}/transactions`,
				{
					method: "POST",
					body: JSON.stringify({
						kind: "expense",
						amount: 1200,
						happenedOn: "2026-09-10",
						description: "Pao",
						accountId: account.id,
						categoryId: mine.id,
					}),
				},
			);
			expect(record?.categoryId).toBe(mine.id);

			const sorted = await ana.json<Array<{ description: string }>>(
				`/api/spaces/${space.id}/transactions?categoryIds=${mine.id}`,
			);
			expect(sorted.map((row) => row.description)).toEqual(["Pao"]);
		});

		it("lets a viewer read the list and refuses to let them change it", async () => {
			const ana = createClient(app);
			const joao = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });

			const space = await ana.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});
			const invitation = await ana.json<{ token: string }>(`/api/spaces/${space.id}/invitations`, {
				method: "POST",
				body: JSON.stringify({ role: "viewer" }),
			});
			await joao.request(`/api/invitations/${invitation.token}/accept`, { method: "POST" });
			await ana.request(`/api/spaces/${space.id}/categories/defaults`, {
				method: "POST",
				body: JSON.stringify({}),
			});

			const read = await joao.json<unknown[]>(`/api/spaces/${space.id}/categories`);
			expect(read.length).toBeGreaterThan(0);

			const refused = await joao.request(`/api/spaces/${space.id}/categories`, {
				method: "POST",
				body: JSON.stringify({ name: "Minha", kind: "expense" }),
			});
			expect(refused.status).toBe(403);
		});
	});

	describe("rules and recurrences", () => {
		it("sorts a new record by a rule, and writes what a series owes", async () => {
			const ana = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });

			const space = await ana.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});
			const account = await ana.json<{ id: string }>(`/api/spaces/${space.id}/accounts`, {
				method: "POST",
				body: JSON.stringify({ kind: "checking", name: "Conta" }),
			});
			const category = await ana.json<{ id: string }>(`/api/spaces/${space.id}/categories`, {
				method: "POST",
				body: JSON.stringify({ name: "Delivery", kind: "expense", priority: "superfluous" }),
			});

			await ana.request(`/api/spaces/${space.id}/rules`, {
				method: "POST",
				body: JSON.stringify({ matchText: "ifood", categoryId: category.id }),
			});

			const [written] = await ana.json<Array<{ categoryId: string }>>(
				`/api/spaces/${space.id}/transactions`,
				{
					method: "POST",
					body: JSON.stringify({
						kind: "expense",
						amount: 4290,
						happenedOn: "2026-09-10",
						description: "iFood da noite",
						accountId: account.id,
					}),
				},
			);
			expect(written?.categoryId).toBe(category.id);

			await ana.request(`/api/spaces/${space.id}/recurrences`, {
				method: "POST",
				body: JSON.stringify({
					description: "Aluguel",
					kind: "expense",
					amount: 145_000,
					accountId: account.id,
					frequency: "monthly",
					startsOn: "2026-09-05",
				}),
			});

			const first = await ana.json<{ written: number }>(
				`/api/spaces/${space.id}/recurrences/materialize`,
				{ method: "POST", body: JSON.stringify({ until: "2026-12-31" }) },
			);
			expect(first.written).toBeGreaterThan(0);

			const again = await ana.json<{ written: number }>(
				`/api/spaces/${space.id}/recurrences/materialize`,
				{ method: "POST", body: JSON.stringify({ until: "2026-12-31" }) },
			);
			expect(again.written).toBe(0);
		});
	});

	describe("the plan and the division", () => {
		it("keeps a limit and says how it is doing", async () => {
			const ana = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });

			const space = await ana.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});
			const account = await ana.json<{ id: string }>(`/api/spaces/${space.id}/accounts`, {
				method: "POST",
				body: JSON.stringify({ kind: "checking", name: "Conta" }),
			});

			await ana.request(`/api/spaces/${space.id}/budgets`, {
				method: "POST",
				body: JSON.stringify({ scope: "total", amount: 200_000 }),
			});
			await ana.request(`/api/spaces/${space.id}/transactions`, {
				method: "POST",
				body: JSON.stringify({
					kind: "expense",
					amount: 50_000,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: account.id,
				}),
			});

			const progress = await ana.json<Array<{ progress: { spent: number; left: number } }>>(
				`/api/spaces/${space.id}/budgets/progress?month=2026-09&today=2026-09-30`,
			);
			expect(progress[0]?.progress.spent).toBe(50_000);
			expect(progress[0]?.progress.left).toBe(150_000);
		});

		it("divides an expense between two people and clears it when one pays back", async () => {
			const ana = createClient(app);
			const joao = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });

			const space = await ana.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});
			const invitation = await ana.json<{ token: string }>(`/api/spaces/${space.id}/invitations`, {
				method: "POST",
				body: JSON.stringify({ role: "editor" }),
			});
			await joao.request(`/api/invitations/${invitation.token}/accept`, { method: "POST" });

			const account = await ana.json<{ id: string }>(`/api/spaces/${space.id}/accounts`, {
				method: "POST",
				body: JSON.stringify({ kind: "checking", name: "Conta conjunta" }),
			});
			const [expense] = await ana.json<Array<{ id: string }>>(
				`/api/spaces/${space.id}/transactions`,
				{
					method: "POST",
					body: JSON.stringify({
						kind: "expense",
						amount: 20_000,
						happenedOn: "2026-09-10",
						description: "Conta de luz",
						accountId: account.id,
					}),
				},
			);

			const parts = await ana.json<Array<{ amount: number }>>(
				`/api/transactions/${expense?.id}/splits`,
				{ method: "POST", body: JSON.stringify({ method: "evenly" }) },
			);
			expect(parts).toHaveLength(2);

			const suggested = await ana.json<Array<{ amount: number }>>(
				`/api/spaces/${space.id}/sharing/suggested`,
			);
			expect(suggested[0]?.amount).toBe(10_000);

			// The other person sees the same thing, because it is their debt.
			const seen = await joao.json<Array<{ userId: string; amount: number }>>(
				`/api/spaces/${space.id}/sharing/balances`,
			);
			expect(seen.length).toBe(2);

			const owes = seen.find((one) => one.amount < 0);
			const owed = seen.find((one) => one.amount > 0);

			await ana.request(`/api/spaces/${space.id}/sharing/settlements`, {
				method: "POST",
				body: JSON.stringify({
					fromUserId: owes?.userId,
					toUserId: owed?.userId,
					amount: 10_000,
					happenedOn: "2026-09-12",
				}),
			});

			expect(await ana.json(`/api/spaces/${space.id}/sharing/balances`)).toEqual([]);
		});
	});

	describe("replication", () => {
		it("takes what a device wrote and hands back what it has not seen", async () => {
			const ana = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });

			const space = await ana.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});
			await ana.request(`/api/spaces/${space.id}/accounts`, {
				method: "POST",
				body: JSON.stringify({ kind: "cash", name: "Carteira" }),
			});

			const first = await ana.json<{ changes: unknown[]; people: unknown[]; stamp: string }>(
				`/api/spaces/${space.id}/sync`,
				{ method: "POST", body: JSON.stringify({ since: null, changes: [] }) },
			);

			expect(first.changes.length).toBeGreaterThan(0);
			expect(first.people).toHaveLength(1);

			// Asking again from the stamp it was given brings nothing new.
			const second = await ana.json<{ changes: unknown[] }>(`/api/spaces/${space.id}/sync`, {
				method: "POST",
				body: JSON.stringify({ since: first.stamp, changes: [] }),
			});
			expect(second.changes).toHaveLength(0);
		});

		it("refuses a change written in somebody else's name", async () => {
			const ana = createClient(app);
			const joao = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });

			const space = await ana.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});
			const invitation = await ana.json<{ token: string }>(`/api/spaces/${space.id}/invitations`, {
				method: "POST",
				body: JSON.stringify({ role: "editor" }),
			});
			await joao.request(`/api/invitations/${invitation.token}/accept`, { method: "POST" });

			const me = await ana.json<{ user: { id: string } }>("/api/me");

			const answer = await joao.json<{ applied: number; refused: number }>(
				`/api/spaces/${space.id}/sync`,
				{
					method: "POST",
					body: JSON.stringify({
						since: null,
						changes: [
							{
								id: "55555555-5555-7555-8555-555555555555",
								spaceId: space.id,
								entity: "accounts",
								entityId: "66666666-6666-7666-8666-666666666666",
								operation: "insert",
								payload: { name: "Conta falsa" },
								hlc: "zzzzzzzzzzzz",
								deviceId: "outro",
								// Written as if it were Ana.
								actorId: me.user.id,
								createdAt: Date.now(),
							},
						],
					}),
				},
			);

			expect(answer.applied).toBe(0);
			expect(answer.refused).toBe(1);
		});

		it("tells somebody outside the space that it does not exist", async () => {
			const ana = createClient(app);
			const joao = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });

			const space = await ana.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});

			const response = await joao.request(`/api/spaces/${space.id}/sync`, {
				method: "POST",
				body: JSON.stringify({ since: null, changes: [] }),
			});
			expect(response.status).toBe(404);
		});
	});

	describe("saved filters", () => {
		it("keeps a filter for the person who wrote it, and for nobody else", async () => {
			const ana = createClient(app);
			const joao = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });

			const space = await ana.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});
			const invitation = await ana.json<{ token: string }>(`/api/spaces/${space.id}/invitations`, {
				method: "POST",
				body: JSON.stringify({ role: "editor" }),
			});
			await joao.request(`/api/invitations/${invitation.token}/accept`, { method: "POST" });

			const filter = await ana.json<{ id: string; name: string }>(
				`/api/spaces/${space.id}/filters`,
				{
					method: "POST",
					body: JSON.stringify({ name: "A pagar", query: { status: "planned" } }),
				},
			);
			expect(filter.name).toBe("A pagar");

			expect(await joao.json(`/api/spaces/${space.id}/filters`)).toEqual([]);
			const reach = await joao.request(`/api/filters/${filter.id}`, { method: "DELETE" });
			expect(reach.status).toBe(404);

			const renamed = await ana.json<{ name: string }>(`/api/filters/${filter.id}`, {
				method: "PATCH",
				body: JSON.stringify({ name: "Contas a pagar" }),
			});
			expect(renamed.name).toBe("Contas a pagar");

			const gone = await ana.request(`/api/filters/${filter.id}`, { method: "DELETE" });
			expect(gone.status).toBe(204);
			expect(await ana.json(`/api/spaces/${space.id}/filters`)).toEqual([]);
		});
	});

	describe("invitations", () => {
		async function invite(client: Client, spaceId: string, role = "editor") {
			return client.json<{ token: string; link: string }>(`/api/spaces/${spaceId}/invitations`, {
				method: "POST",
				body: JSON.stringify({ role }),
			});
		}

		it("takes a person from a link to a member with a role", async () => {
			const ana = createClient(app);
			const joao = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });

			const space = await ana.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});
			const invitation = await invite(ana, space.id);

			const preview = await joao.json<{ spaceName: string; role: string }>(
				`/api/invitations/${invitation.token}`,
			);
			expect(preview).toMatchObject({ spaceName: "Casa", role: "editor" });

			const accepted = await joao.request(`/api/invitations/${invitation.token}/accept`, {
				method: "POST",
			});
			expect(accepted.status).toBe(200);

			const spaces = await joao.json<Array<{ name: string }>>("/api/spaces");
			expect(spaces.map((space) => space.name)).toEqual(["Casa"]);
		});

		it("lets a link be read by someone with no account at all", async () => {
			const ana = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			const space = await ana.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});
			const invitation = await invite(ana, space.id);

			const response = await app.request(
				`http://localhost:4321/api/invitations/${invitation.token}`,
			);
			expect(response.status).toBe(200);
		});

		it("burns the link once it is used", async () => {
			const ana = createClient(app);
			const joao = createClient(app);
			const carla = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });
			await carla.signUp({ name: "Carla", email: "carla@exemplo.com" });

			const space = await ana.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});
			const invitation = await invite(ana, space.id);

			await joao.request(`/api/invitations/${invitation.token}/accept`, { method: "POST" });
			const second = await carla.request(`/api/invitations/${invitation.token}/accept`, {
				method: "POST",
			});
			expect(second.status).toBe(409);
		});

		it("refuses to invite into someone else's space", async () => {
			const ana = createClient(app);
			const joao = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });

			const space = await ana.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});

			const response = await joao.request(`/api/spaces/${space.id}/invitations`, {
				method: "POST",
				body: JSON.stringify({ role: "editor" }),
			});
			expect(response.status).toBe(404);
		});

		it("stops a viewer from writing, and lets an editor write", async () => {
			const ana = createClient(app);
			const joao = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });

			const space = await ana.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});

			const asViewer = await invite(ana, space.id, "viewer");
			await joao.request(`/api/invitations/${asViewer.token}/accept`, { method: "POST" });

			const refused = await joao.request(`/api/spaces/${space.id}/accounts`, {
				method: "POST",
				body: JSON.stringify({ kind: "cash", name: "Dinheiro" }),
			});
			expect(refused.status).toBe(403);

			await ana.request(`/api/spaces/${space.id}/members/${await idOf(joao)}`, {
				method: "PATCH",
				body: JSON.stringify({ role: "editor" }),
			});

			const allowed = await joao.request(`/api/spaces/${space.id}/accounts`, {
				method: "POST",
				body: JSON.stringify({ kind: "cash", name: "Dinheiro" }),
			});
			expect(allowed.status).toBe(201);
		});

		async function idOf(client: Client): Promise<string> {
			const me = await client.json<{ user: { id: string } }>("/api/me");
			return me.user.id;
		}
	});
});
