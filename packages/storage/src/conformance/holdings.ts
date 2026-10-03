// Holdings as products, the money that moves with them, and what an investment account is worth.
// Part 2, H of the request for 2.0.0, with its numbers.

import { type CalendarDate, moneyOnHand, spendableNow, todayIn, worthByAccount } from "@cofre/core";
import { describe, expect, it } from "vitest";
import { RuleError } from "../errors.ts";
import { migrate } from "../migrate.ts";
import { saveIndexDays } from "../repositories/indices.ts";
import { openSession, type Session } from "../session.ts";
import { applyPeople } from "../sync.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

const SCALE = 100_000_000;

/** What the overview opens with: every account of money, an investment account at its worth. */
async function youHave(on: Session, spaceId: string, today: CalendarDate): Promise<number> {
	const accounts = await on.accounts.list(spaceId);
	const balances = await on.transactions.balances(spaceId, today);
	const holdings = await on.investments.list(spaceId);
	return moneyOnHand({
		accounts: accounts.map((account) => ({ id: account.id, kind: account.kind })),
		balances: balances.map((one) => ({ accountId: one.accountId, settled: one.settled })),
		worth: worthByAccount(holdings),
	});
}

async function aHousehold(on: Session) {
	const space = await on.spaces.create({ name: "Casa" });
	const checking = await on.accounts.create({
		spaceId: space.id,
		kind: "checking",
		name: "Conta corrente",
		initialBalance: 500_000,
	});
	return { spaceId: space.id, checkingId: checking.id };
}

