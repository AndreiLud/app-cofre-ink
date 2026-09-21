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
