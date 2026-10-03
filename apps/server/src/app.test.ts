// The API, exercised the way a browser would use it: sign up, get a cookie, and then
// every request carries it. No network and no listening socket, because Hono answers
// a plain Request.

import { solveWork } from "@cofre/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { type Config, readConfig } from "./config.ts";
import { type OpenedDatabase, openDatabase } from "./database.ts";

type Client = {
	request: (path: string, init?: RequestInit) => Promise<Response>;
	json: <T>(path: string, init?: RequestInit) => Promise<T>;
	/** One answer to one challenge, which is what the gate in front of a password wants. */
	answer: () => Promise<string>;
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

	/**
	 * The work the server asks for before it reads a password, done the way a browser
	 * does it. The tests carry it because the gate is real in a test too: what is made
	 * cheap there is the difficulty, not the rule.
	 */
	const answer = async (): Promise<string> => {
		const response = await request("/api/challenge");
		const challenge = (await response.json()) as { id: string; salt: string; bits: number };
		return `${challenge.id}.${solveWork(challenge.salt, challenge.bits) ?? 0}`;
	};

	return {
		request,
		json: async <T>(path: string, init?: RequestInit) => {
			const response = await request(path, init);
			return (await response.json()) as T;
		},
		answer,
		signUp: async (person) => {
			const response = await request("/api/auth/sign-up/email", {
				method: "POST",
				headers: { "x-cofre-proof": await answer() },
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

	it("says the things a browser reads before it does anything clever", async () => {
		const response = await app.request("http://localhost:4321/health");

		// Nothing in this product is meant to sit inside somebody else's page.
		expect(response.headers.get("x-frame-options")).toBe("DENY");
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		// The address of a screen says which space somebody is looking at.
		expect(response.headers.get("referrer-policy")).toBe("no-referrer");
	});

	it("refuses a body too large to be honest", async () => {
		const ana = createClient(app);
		await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });

		// Thirty megabytes of nothing, which no real push or backup comes close to.
		const response = await ana.request("/api/spaces", {
			method: "POST",
			body: JSON.stringify({ name: "x".repeat(30 * 1024 * 1024) }),
		});

		expect(response.status).toBe(413);
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

	/**
	 * Better Auth already counts attempts per address, which stops one machine and not
	 * a thousand. This is the other half: something an address cannot fake, which is
	 * work that was actually done, checked before the part that compares passwords.
	 */
	describe("the gate in front of a password", () => {
		it("refuses a sign in and a sign up with no answer at all", async () => {
			const client = createClient(app);
			const body = JSON.stringify({ name: "Ana", email: "ana@exemplo.com", password: PASSWORD });

			const up = await client.request("/api/auth/sign-up/email", { method: "POST", body });
			expect(up.status).toBe(400);
			expect(await up.json()).toEqual({ error: "proofRequired" });

			const inward = await client.request("/api/auth/sign-in/email", { method: "POST", body });
			expect(inward.status).toBe(400);

			// And nothing was made by the attempt.
			expect(await client.json("/api/setup")).toMatchObject({ needsFirstAccount: true });
		});

		it("refuses an answer that is wrong, invented, or used twice", async () => {
			const client = createClient(app);
			const body = JSON.stringify({ name: "Ana", email: "ana@exemplo.com", password: PASSWORD });

			const challenge = await client.json<{ id: string; salt: string; bits: number }>(
				"/api/challenge",
			);

			// The right challenge with the wrong number.
			const wrong = await client.request("/api/auth/sign-up/email", {
				method: "POST",
				headers: { "x-cofre-proof": `${challenge.id}.1` },
				body,
			});
			expect(wrong.status).toBe(400);

			// A challenge nobody issued.
			const invented = await client.request("/api/auth/sign-up/email", {
				method: "POST",
				headers: { "x-cofre-proof": "nao-existe.7" },
				body,
			});
			expect(invented.status).toBe(400);

			// A good answer works once. The second time it is not there any more, which
			// is what stops one solved challenge from paying for a thousand attempts.
			const good = await client.answer();
			const first = await client.request("/api/auth/sign-up/email", {
				method: "POST",
				headers: { "x-cofre-proof": good },
				body,
			});
			expect(first.status).toBeLessThan(300);

			const again = await client.request("/api/auth/sign-in/email", {
				method: "POST",
				headers: { "x-cofre-proof": good },
				body: JSON.stringify({ email: "ana@exemplo.com", password: PASSWORD }),
			});
			expect(again.status).toBe(400);
		});
	});

	it("says whether anybody has an account here, before anybody can ask anything else", async () => {
		const stranger = createClient(app);

		// Answered without a session, because it is the question of somebody who cannot
		// sign in yet: they have just installed this and are being shown a password box.
		const fresh = await stranger.json<{ needsFirstAccount: boolean }>("/api/setup");
		expect(fresh).toMatchObject({ needsFirstAccount: true });

		await stranger.signUp({ name: "Ana", email: "ana@exemplo.com" });

		const after = await stranger.json<{ needsFirstAccount: boolean }>("/api/setup");
		expect(after).toMatchObject({ needsFirstAccount: false });
	});

	it("carries a card over the network, and refuses one that reaches nothing", async () => {
		const ana = createClient(app);
		await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
		const space = await ana.json<{ id: string }>("/api/spaces", {
			method: "POST",
			body: JSON.stringify({ name: "Casa" }),
		});
		const checking = await ana.json<{ id: string }>(`/api/spaces/${space.id}/accounts`, {
			method: "POST",
			body: JSON.stringify({ kind: "checking", name: "Conta" }),
		});
		const invoice = await ana.json<{ id: string }>(`/api/spaces/${space.id}/accounts`, {
			method: "POST",
			body: JSON.stringify({ kind: "credit", name: "Cartao", closingDay: 3, dueDay: 10 }),
		});

		const card = await ana.json<{ id: string; kind: string }>(`/api/spaces/${space.id}/cards`, {
			method: "POST",
			body: JSON.stringify({
				kind: "multiple",
				name: "Do banco",
				lastFour: "4417",
				creditAccountId: invoice.id,
				debitAccountId: checking.id,
			}),
		});
		expect(card.kind).toBe("multiple");

		// The same rule the repository holds, reached through a route.
		const wrong = await ana.request(`/api/spaces/${space.id}/cards`, {
			method: "POST",
			body: JSON.stringify({ kind: "debit", name: "Sem conta" }),
		});
		expect(wrong.status).toBe(409);

		const [written] = await ana.json<Array<{ cardId: string; invoiceMonth: string }>>(
			`/api/spaces/${space.id}/transactions`,
			{
				method: "POST",
				body: JSON.stringify({
					kind: "expense",
					amount: 9_900,
					happenedOn: "2026-09-10",
					description: "Livraria",
					accountId: invoice.id,
					cardId: card.id,
				}),
			},
		);
		expect(written?.cardId).toBe(card.id);
		expect(written?.invoiceMonth).toBe("2026-10");

		const byCard = await ana.json<Array<{ description: string }>>(
			`/api/spaces/${space.id}/transactions?cardId=${card.id}`,
		);
		expect(byCard.map((one) => one.description)).toEqual(["Livraria"]);
	});

	/**
	 * A record on an account with no card at all.
	 *
	 * The route refused an empty card identifier as a string that is too short, and the
	 * repository has always read an empty one as no card, so the same request was written in
	 * a browser and refused on a server. The interface was sending one, which is how it was
	 * found, and the interface is only half of it: the two modes have to answer the same
	 * thing whatever reaches them.
	 */
	it("takes no card as no card, however it is written", async () => {
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

		for (const given of ["", null, undefined]) {
			const [written] = await ana.json<Array<{ cardId: string | null }>>(
				`/api/spaces/${space.id}/transactions`,
				{
					method: "POST",
					body: JSON.stringify({
						kind: "expense",
						amount: 8_000,
						happenedOn: "2026-09-30",
						description: "Conta de luz",
						accountId: account.id,
						cardId: given,
					}),
				},
			);
			expect(written?.cardId).toBeNull();
		}
	});

	it("keeps the mark a record arrives with", async () => {
		// The month screen finds the three records it wrote by this mark. A schema that
		// dropped it would leave that screen writing three more every time somebody typed
		// the same month, and only in server mode, which is the worst place to find out.
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

		const [written] = await ana.json<Array<{ externalId: string | null }>>(
			`/api/spaces/${space.id}/transactions`,
			{
				method: "POST",
				body: JSON.stringify({
					kind: "income",
					amount: 500_000,
					happenedOn: "2026-09-30",
					description: "Entradas de setembro de 2026",
					accountId: account.id,
					externalId: "mes:2026-09:income",
				}),
			},
		);
		expect(written?.externalId).toBe("mes:2026-09:income");

		const back = await ana.json<Array<{ externalId: string | null }>>(
			`/api/spaces/${space.id}/transactions`,
		);
		expect(back.map((one) => one.externalId)).toEqual(["mes:2026-09:income"]);

		// And it can be asked for by that mark, which is how the month screen finds the
		// records it wrote without reading a page of days and hoping they are on it.
		await ana.json(`/api/spaces/${space.id}/transactions`, {
			method: "POST",
			body: JSON.stringify({
				kind: "expense",
				amount: 12_000,
				happenedOn: "2026-09-30",
				description: "Mercado",
				accountId: account.id,
			}),
		});

		const byMark = await ana.json<Array<{ externalId: string | null }>>(
			`/api/spaces/${space.id}/transactions?externalIds=${encodeURIComponent("mes:2026-09:income,mes:2026-09:spending")}`,
		);
		expect(byMark.map((one) => one.externalId)).toEqual(["mes:2026-09:income"]);
	});

	// Part 1, G.1 of the request for 2.0.0: the payment the month screen writes names the
	// invoice it pays, and the parser dropped the field, so on a server it paid the oldest
	// invoice still owed. A month that does not exist is refused.
	it("keeps the invoice a payment names", async () => {
		const ana = createClient(app);
		await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
		const space = await ana.json<{ id: string }>("/api/spaces", {
			method: "POST",
			body: JSON.stringify({ name: "Casa" }),
		});
		const account = (body: Record<string, unknown>) =>
			ana.json<{ id: string }>(`/api/spaces/${space.id}/accounts`, {
				method: "POST",
				body: JSON.stringify(body),
			});
		const checking = await account({ kind: "checking", name: "Conta" });
		const card = await account({ kind: "credit", name: "Cartao", closingDay: 3, dueDay: 10 });
		const payment = (invoiceMonth: string) =>
			ana.request(`/api/spaces/${space.id}/transactions`, {
				method: "POST",
				body: JSON.stringify({
					kind: "transfer",
					amount: 90_000,
					happenedOn: "2026-10-10",
					description: "Pagamento da fatura de outubro de 2026 (Cartao)",
					accountId: checking.id,
					counterAccountId: card.id,
					invoiceMonth,
					externalId: `mes:2026-10:payment:${card.id}`,
				}),
			});

		const written = (await (await payment("2026-10")).json()) as Array<{
			invoiceMonth: string | null;
			invoiceMonthByHand: boolean;
		}>;
		expect(written[0]).toMatchObject({ invoiceMonth: "2026-10", invoiceMonthByHand: true });
		expect((await payment("2026-13")).status).toBe(400);
	});

	// Part 2, D.1.5 and D.3.4.2 of the request for 2.0.0: forty eight parts are written, forty
	// nine are refused by the repository with their own code and 409, and a plan written from the
	// eleventh part has thirty eight rows, the first eleven of forty eight.
	it("writes forty eight parts, refuses forty nine, and starts a plan after the parts paid", async () => {
		const ana = createClient(app);
		await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
		const space = await ana.json<{ id: string }>("/api/spaces", {
			method: "POST",
			body: JSON.stringify({ name: "Casa" }),
		});
		const card = await ana.json<{ id: string }>(`/api/spaces/${space.id}/accounts`, {
			method: "POST",
			body: JSON.stringify({ kind: "credit", name: "Cartao", closingDay: 3, dueDay: 10 }),
		});
		const plan = (over: Record<string, unknown>) =>
			ana.request(`/api/spaces/${space.id}/transactions`, {
				method: "POST",
				body: JSON.stringify({
					kind: "expense",
					amount: 240_000,
					happenedOn: "2026-10-28",
					description: "Geladeira",
					accountId: card.id,
					installments: 48,
					...over,
				}),
			});

		const whole = await plan({});
		expect(whole.status).toBe(201);
		expect(((await whole.json()) as unknown[]).length).toBe(48);

		const tooMany = await plan({ installments: 49 });
		expect(tooMany.status).toBe(409);
		expect(((await tooMany.json()) as { error: string }).error).toBe("tooManyInstallments");

		const after = await plan({ firstInstallment: 11 });
		expect(after.status).toBe(201);
		const rows = (await after.json()) as Array<{ description: string }>;
		expect(rows.length).toBe(38);
		expect(rows[0]?.description).toBe("Geladeira 11/48");

		const outside = await plan({ firstInstallment: 49 });
		expect(outside.status).toBe(409);
		expect(((await outside.json()) as { error: string }).error).toBe("firstInstallmentOutsidePlan");
	});

	// Part 2, C.12 and C.14.5 of the request for 2.0.0: splitting an invoice and paying one with
	// another card on a server, a month that does not exist and an amount that is not whole
	// refused where they come in, forty nine parts refused by the repository, and the rest
	// written.
	it("splits an invoice and pays one with another card, and refuses what is wrong", async () => {
		const ana = createClient(app);
		await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
		const space = await ana.json<{ id: string }>("/api/spaces", {
			method: "POST",
			body: JSON.stringify({ name: "Casa" }),
		});
		const card = (name: string) =>
			ana.json<{ id: string }>(`/api/spaces/${space.id}/accounts`, {
				method: "POST",
				body: JSON.stringify({ kind: "credit", name, closingDay: 3, dueDay: 10 }),
			});
		const a = await card("Nubank");
		const b = await card("Itau");
		const post = (path: string, body: Record<string, unknown>) =>
			ana.request(path, { method: "POST", body: JSON.stringify(body) });
		for (const [accountId, amount] of [
			[a.id, 300_000],
			[b.id, 100_000],
		] as const) {
			await post(`/api/spaces/${space.id}/transactions`, {
				kind: "expense",
				amount,
				happenedOn: "2025-09-20",
				description: "Compras",
				accountId,
			});
		}

		const split = {
			month: "2025-10",
			entry: 0,
			parts: 6,
			amount: 50_000,
			eachPart: true,
			agreedOn: "2025-10-10",
			today: "2025-10-10",
			description: "Parcelamento",
			costDescription: "Juros",
			entryDescription: "Entrada",
			taxDescription: "IOF",
		};
		const route = `/api/accounts/${a.id}/invoices/split`;
		expect((await post(route, { ...split, month: "2025-13" })).status).toBe(400);
		expect((await post(route, { ...split, amount: 50_000.5 })).status).toBe(400);
		const tooMany = await post(route, { ...split, parts: 49 });
		expect(tooMany.status).toBe(409);
		expect(((await tooMany.json()) as { error: string }).error).toBe("tooManyInstallments");
		expect((await post(route, split)).status).toBe(201);

		const paid = await post(`/api/accounts/${b.id}/invoices/payWithCard`, {
			month: "2025-10",
			cardAccountId: a.id,
			amount: 100_000,
			charged: 105_000,
			eachPart: false,
			parts: 3,
			happenedOn: "2025-10-05",
			today: "2025-10-05",
			description: "Pagamento com Nubank",
			costDescription: "Custo",
		});
		expect(paid.status).toBe(201);
		const states = await ana.json<Array<{ month: string; standing: string }>>(
			`/api/accounts/${a.id}/invoices?today=2025-10-10`,
		);
		expect(states.find((one) => one.month === "2025-10")?.standing).toBe("inParts");

		const undone = await post(`/api/accounts/${a.id}/invoices/undoPlan`, {
			month: "2025-10",
			today: "2025-10-10",
		});
		expect(((await undone.json()) as { removed: number }).removed).toBe(6);
	});

	// Part 1, G.6 of the request for 2.0.0: the route that pays an invoice took "2026-13",
	// wrote the payment, and from then on every reading of an invoice in the space answered
	// five hundred. A month or a day that does not exist is refused where it comes in.
	it("refuses a month that does not exist, and the invoices still read", async () => {
		const ana = createClient(app);
		await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
		const space = await ana.json<{ id: string }>("/api/spaces", {
			method: "POST",
			body: JSON.stringify({ name: "Casa" }),
		});
		const account = (body: Record<string, unknown>) =>
			ana.json<{ id: string }>(`/api/spaces/${space.id}/accounts`, {
				method: "POST",
				body: JSON.stringify(body),
			});
		const checking = await account({ kind: "checking", name: "Conta" });
		const card = await account({ kind: "credit", name: "Cartao", closingDay: 3, dueDay: 10 });
		const post = (path: string, body: Record<string, unknown>) =>
			ana.request(path, { method: "POST", body: JSON.stringify(body) });

		const paid = await post(`/api/accounts/${card.id}/invoices/pay`, {
			fromAccountId: checking.id,
			amount: 90_000,
			happenedOn: "2026-10-10",
			month: "2026-13",
			description: "Pagamento da fatura",
		});
		expect(paid.status).toBe(400);
		const untilThen = await post(`/api/accounts/${card.id}/invoices/paidUntil`, {
			fromAccountId: checking.id,
			month: "2026-00",
			today: "2026-10-28",
			description: "Pagamento da fatura",
		});
		expect(untilThen.status).toBe(400);
		const closed = await post(`/api/accounts/${card.id}/invoices/closedOn`, {
			month: "2026-10",
			day: "2026-02-31",
		});
		expect(closed.status).toBe(400);
		const limit = await post(`/api/spaces/${space.id}/budgets`, {
			scope: "total",
			amount: 100_000,
			month: "2026-13",
		});
		expect(limit.status).toBe(400);
		const oneMonth = await ana.request(
			`/api/accounts/${card.id}/invoices/2026-13?today=2026-10-28`,
		);
		expect(oneMonth.status).toBe(400);
		const ahead = await ana.request(
			`/api/spaces/${space.id}/projection?from=2026-13&today=2026-10-28`,
		);
		expect(ahead.status).toBe(400);

		const invoices = await ana.request(`/api/accounts/${card.id}/invoices?today=2026-10-28`);
		expect(invoices.status).toBe(200);
		const standing = await ana.request(`/api/spaces/${space.id}/invoices?today=2026-10-28`);
		expect(standing.status).toBe(200);

		// Part 1, F.3 and F.1 of the request for 2.0.0: the month on paper reads the cards and the
		// holdings as they stood on a day that has gone, in server mode as in the browser. The
		// card here was written down today with nothing on it, so on a day long gone it did not
		// exist, and neither did a holding written down today.
		const stood = await ana.json<unknown[]>(
			`/api/spaces/${space.id}/invoices?today=2020-01-31&asItStood=true`,
		);
		expect(stood).toEqual([]);
		const now = await ana.json<unknown[]>(`/api/spaces/${space.id}/invoices?today=2020-01-31`);
		expect(now.length).toBe(1);
		const broker = await ana.json<{ id: string }>(`/api/spaces/${space.id}/accounts`, {
			method: "POST",
			body: JSON.stringify({ kind: "investment", name: "Corretora" }),
		});
		const holding = await post(`/api/spaces/${space.id}/holdings`, {
			accountId: broker.id,
			name: "Tesouro",
			kind: "fixedIncome",
			quantity: 100_000_000,
			unitPrice: 10_000,
		});
		expect(holding.status).toBe(201);
		expect(await ana.json<unknown[]>(`/api/spaces/${space.id}/holdings?onDay=2020-01-31`)).toEqual(
			[],
		);
		expect((await ana.json<unknown[]>(`/api/spaces/${space.id}/holdings`)).length).toBe(1);
	});

	// Part 2, A.4 of the request for 2.0.0: "Era entre contas suas" on a server, with the other
	// half taken away in the same request, and a month that does not exist refused.
	it("turns a record into a move and takes away the other half", async () => {
		const ana = createClient(app);
		await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
		const space = await ana.json<{ id: string }>("/api/spaces", {
			method: "POST",
			body: JSON.stringify({ name: "Casa" }),
		});
		const account = (kind: string, name: string) =>
			ana.json<{ id: string }>(`/api/spaces/${space.id}/accounts`, {
				method: "POST",
				body: JSON.stringify({ kind, name }),
			});
		const checking = await account("checking", "Conta");
		const savings = await account("savings", "Reserva");
		const write = async (kind: string, accountId: string) =>
			(
				await ana.json<Array<{ id: string }>>(`/api/spaces/${space.id}/transactions`, {
					method: "POST",
					body: JSON.stringify({
						kind,
						amount: 50_000,
						happenedOn: "2026-10-20",
						description: "PIX POUPANCA",
						accountId,
					}),
				})
			)[0]?.id ?? "";
		const out = await write("expense", checking.id);
		const into = await write("income", savings.id);

		const refused = await ana.request(`/api/transactions/${out}/toTransfer`, {
			method: "POST",
			body: JSON.stringify({ otherAccountId: savings.id, invoiceMonth: "2026-13" }),
		});
		expect(refused.status).toBe(400);

		const moved = await ana.json<{ kind: string; counterAccountId: string }>(
			`/api/transactions/${out}/toTransfer`,
			{
				method: "POST",
				body: JSON.stringify({ otherAccountId: savings.id, mergeWith: into }),
			},
		);
		expect(moved).toMatchObject({ kind: "transfer", counterAccountId: savings.id });
		const left = await ana.json<Array<{ id: string }>>(`/api/spaces/${space.id}/transactions`);
		expect(left.map((one) => one.id)).toEqual([out]);
	});

	// The overview lists what is still to come by the day, and a record dated ahead is
	// written as a fact. The route dropped both filters, so on a server the overview listed
	// what had already happened under "coming" and the late list stayed whole.
	it("hands the day rule to the list, both ways", async () => {
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
		for (const [description, happenedOn] of [
			["Padaria", "2026-09-20"],
			["Aluguel", "2026-09-23"],
		]) {
			await ana.json(`/api/spaces/${space.id}/transactions`, {
				method: "POST",
				body: JSON.stringify({
					kind: "expense",
					amount: 10_000,
					happenedOn,
					description,
					accountId: account.id,
				}),
			});
		}

		const toCome = await ana.json<Array<{ description: string; status: string }>>(
			`/api/spaces/${space.id}/transactions?stillToComeOn=2026-09-20`,
		);
		expect(toCome.map((one) => one.description)).toEqual(["Aluguel"]);
		expect(toCome[0]?.status).toBe("settled");

		const happened = await ana.json<Array<{ description: string }>>(
			`/api/spaces/${space.id}/transactions?happenedBy=2026-09-20`,
		);
		expect(happened.map((one) => one.description)).toEqual(["Padaria"]);
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

		it("confirms a selection in one request, leaving every day alone", async () => {
			const ana = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			const { spaceId, ids } = await threeBills(ana);

			// The day comes from the caller, because it is a day in the timezone of the space and
			// not of the machine answering. A bill promised for a day already gone stays on it.
			const answer = await ana.json<{ settled: number }>("/api/transactions/settle", {
				method: "POST",
				body: JSON.stringify({ ids, today: "2026-09-29" }),
			});
			expect(answer.settled).toBe(3);

			const rows = await ana.json<Array<{ status: string; happenedOn: string }>>(
				`/api/spaces/${spaceId}/transactions`,
			);
			expect(rows.every((row) => row.status === "settled")).toBe(true);
			expect(rows.every((row) => row.happenedOn === "2026-09-10")).toBe(true);
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

		/**
		 * A browser that keeps its data locally has a profile made on that device, which
		 * the server has never heard of. These are the entries such a device pushes the
		 * first time it meets a server, written by hand because the device is not here.
		 */
		function aSpaceFromADevice(spaceId: string, accountId: string, profileId: string) {
			const moment = Date.now();
			const base = {
				created_at: moment,
				updated_at: moment,
				updated_by: profileId,
				deleted_at: null,
			};

			return [
				{
					id: "77777777-7777-7777-8777-777777777777",
					spaceId,
					entity: "spaces",
					entityId: spaceId,
					operation: "insert" as const,
					payload: {
						id: spaceId,
						kind: "shared",
						name: "Casa do aparelho",
						colour: "clay",
						icon: "wallet",
						base_currency: "BRL",
						timezone: "America/Sao_Paulo",
						created_by: profileId,
						hlc: "000000000001",
						...base,
					},
					hlc: "000000000001",
					deviceId: "aparelho",
					actorId: profileId,
					createdAt: moment,
				},
				{
					id: "88888888-8888-7888-8888-888888888888",
					spaceId,
					entity: "accounts",
					entityId: accountId,
					operation: "insert" as const,
					payload: {
						id: accountId,
						space_id: spaceId,
						kind: "cash",
						name: "Carteira do aparelho",
						currency: "BRL",
						initial_balance: 25_000,
						created_by: profileId,
						hlc: "000000000002",
						...base,
					},
					hlc: "000000000002",
					deviceId: "aparelho",
					actorId: profileId,
					createdAt: moment,
				},
			];
		}

		it("takes in a space a device made under a profile of its own", async () => {
			const ana = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });

			const spaceId = "99999999-9999-7999-8999-999999999999";
			const accountId = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";
			const profileId = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb";

			const answer = await ana.json<{ applied: number; refused: number }>(
				`/api/spaces/${spaceId}/sync`,
				{
					method: "POST",
					body: JSON.stringify({
						since: null,
						profile: { id: profileId, email: "ana.7k2@dispositivo.local", name: "Ana (aparelho)" },
						changes: aSpaceFromADevice(spaceId, accountId, profileId),
					}),
				},
			);

			expect(answer.applied).toBe(2);
			expect(answer.refused).toBe(0);

			// Whoever pushed it owns it, and the rows came with it.
			const spaces = await ana.json<Array<{ id: string; name: string }>>("/api/spaces");
			expect(spaces.map((space) => space.name)).toEqual(["Casa do aparelho"]);

			const accounts = await ana.json<Array<{ name: string; initialBalance: number }>>(
				`/api/spaces/${spaceId}/accounts`,
			);
			expect(accounts).toEqual([
				expect.objectContaining({ name: "Carteira do aparelho", initialBalance: 25_000 }),
			]);
		});

		it("does not let a second person walk into a space that is now taken", async () => {
			const ana = createClient(app);
			const joao = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });

			const spaceId = "99999999-9999-7999-8999-999999999999";
			const accountId = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";
			const profileId = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb";
			const changes = aSpaceFromADevice(spaceId, accountId, profileId);

			await ana.request(`/api/spaces/${spaceId}/sync`, {
				method: "POST",
				body: JSON.stringify({
					since: null,
					profile: { id: profileId, email: "ana.7k2@dispositivo.local", name: "Ana (aparelho)" },
					changes,
				}),
			});

			const response = await joao.request(`/api/spaces/${spaceId}/sync`, {
				method: "POST",
				body: JSON.stringify({
					since: null,
					profile: { id: profileId, email: "ana.7k2@dispositivo.local", name: "Ana (aparelho)" },
					changes,
				}),
			});
			expect(response.status).toBe(404);
		});

		it("never lets a device write in the name of an account", async () => {
			const ana = createClient(app);
			const joao = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });

			const me = await ana.json<{ user: { id: string; email: string } }>("/api/me");

			const response = await joao.request(`/api/spaces/99999999-9999-7999-8999-999999999999/sync`, {
				method: "POST",
				body: JSON.stringify({
					since: null,
					// A profile that claims to be Ana.
					profile: { id: me.user.id, email: me.user.email, name: "Ana" },
					changes: [],
				}),
			});
			expect(response.status).toBe(403);
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

	describe("reading a file in and taking everything out", () => {
		/** A space with an account, which is all an import needs on the other side. */
		async function spaceWithAccount(client: Client) {
			const space = await client.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Casa" }),
			});
			const account = await client.json<{ id: string }>(`/api/spaces/${space.id}/accounts`, {
				method: "POST",
				body: JSON.stringify({ kind: "checking", name: "Conta" }),
			});
			return { space, account };
		}

		it("writes a whole statement and then knows it is there", async () => {
			const ana = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			const { space, account } = await spaceWithAccount(ana);

			const written = await ana.json<{ written: number }>(`/api/spaces/${space.id}/imports`, {
				method: "POST",
				body: JSON.stringify({
					accountId: account.id,
					records: [
						{
							happenedOn: "2026-09-10",
							amount: -4290,
							description: "Mercado",
							externalId: "abc",
						},
						{ happenedOn: "2026-09-05", amount: 500_000, description: "Salario" },
					],
				}),
			});
			expect(written.written).toBe(2);

			const known = await ana.json<Array<{ externalId: string | null; amount: number }>>(
				`/api/spaces/${space.id}/imports/existing?from=2026-09-01&to=2026-09-30`,
			);
			expect(known).toHaveLength(2);
			expect(known.find((row) => row.externalId === "abc")?.amount).toBe(-4290);
		});

		// Part 2, E.17.2 of the request for 2.0.0: the check of the request dropped every field it
		// did not know, so an invoice read on a server lost its month, its natures and its plans.
		it("keeps every field of an invoice read in, and refuses a month that is not one", async () => {
			const ana = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			const { space, account } = await spaceWithAccount(ana);
			const card = await ana.json<{ id: string }>(`/api/spaces/${space.id}/accounts`, {
				method: "POST",
				body: JSON.stringify({ kind: "credit", name: "Cartao", closingDay: 3, dueDay: 10 }),
			});
			const [purchase] = await ana.json<Array<{ id: string }>>(
				`/api/spaces/${space.id}/transactions`,
				{
					method: "POST",
					body: JSON.stringify({
						kind: "expense",
						amount: 5000,
						happenedOn: "2026-09-02",
						description: "Loja X",
						accountId: card.id,
					}),
				},
			);
			const send = (invoiceMonth: string) =>
				ana.request(`/api/spaces/${space.id}/imports`, {
					method: "POST",
					body: JSON.stringify({
						accountId: card.id,
						invoiceMonth,
						records: [
							{
								happenedOn: "2026-10-03",
								amount: 1840,
								description: "Padaria",
								nature: "purchase",
							},
							{
								happenedOn: "2026-09-12",
								amount: 15_000,
								description: "Geladeira",
								nature: "installment",
								installment: { number: 5, count: 10 },
							},
							{
								happenedOn: "2026-09-05",
								amount: -100_000,
								description: "Pagamento da fatura de setembro de 2026 (Cartao)",
								nature: "payment",
								paymentFrom: account.id,
							},
							{
								happenedOn: "2026-09-14",
								amount: 5000,
								description: "Estorno Loja X",
								nature: "credit",
								reverses: purchase?.id,
							},
						],
					}),
				});
			expect((await send("2026-13")).status).toBe(400);

			const response = await send("2026-10");
			expect(response.status).toBe(201);
			const rows = await ana.json<
				Array<{ description: string; kind: string; invoiceMonth: string | null }>
			>(`/api/spaces/${space.id}/transactions?accountId=${card.id}&limit=50`);
			expect(rows.find((row) => row.description === "Padaria")?.invoiceMonth).toBe("2026-10");
			expect(rows.filter((row) => row.description.startsWith("Geladeira"))).toHaveLength(6);
			expect(rows.find((row) => row.description.startsWith("Pagamento"))?.invoiceMonth).toBe(
				"2026-09",
			);
			expect(rows.find((row) => row.description === "Loja X")).toBeUndefined();
		});

		it("refuses the whole file when one line has no day", async () => {
			const ana = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			const { space, account } = await spaceWithAccount(ana);

			const response = await ana.request(`/api/spaces/${space.id}/imports`, {
				method: "POST",
				body: JSON.stringify({
					accountId: account.id,
					records: [
						{ happenedOn: "2026-09-10", amount: -1000, description: "Padaria" },
						{ happenedOn: "sem data", amount: -1000, description: "Outra" },
					],
				}),
			});
			expect(response.status).toBe(400);
			expect(await ana.json(`/api/spaces/${space.id}/imports/existing`)).toEqual([]);
		});

		it("hands the space over as a file and takes it back", async () => {
			const ana = createClient(app);
			const joao = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });

			const { space, account } = await spaceWithAccount(ana);
			await ana.request(`/api/spaces/${space.id}/transactions`, {
				method: "POST",
				body: JSON.stringify({
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Mercado do bairro",
					accountId: account.id,
				}),
			});

			const backup = await ana.json<{ format: string; spaces: Array<{ name: string }> }>(
				`/api/spaces/${space.id}/backup`,
			);
			expect(backup.format).toBe("cofre.backup");
			expect(backup.spaces[0]?.name).toBe("Casa");

			// Somebody else, with the file in their hands, becomes the owner of the copy.
			const restored = await joao.json<{ spaces: Array<{ created: boolean; written: number }> }>(
				"/api/backup/restore",
				{ method: "POST", body: JSON.stringify(backup) },
			);
			expect(restored.spaces[0]?.created).toBe(true);
			expect(restored.spaces[0]?.written).toBeGreaterThan(0);

			const mine = await joao.json<Array<{ name: string }>>("/api/spaces");
			expect(mine.map((found) => found.name)).toEqual(["Casa"]);
		});

		it("writes a file of the spaces that were asked for, and brings back some of them", async () => {
			const ana = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			const joao = createClient(app);
			await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });

			const { space } = await spaceWithAccount(ana);
			const other = await ana.json<{ id: string }>("/api/spaces", {
				method: "POST",
				body: JSON.stringify({ name: "Viagem" }),
			});

			// Which spaces may be copied, which is the list the screen offers to tick.
			const copyable = await ana.json<string[]>("/api/backup/spaces");
			expect(copyable.sort()).toEqual([space.id, other.id].sort());

			const chosen = await ana.json<{ spaces: Array<{ id: string; name: string }> }>(
				`/api/backup?spaces=${other.id}`,
			);
			expect(chosen.spaces.map((one) => one.name)).toEqual(["Viagem"]);

			const both = await ana.json<{ spaces: Array<{ id: string; name: string }> }>("/api/backup");
			expect(both.spaces).toHaveLength(2);

			// The file holds two and only one of them was ticked.
			const restored = await joao.json<{ spaces: Array<{ name: string }> }>("/api/backup/restore", {
				method: "POST",
				body: JSON.stringify({ ...both, only: [other.id] }),
			});
			expect(restored.spaces.map((one) => one.name)).toEqual(["Viagem"]);
			expect(
				(await joao.json<Array<{ name: string }>>("/api/spaces")).map((one) => one.name),
			).toEqual(["Viagem"]);
		});

		it("refuses a file that is not a backup", async () => {
			const ana = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });

			const response = await ana.request("/api/backup/restore", {
				method: "POST",
				body: JSON.stringify({ format: "outra coisa" }),
			});
			expect(response.status).toBe(400);
		});

		it("gives a spreadsheet the names of what a record points at", async () => {
			const ana = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			const { space, account } = await spaceWithAccount(ana);

			await ana.request(`/api/spaces/${space.id}/transactions`, {
				method: "POST",
				body: JSON.stringify({
					kind: "expense",
					amount: 1000,
					happenedOn: "2026-09-10",
					description: "Cafe",
					accountId: account.id,
				}),
			});

			const rows = await ana.json<Array<{ account: string; amount: number }>>(
				`/api/spaces/${space.id}/records`,
			);
			expect(rows).toEqual([expect.objectContaining({ account: "Conta", amount: -1000 })]);
		});

		it("keeps a space away from somebody who is not in it", async () => {
			const ana = createClient(app);
			const joao = createClient(app);
			await ana.signUp({ name: "Ana", email: "ana@exemplo.com" });
			await joao.signUp({ name: "Joao", email: "joao@exemplo.com" });

			const { space, account } = await spaceWithAccount(ana);

			expect((await joao.request(`/api/spaces/${space.id}/backup`)).status).toBe(404);
			expect((await joao.request(`/api/spaces/${space.id}/records`)).status).toBe(404);

			const sneak = await joao.request(`/api/spaces/${space.id}/imports`, {
				method: "POST",
				body: JSON.stringify({
					accountId: account.id,
					records: [{ happenedOn: "2026-09-10", amount: -1000, description: "Nao" }],
				}),
			});
			expect(sneak.status).toBe(404);
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