export function runHoldingsConformance(adapter: AdapterUnderTest): void {
	describe("money that moves with a holding", () => {
		it("writes the holding, its movement and the move from the account in one go", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				const today = todayIn("America/Sao_Paulo");
				const { spaceId, checkingId } = await aHousehold(on);
				const broker = await on.accounts.create({ spaceId, kind: "investment", name: "Nubank" });
				const before = await youHave(on, spaceId, today);

				// A caixinha of R$ 1.000,00 out of the current account.
				const box = await on.investments.create({
					spaceId,
					accountId: broker.id,
					name: "Reserva",
					product: "box",
					rate: 10_000,
					quantity: SCALE,
					unitPrice: 100_000,
					boughtOn: today,
					fromAccountId: checkingId,
				});
				expect(box.value).toBe(100_000);
				const [move] = await on.investments.moves(box.id);
				expect(move).toMatchObject({ kind: "in", amount: 100_000 });
				expect(move?.transactionId).not.toBeNull();

				const balances = await on.transactions.balances(spaceId, today);
				expect(balances.find((one) => one.accountId === checkingId)?.settled).toBe(400_000);
				// The money changed place and nothing else: "Você tem" is what it was.
				expect(await youHave(on, spaceId, today)).toBe(before);

				// The move is the holding's, and changes with it, on the investments screen.
				const moved = (await on.transactions.list({ spaceId })).find(
					(one) => one.id === move?.transactionId,
				);
				expect(moved?.heldBy).toBe(box.id);
				await expect(on.transactions.remove(move?.transactionId ?? "")).rejects.toMatchObject({
					rule: "keptInAHolding",
				});
				await expect(
					on.transactions.update(move?.transactionId ?? "", { description: "Outra" }),
				).rejects.toBeInstanceOf(RuleError);

				// Deleting the holding says what goes back, and gives it back.
				expect(await on.investments.goingBack({ holdingId: box.id })).toEqual(
					expect.arrayContaining([
						{ accountId: checkingId, amount: 100_000 },
						{ accountId: broker.id, amount: -100_000 },
					]),
				);
				await on.investments.remove(box.id);
				const after = await on.transactions.balances(spaceId, today);
				expect(after.find((one) => one.accountId === checkingId)?.settled).toBe(500_000);
			} finally {
				await fixture.close();
			}
		});

		it("takes what the bank deposited when money comes out, and keeps the tax apart", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				const today = todayIn("America/Sao_Paulo");
				const { spaceId, checkingId } = await aHousehold(on);
				const broker = await on.accounts.create({ spaceId, kind: "investment", name: "Banco" });
				const cdb = await on.investments.create({
					spaceId,
					accountId: broker.id,
					name: "CDB",
					product: "cdb",
					issuer: "Banco",
					indexer: "cdi",
					rate: 10_000,
					quantity: SCALE,
					unitPrice: 200_000,
					boughtOn: "2026-01-02",
				});
				const out = await on.investments.move({
					holdingId: cdb.id,
					kind: "out",
					onDay: today,
					amount: 100_000,
					accountId: checkingId,
					arrived: 98_000,
				});
				expect(out.amount).toBe(100_000);
				const balances = await on.transactions.balances(spaceId, today);
				expect(balances.find((one) => one.accountId === checkingId)?.settled).toBe(598_000);
				// What the bank kept is not money out of the household: no record says so.
				const records = await on.transactions.list({ spaceId });
				expect(records.filter((one) => one.kind === "expense")).toEqual([]);
			} finally {
				await fixture.close();
			}
		});

		it("writes income as money in under Rendimentos, linked to the holding", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				const { spaceId, checkingId } = await aHousehold(on);
				const income = await on.categories.create({
					spaceId,
					name: "Rendimentos",
					kind: "income",
				});
				const broker = await on.accounts.create({ spaceId, kind: "investment", name: "XP" });
				const fund = await on.investments.create({
					spaceId,
					accountId: broker.id,
					name: "MXRF11",
					product: "realEstateFund",
					ticker: "MXRF11",
					quantity: 100 * SCALE,
					unitPrice: 1_000,
				});
				await on.investments.move({
					holdingId: fund.id,
					kind: "income",
					onDay: "2026-10-15",
					amount: 900,
					accountId: checkingId,
				});
				const [paid] = (await on.transactions.list({ spaceId })).filter(
					(one) => one.kind === "income",
				);
				expect(paid).toMatchObject({ amount: 900, categoryId: income.id, heldBy: fund.id });
				// Income is not money put in: the holding is worth what it was.
				expect((await on.investments.get(fund.id)).value).toBe(100_000);
			} finally {
				await fixture.close();
			}
		});
	});

	describe("what an investment account is worth", () => {
		it("is what its holdings are worth, as before", async () => {
			// Opened with R$ 50.000,00, holdings worth that, which cost R$ 45.000,00.
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				const today = todayIn("America/Sao_Paulo");
				const space = await on.spaces.create({ name: "Casa" });
				const broker = await on.accounts.create({
					spaceId: space.id,
					kind: "investment",
					name: "Corretora",
					initialBalance: 5_000_000,
				});
				await on.investments.create({
					spaceId: space.id,
					accountId: broker.id,
					name: "Fundo",
					kind: "fund",
					quantity: SCALE,
					unitPrice: 5_000_000,
					cost: 4_500_000,
				});
				expect(await youHave(on, space.id, today)).toBe(5_000_000);
			} finally {
				await fixture.close();
			}
		});

		it("adds a new caixinha to a holding from 1.x, and not to the money that bought it", async () => {
			// A holding of R$ 4.800,00 that cost R$ 4.500,00, in an account that received R$ 4.500,00.
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				const today = todayIn("America/Sao_Paulo");
				const { spaceId, checkingId } = await aHousehold(on);
				const broker = await on.accounts.create({ spaceId, kind: "investment", name: "Nubank" });
				await on.transactions.create({
					spaceId,
					kind: "transfer",
					amount: 450_000,
					happenedOn: "2026-01-10",
					description: "Aporte",
					accountId: checkingId,
					counterAccountId: broker.id,
				});
				await on.investments.create({
					spaceId,
					accountId: broker.id,
					name: "CDB antigo",
					kind: "fixedIncome",
					quantity: SCALE,
					unitPrice: 480_000,
					cost: 450_000,
				});
				await on.investments.create({
					spaceId,
					accountId: broker.id,
					name: "Viagem",
					product: "box",
					rate: 10_000,
					quantity: SCALE,
					unitPrice: 50_000,
					boughtOn: today,
					fromAccountId: checkingId,
				});
				const worth = worthByAccount(await on.investments.list(spaceId));
				expect(worth[broker.id]).toBe(530_000);
			} finally {
				await fixture.close();
			}
		});

		it("keeps the balance of an account with no holding as Saldo na conta", async () => {
			// R$ 3.000,00 in a broker with nothing in it, and a share of R$ 1.000,00 written down there.
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				const today = todayIn("America/Sao_Paulo");
				const space = await on.spaces.create({ name: "Casa" });
				const broker = await on.accounts.create({
					spaceId: space.id,
					kind: "investment",
					name: "Corretora",
					initialBalance: 300_000,
				});
				await on.investments.create({
					spaceId: space.id,
					accountId: broker.id,
					name: "ITUB4",
					product: "stock",
					ticker: "ITUB4",
					quantity: 25 * SCALE,
					unitPrice: 4_000,
					keepBalanceAsCash: true,
				});
				expect(await youHave(on, space.id, today)).toBe(400_000);
				const names = (await on.investments.list(space.id)).map((one) => one.product);
				expect(names.sort()).toEqual(["brokerCash", "stock"]);
			} finally {
				await fixture.close();
			}
		});

		it("refuses a new holding outside an investment account", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				const { spaceId, checkingId } = await aHousehold(on);
				await expect(
					on.investments.create({
						spaceId,
						accountId: checkingId,
						name: "Caixinha",
						product: "box",
						quantity: SCALE,
						unitPrice: 10_000,
					}),
				).rejects.toMatchObject({ rule: "holdingNeedsAnInvestmentAccount" });
			} finally {
				await fixture.close();
			}
		});
	});

	describe("where a holding counts", () => {
		it("gives a goal on one caixinha what that caixinha is worth, and nothing of the other", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				const today = todayIn("America/Sao_Paulo");
				const space = await on.spaces.create({ name: "Casa" });
				const broker = await on.accounts.create({
					spaceId: space.id,
					kind: "investment",
					name: "Nubank",
				});
				const box = (name: string, value: number) =>
					on.investments.create({
						spaceId: space.id,
						accountId: broker.id,
						name,
						product: "box",
						rate: 10_000,
						quantity: SCALE,
						unitPrice: value,
					});
				const trip = await box("Viagem", 201_524);
				await box("Reserva", 1_000_000);
				const goal = await on.goals.create({
					spaceId: space.id,
					name: "Viagem",
					targetAmount: 500_000,
					accountId: broker.id,
					holdingId: trip.id,
				});
				const [progress] = await on.goals.progress({ spaceId: space.id, today });
				expect(progress?.id).toBe(goal.id);
				expect(progress?.saved).toBe(201_524);
			} finally {
				await fixture.close();
			}
		});

		it("leaves what is left to spend where it was when the rule's money goes into the caixinha", async () => {
			// R$ 5.000,00 in the current account and a rule of R$ 500,00 into the caixinha.
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				const today = todayIn("America/Sao_Paulo");
				const space = await on.spaces.create({ name: "Casa" });
				const checking = await on.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Corrente",
					initialBalance: 500_000,
				});
				const broker = await on.accounts.create({
					spaceId: space.id,
					kind: "investment",
					name: "Nubank",
				});
				const box = await on.investments.create({
					spaceId: space.id,
					accountId: broker.id,
					name: "Reserva",
					product: "box",
					rate: 10_000,
					quantity: SCALE,
					unitPrice: 100_000,
				});
				await on.goals.setRule({
					spaceId: space.id,
					mode: "fixed",
					value: 50_000,
					accountId: broker.id,
					holdingId: box.id,
				});
				const leftToSpend = async () => {
					const accounts = await on.accounts.list(space.id);
					const balances = await on.transactions.balances(space.id, today);
					const savings = await on.goals.savings({ spaceId: space.id, month: today.slice(0, 7) });
					const spendable = spendableNow({
						accounts: accounts.map((account) => ({ id: account.id, kind: account.kind })),
						balances: balances.map((one) => ({ accountId: one.accountId, settled: one.settled })),
					});
					return spendable - Math.max(0, savings.expected - savings.put);
				};
				expect(await leftToSpend()).toBe(450_000);
				await on.investments.move({
					holdingId: box.id,
					kind: "in",
					onDay: today,
					amount: 50_000,
					accountId: checking.id,
				});
				expect(await leftToSpend()).toBe(450_000);
			} finally {
				await fixture.close();
			}
		});

		it("earns nothing in the months projected, so putting money in changes no month", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				const today = todayIn("America/Sao_Paulo");
				const { spaceId, checkingId } = await aHousehold(on);
				const broker = await on.accounts.create({ spaceId, kind: "investment", name: "Nubank" });
				const box = await on.investments.create({
					spaceId,
					accountId: broker.id,
					name: "Reserva",
					product: "box",
					rate: 10_000,
					quantity: SCALE,
					unitPrice: 100_000,
				});
				const ahead = () =>
					on.projections.monthsAhead({
						spaceId,
						from: today.slice(0, 7),
						months: 3,
						today,
					});
				const before = await ahead();
				await on.investments.move({
					holdingId: box.id,
					kind: "in",
					onDay: today,
					amount: 50_000,
					accountId: checkingId,
				});
				const after = await ahead();
				expect(after.opening).toBe(before.opening);
				expect(after.months.map((month) => month.balance)).toEqual(
					before.months.map((month) => month.balance),
				);
			} finally {
				await fixture.close();
			}
		});
	});

	describe("a holding with the day it was bought", () => {
		// The first price was dated the day it was written down, so a share bought in August read
		// the month of September at the price of the day somebody typed it, in October.
		it("keeps the price it was written down with on the day it was bought", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				const space = await on.spaces.create({ name: "Casa" });
				const broker = await on.accounts.create({
					spaceId: space.id,
					kind: "investment",
					name: "Corretora",
				});
				const share = await on.investments.create({
					spaceId: space.id,
					accountId: broker.id,
					name: "ITSA4",
					product: "stock",
					ticker: "ITSA4",
					quantity: 10 * SCALE,
					unitPrice: 3_000,
					boughtOn: "2026-08-10",
				});
				expect((await on.investments.prices(share.id)).map((one) => one.onDay)).toEqual([
					"2026-08-10",
				]);
				const [then] = await on.investments.list(space.id, { onDay: "2026-09-30" });
				expect(then).toMatchObject({ value: 30_000, pricedOn: "2026-08-10" });
			} finally {
				await fixture.close();
			}
		});
	});

	describe("against the CDI, and in a backup", () => {
		it("puts the same deposits at the CDI from their own days, and leaves out a holding with none", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				await saveIndexDays(fixture.driver, "cdiDaily", [
					{ day: "2026-09-28", rate: 5_078_800 },
					{ day: "2026-09-29", rate: 5_078_800 },
					{ day: "2026-09-30", rate: 5_078_800 },
				]);
				const space = await on.spaces.create({ name: "Casa" });
				const broker = await on.accounts.create({
					spaceId: space.id,
					kind: "investment",
					name: "Nubank",
				});
				const box = await on.investments.create({
					spaceId: space.id,
					accountId: broker.id,
					name: "Reserva",
					product: "box",
					rate: 11_000,
					quantity: SCALE,
					unitPrice: 1_000_000,
					boughtOn: "2026-09-28",
				});
				// R$ 10.000,00 at 110% of the CDI, and the same at 100%.
				expect(box.value).toBe(1_001_677);
				expect(box.estimatedThrough).toBe("2026-09-30");
				expect(box.atTheCdi).toBe(1_001_524);
				expect(box.atTheCdiThrough).toBe("2026-09-30");
				const old = await on.investments.create({
					spaceId: space.id,
					accountId: broker.id,
					name: "Fundo antigo",
					kind: "fund",
					quantity: SCALE,
					unitPrice: 500_000,
				});
				expect(old.atTheCdi).toBeNull();
				expect(old.atTheCdiThrough).toBeNull();
			} finally {
				await fixture.close();
			}
		});

		it("carries the movements in a backup, and shows the last value typed without indices", async () => {
			const fixture = await prepare(adapter);
			const driver = adapter.openAnother
				? await adapter.openAnother("holdingsRestored")
				: await adapter.open();
			const onThe28th = () => Date.parse("2026-10-28T12:00:00-03:00");
			try {
				const on = await openSession({
					driver: fixture.driver,
					userId: fixture.ana.id,
					deviceId: "deviceAna28",
					now: onThe28th,
				});
				const { spaceId, checkingId } = await aHousehold(on);
				const broker = await on.accounts.create({ spaceId, kind: "investment", name: "Nubank" });
				const box = await on.investments.create({
					spaceId,
					accountId: broker.id,
					name: "Reserva",
					product: "box",
					rate: 10_000,
					quantity: SCALE,
					unitPrice: 300_000,
				});
				await on.investments.move({
					holdingId: box.id,
					kind: "in",
					onDay: "2026-10-01",
					amount: 50_000,
					accountId: checkingId,
				});
				// The value of the statement, typed later the same day.
				await on.investments.price({ id: box.id, unitPrice: 362_000, onDay: "2026-10-28" });
				const backup = await on.backup.exportSpace(spaceId);
				expect(backup.spaces[0]?.tables.holding_moves).toHaveLength(1);

				await migrate(driver);
				await applyPeople(driver, [
					{
						id: fixture.ana.id,
						email: fixture.ana.email,
						name: fixture.ana.name,
						image: fixture.ana.image,
						createdAt: fixture.ana.createdAt,
						updatedAt: fixture.ana.updatedAt,
					},
				]);
				const there = await openSession({
					driver,
					userId: fixture.ana.id,
					deviceId: "restored",
					now: onThe28th,
				});
				await there.backup.restore(backup);
				await there.refresh();
				const [restored] = await there.investments.list(spaceId);
				expect(restored?.value).toBe(362_000);
				expect(await there.investments.moves(box.id)).toHaveLength(1);
			} finally {
				await driver.close();
				await fixture.close();
			}
		});
	});

	describe("the price of a holding", () => {
		it("keeps the newest price when an older day is typed after it", async () => {
			const fixture = await prepare(adapter);
			try {
				// Written down on the first of September.
				const on = await openSession({
					driver: fixture.driver,
					userId: fixture.ana.id,
					deviceId: "deviceAnaSeptember",
					now: () => Date.parse("2026-09-01T12:00:00-03:00"),
				});
				const space = await on.spaces.create({ name: "Casa" });
				const broker = await on.accounts.create({
					spaceId: space.id,
					kind: "investment",
					name: "Corretora",
				});
				const share = await on.investments.create({
					spaceId: space.id,
					accountId: broker.id,
					name: "PETR4",
					product: "stock",
					ticker: "PETR4",
					quantity: SCALE,
					unitPrice: 10_000,
					boughtOn: "2026-08-01",
				});
				// And priced later, on the twenty eighth of October.
				const later = await openSession({
					driver: fixture.driver,
					userId: fixture.ana.id,
					deviceId: "deviceAnaOctober",
					now: () => Date.parse("2026-10-28T12:00:00-03:00"),
				});
				await later.investments.price({ id: share.id, unitPrice: 12_000, onDay: "2026-09-30" });
				const after = await later.investments.price({
					id: share.id,
					unitPrice: 11_000,
					onDay: "2026-08-31",
				});
				expect(after.unitPrice).toBe(12_000);
				expect(after.pricedOn).toBe("2026-09-30");
				// The price it was written down with is dated the day it was bought.
				expect((await on.investments.prices(share.id)).map((one) => one.onDay)).toEqual([
					"2026-08-01",
					"2026-08-31",
					"2026-09-30",
				]);
			} finally {
				await fixture.close();
			}
		});
	});
}
