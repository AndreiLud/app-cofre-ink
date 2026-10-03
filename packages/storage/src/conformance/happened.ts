// What has happened, by one rule, on every adapter.
//
// Release 1.2.1 wrote a record dated ahead as a promise, and nothing ever turned a
// promise into a fact: the rent written for the tenth stayed out of the balance on the
// tenth and was called late on the eleventh, unless somebody said it had happened. A
// record dated ahead is a fact now, and its day holds it back until the day comes.
//
// Every test here writes a record the way the form and the quick entry write it, which
// is with no status at all, and reads it from the places that separate what has
// happened from what is still to come: on the day before its day, and on it.

import { addDays, duesOf, monthOf, todayIn } from "@cofre/core";
import { describe, expect, it } from "vitest";
import { type AdapterUnderTest, prepare } from "./setup.ts";

/** The day the overview and the figures are read on, for the tests that pass one. */
const TODAY = "2026-09-20";
const AHEAD = "2026-09-23";

async function household(adapter: AdapterUnderTest) {
	const fixture = await prepare(adapter);
	const space = await fixture.asAna.spaces.create({ name: "Casa" });
	const account = await fixture.asAna.accounts.create({
		spaceId: space.id,
		kind: "checking",
		name: "Conta",
		initialBalance: 500_000,
	});
	const savings = await fixture.asAna.accounts.create({
		spaceId: space.id,
		kind: "savings",
		name: "Poupanca",
	});
	return { fixture, spaceId: space.id, account, savings };
}

export function runHappenedConformance(adapter: AdapterUnderTest): void {
	describe("what has happened, by one rule", () => {
		it("counts a record dated three days ahead on its day, and never calls it late", async () => {
			const ready = await household(adapter);
			try {
				const [rent] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 145_000,
					happenedOn: AHEAD,
					description: "Aluguel",
					accountId: ready.account.id,
				});
				expect(rent?.status).toBe("settled");

				const settledOn = async (day: string) =>
					(await ready.fixture.asAna.transactions.balances(ready.spaceId, day)).find(
						(one) => one.accountId === ready.account.id,
					)?.settled;
				expect(await settledOn(TODAY)).toBe(500_000);
				expect(await settledOn(addDays(AHEAD, -1))).toBe(500_000);
				expect(await settledOn(AHEAD)).toBe(355_000);

				const ids = async (filter: { stillToComeOn?: string; happenedBy?: string }) =>
					(await ready.fixture.asAna.transactions.list({ spaceId: ready.spaceId, ...filter })).map(
						(row) => row.id,
					);
				expect(await ids({ stillToComeOn: TODAY })).toEqual([rent?.id]);
				expect(await ids({ stillToComeOn: AHEAD })).toEqual([]);
				expect(await ids({ happenedBy: TODAY })).toEqual([]);
				expect(await ids({ happenedBy: AHEAD })).toEqual([rent?.id]);

				// Late is a promise whose day has gone, and nothing new is a promise.
				expect(
					await ready.fixture.asAna.transactions.list({
						spaceId: ready.spaceId,
						status: "planned",
					}),
				).toEqual([]);
			} finally {
				await ready.fixture.close();
			}
		});

		it("still waits for an answer on a promise written before 1.1.0", async () => {
			const ready = await household(adapter);
			try {
				const [old] = await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 30_000,
					happenedOn: "2026-09-10",
					description: "Conta de luz",
					accountId: ready.account.id,
					status: "planned",
				});

				const balances = await ready.fixture.asAna.transactions.balances(ready.spaceId, TODAY);
				expect(balances.find((one) => one.accountId === ready.account.id)?.settled).toBe(500_000);
				const toCome = await ready.fixture.asAna.transactions.list({
					spaceId: ready.spaceId,
					stillToComeOn: TODAY,
				});
				expect(toCome.map((row) => row.id)).toEqual([old?.id]);
			} finally {
				await ready.fixture.close();
			}
		});

		it("puts nothing in a goal before the day of the transfer", async () => {
			const ready = await household(adapter);
			try {
				await ready.fixture.asAna.goals.create({
					spaceId: ready.spaceId,
					name: "Reserva",
					targetAmount: 1_000_000,
					accountId: ready.savings.id,
				});
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "transfer",
					amount: 100_000,
					happenedOn: AHEAD,
					description: "Guardar",
					accountId: ready.account.id,
					counterAccountId: ready.savings.id,
				});

				const [before] = await ready.fixture.asAna.goals.progress({
					spaceId: ready.spaceId,
					today: TODAY,
				});
				expect(before?.saved).toBe(0);
				const [on] = await ready.fixture.asAna.goals.progress({
					spaceId: ready.spaceId,
					today: AHEAD,
				});
				expect(on?.saved).toBe(100_000);
			} finally {
				await ready.fixture.close();
			}
		});

		it("reads the month in the figures up to today and not up to the thirty first", async () => {
			const ready = await household(adapter);
			try {
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "income",
					amount: 600_000,
					happenedOn: AHEAD,
					description: "Salario",
					accountId: ready.account.id,
				});
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 20_000,
					happenedOn: AHEAD,
					description: "Internet",
					accountId: ready.account.id,
				});

				const before = await ready.fixture.asAna.advice.snapshot({
					spaceId: ready.spaceId,
					today: TODAY,
				});
				expect(before.thisMonth.income).toBe(0);
				expect(before.thisMonth.expense).toBe(0);
				expect(before.netByMonth).toEqual([]);
				// Still to come within the next days, which is what falls due.
				expect(duesOf(before).coming.map((one) => one.subject)).toEqual(["Internet"]);

				const on = await ready.fixture.asAna.advice.snapshot({
					spaceId: ready.spaceId,
					today: AHEAD,
				});
				expect(on.thisMonth.income).toBe(600_000);
				expect(on.thisMonth.expense).toBe(20_000);
				expect(duesOf(on).count).toBe(0);
			} finally {
				await ready.fixture.close();
			}
		});

		it("leaves a day that has not come out of a report and out of what was earned", async () => {
			const ready = await household(adapter);
			try {
				// These two read today where the space lives, so the days are counted from it.
				const today = todayIn("America/Sao_Paulo");
				const ahead = addDays(today, 3);
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "income",
					amount: 600_000,
					happenedOn: ahead,
					description: "Salario",
					accountId: ready.account.id,
				});
				await ready.fixture.asAna.transactions.create({
					spaceId: ready.spaceId,
					kind: "expense",
					amount: 4_000,
					happenedOn: today,
					description: "Padaria",
					accountId: ready.account.id,
				});

				const totals = await ready.fixture.asAna.reports.totals({
					spaceId: ready.spaceId,
					from: addDays(today, -10),
					to: addDays(today, 10),
				});
				expect(totals.income).toBe(0);
				expect(totals.expense).toBe(4_000);

				// Asked for on purpose, what is still to come is there.
				const everything = await ready.fixture.asAna.reports.totals({
					spaceId: ready.spaceId,
					from: addDays(today, -10),
					to: addDays(today, 10),
					includePlanned: true,
				});
				expect(everything.income).toBe(600_000);

				const consolidated = await ready.fixture.asAna.reports.totals({
					from: addDays(today, -10),
					to: addDays(today, 10),
				});
				expect(consolidated.income).toBe(0);

				const savings = await ready.fixture.asAna.goals.savings({
					spaceId: ready.spaceId,
					month: monthOf(ahead),
				});
				expect(savings.earned).toBe(0);
			} finally {
				await ready.fixture.close();
			}
		});
	});
}
