// The sums behind the charts, on every adapter.
//
// A chart that lies is worse than no chart, so what is checked here is the arithmetic
// and the boundaries: what is inside the period, what counts as spending, and whose
// money is being added up.

import { addDays, todayIn } from "@cofre/core";
import { describe, expect, it } from "vitest";
import { NotFoundError } from "../errors.ts";
import { openSession } from "../session.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

export function runReportConformance(adapter: AdapterUnderTest): void {
	async function spaceWithSpending() {
		const fixture = await prepare(adapter);
		const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
		const account = await fixture.asAna.accounts.create({
			spaceId: space.id,
			kind: "checking",
			name: "Conta",
			initialBalance: 100_000,
		});
		const market = await fixture.asAna.categories.create({
			spaceId: space.id,
			name: "Mercado",
			kind: "expense",
			priority: "essential",
		});
		const fun = await fixture.asAna.categories.create({
			spaceId: space.id,
			name: "Bar",
			kind: "expense",
			priority: "superfluous",
		});
		const salary = await fixture.asAna.categories.create({
			spaceId: space.id,
			name: "Salario",
			kind: "income",
		});

		const write = (
			kind: "income" | "expense",
			amount: number,
			happenedOn: string,
			categoryId: string | null,
			extra: { status?: "planned" | "settled"; priority?: "superfluous" } = {},
		) =>
			fixture.asAna.transactions.create({
				spaceId: space.id,
				kind,
				amount,
				happenedOn,
				description: "Registro",
				accountId: account.id,
				categoryId,
				...extra,
			});

		await write("income", 600_000, "2026-09-05", salary.id);
		await write("expense", 40_000, "2026-09-10", market.id);
		await write("expense", 15_000, "2026-09-10", fun.id);
		await write("expense", 5000, "2026-09-20", null);
		// Another month, to prove the period holds.
		await write("expense", 90_000, "2026-08-15", market.id);
		// Still to come, so it is not part of what happened.
		await write("expense", 70_000, "2026-09-25", market.id, { status: "planned" });

		return { fixture, spaceId: space.id, account, market, fun, salary };
	}

	describe("reports", () => {
		// Part 1, B.10 of the request for 2.0.0: an allowance landing on the twenty fifth was
		// counted in the month in hand from its first day. Read against today's date, because
		// a report reads today where the space lives: the landing is three days ahead.
		it("counts an allowance in a report once it has landed, and not before", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const today = todayIn("America/Sao_Paulo");
				const landsOn = addDays(today, 3);
				await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale",
					benefit: "meal",
					quotaAmount: 90_000,
					quotaDay: Number(landsOn.slice(8)),
					quotaCarries: true,
				});

				// Ahead of today: the landing in three days and the one a month after it.
				const ahead = await fixture.asAna.reports.totals({
					spaceId: space.id,
					from: today,
					to: addDays(today, 40),
				});
				expect(ahead.benefits).toBe(0);

				// Behind it: the landing of the period the card was written down in.
				const behind = await fixture.asAna.reports.totals({
					spaceId: space.id,
					from: addDays(today, -40),
					to: today,
				});
				expect(behind.benefits).toBe(90_000);
			} finally {
				await fixture.close();
			}
		});

		// Part 1, C.1 of the request for 2.0.0: the months of a report had no benefit while the
		// totals had it, so the same month said two different things about what came in.
		it("gives each month the benefit the totals give it", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = await openSession({
					driver: fixture.driver,
					userId: fixture.ana.id,
					deviceId: "deviceAna",
					now: () => Date.parse("2026-07-20T12:00:00-03:00"),
				});
				const space = await on.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await on.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});
				await on.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale",
					benefit: "meal",
					quotaAmount: 90_000,
					quotaDay: 5,
					quotaCarries: true,
				});
				for (const month of ["2026-07", "2026-08", "2026-09"]) {
					await on.transactions.create({
						spaceId: space.id,
						kind: "income",
						amount: 612_000,
						happenedOn: `${month}-05`,
						description: "Salario",
						accountId: checking.id,
					});
				}

				const months = await on.reports.byMonth({
					spaceId: space.id,
					from: "2026-07-01",
					to: "2026-09-30",
				});
				expect(months.map((one) => [one.month, one.income, one.benefits])).toEqual([
					["2026-07", 612_000, 90_000],
					["2026-08", 612_000, 90_000],
					["2026-09", 612_000, 90_000],
				]);
				for (const one of months) {
					const totals = await on.reports.totals({
						spaceId: space.id,
						from: `${one.month}-01`,
						to: `${one.month}-${one.month === "2026-09" ? "30" : "31"}`,
					});
					expect(totals.benefits).toBe(one.benefits);
				}
			} finally {
				await fixture.close();
			}
		});

		// Part 1, F.5 of the request for 2.0.0: the month on paper had one line for the benefit and
		// none for each card, which 1.1.0 promised, so two vouchers read as one number.
		it("says what landed on each benefit card, adding up to the benefit of the period", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = await openSession({
					driver: fixture.driver,
					userId: fixture.ana.id,
					deviceId: "deviceAna",
					now: () => Date.parse("2026-07-20T12:00:00-03:00"),
				});
				const space = await on.spaces.create({ name: "Pessoal", kind: "personal" });
				for (const [name, amount] of [
					["VR", 90_000],
					["VA", 60_000],
				] as const) {
					await on.accounts.create({
						spaceId: space.id,
						kind: "voucher",
						name,
						benefit: "meal",
						quotaAmount: amount,
						quotaDay: 5,
						quotaCarries: true,
					});
				}
				const september = { spaceId: space.id, from: "2026-09-01", to: "2026-09-30" };

				const byCard = await on.reports.benefitsByCard(september);
				expect(byCard.map((one) => [one.name, one.amount])).toEqual([
					["VA", 60_000],
					["VR", 90_000],
				]);
				const totals = await on.reports.totals(september);
				expect(byCard.reduce((sum, one) => sum + one.amount, 0)).toBe(totals.benefits);
			} finally {
				await fixture.close();
			}
		});

		it("adds up what came in and what went out inside the period", async () => {
			const ready = await spaceWithSpending();
			try {
				const totals = await ready.fixture.asAna.reports.totals({
					spaceId: ready.spaceId,
					from: "2026-09-01",
					to: "2026-09-30",
				});
				expect(totals.income).toBe(600_000);
				expect(totals.expense).toBe(60_000);
				expect(totals.left).toBe(540_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("counts what is planned only when it is asked for", async () => {
			const ready = await spaceWithSpending();
			try {
				const withPlanned = await ready.fixture.asAna.reports.totals({
					spaceId: ready.spaceId,
					from: "2026-09-01",
					to: "2026-09-30",
					includePlanned: true,
				});
				expect(withPlanned.expense).toBe(130_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("says where the money went, biggest first, keeping what nobody sorted", async () => {
			const ready = await spaceWithSpending();
			try {
				const found = await ready.fixture.asAna.reports.byCategory({
					spaceId: ready.spaceId,
					from: "2026-09-01",
					to: "2026-09-30",
				});

				expect(found.map((one) => one.name)).toEqual(["Mercado", "Bar", null]);
				expect(found.map((one) => one.total)).toEqual([40_000, 15_000, 5000]);
				expect(found[0]?.priority).toBe("essential");
			} finally {
				await ready.fixture.close();
			}
		});

		it("says what the money was needed for, and a record can disagree with its category", async () => {
			const ready = await spaceWithSpending();
			try {
				// Bought at the market, but this one was not a need.
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 9000,
					happenedOn: "2026-09-12",
					description: "Vinho",
					accountId: ready.account.id,
					categoryId: ready.market.id,
					priority: "superfluous",
				});

				const found = await ready.fixture.asAna.reports.byPriority({
					spaceId: ready.spaceId,
					from: "2026-09-01",
					to: "2026-09-30",
				});
				const by = new Map(found.map((one) => [one.priority, one.total]));

				expect(by.get("essential")).toBe(40_000);
				expect(by.get("superfluous")).toBe(24_000);
				// The one with no category at all is counted and named as such.
				expect(by.get(null)).toBe(5000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("reads a year as months", async () => {
			const ready = await spaceWithSpending();
			try {
				const found = await ready.fixture.asAna.reports.byMonth({
					spaceId: ready.spaceId,
					from: "2026-01-01",
					to: "2026-12-31",
				});

				expect(found.map((one) => one.month)).toEqual(["2026-08", "2026-09"]);
				expect(found[0]?.expense).toBe(90_000);
				expect(found[1]?.income).toBe(600_000);
				expect(found[1]?.expense).toBe(60_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("reads a month as days", async () => {
			const ready = await spaceWithSpending();
			try {
				const found = await ready.fixture.asAna.reports.byDay({
					spaceId: ready.spaceId,
					from: "2026-09-01",
					to: "2026-09-30",
				});

				expect(found).toEqual([
					{ day: "2026-09-10", total: 55_000 },
					{ day: "2026-09-20", total: 5000 },
				]);
			} finally {
				await ready.fixture.close();
			}
		});

		it("adds every space of the person together when none is named", async () => {
			const ready = await spaceWithSpending();
			try {
				const house = await ready.fixture.asAna.spaces.create({ name: "Casa" });
				const shared = await ready.fixture.asAna.accounts.create({
					spaceId: house.id,
					kind: "checking",
					name: "Conta conjunta",
				});
				await ready.fixture.asAna.transactions.create({
					spaceId: house.id,
					kind: "expense",
					amount: 30_000,
					happenedOn: "2026-09-11",
					description: "Luz",
					accountId: shared.id,
				});

				const one = await ready.fixture.asAna.reports.totals({
					spaceId: ready.spaceId,
					from: "2026-09-01",
					to: "2026-09-30",
				});
				const everything = await ready.fixture.asAna.reports.totals({
					from: "2026-09-01",
					to: "2026-09-30",
				});

				expect(one.expense).toBe(60_000);
				expect(everything.expense).toBe(90_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("never counts money from a space the person cannot read", async () => {
			const ready = await spaceWithSpending();
			try {
				const everything = await ready.fixture.asJoao.reports.totals({
					from: "2026-09-01",
					to: "2026-09-30",
				});
				expect(everything).toEqual({ income: 0, expense: 0, benefits: 0, left: 0 });

				await expect(
					ready.fixture.asJoao.reports.byCategory({
						spaceId: ready.spaceId,
						from: "2026-09-01",
						to: "2026-09-30",
					}),
				).rejects.toBeInstanceOf(NotFoundError);
			} finally {
				await ready.fixture.close();
			}
		});

		it("shows a logger only what they wrote", async () => {
			const ready = await spaceWithSpending();
			try {
				const house = await ready.fixture.asAna.spaces.create({ name: "Casa" });
				await ready.fixture.asAna.members.invite({
					spaceId: house.id,
					userId: ready.fixture.joao.id,
					role: "logger",
				});
				await ready.fixture.asJoao.members.accept(house.id);

				const account = await ready.fixture.asAna.accounts.create({
					spaceId: house.id,
					kind: "cash",
					name: "Dinheiro",
				});
				await ready.fixture.asAna.transactions.create({
					spaceId: house.id,
					kind: "expense",
					amount: 20_000,
					happenedOn: "2026-09-10",
					description: "Da Ana",
					accountId: account.id,
				});
				await ready.fixture.asJoao.transactions.create({
					spaceId: house.id,
					kind: "expense",
					amount: 3000,
					happenedOn: "2026-09-10",
					description: "Do Joao",
					accountId: account.id,
				});

				const asLogger = await ready.fixture.asJoao.reports.totals({
					spaceId: house.id,
					from: "2026-09-01",
					to: "2026-09-30",
				});
				expect(asLogger.expense).toBe(3000);

				const asOwner = await ready.fixture.asAna.reports.totals({
					spaceId: house.id,
					from: "2026-09-01",
					to: "2026-09-30",
				});
				expect(asOwner.expense).toBe(23_000);
			} finally {
				await ready.fixture.close();
			}
		});
	});
}
