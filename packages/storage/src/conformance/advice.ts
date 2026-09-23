// What the figures have to say, gathered from a real database, on every adapter.
//
// The arithmetic is proved in `packages/core` against a snapshot written by hand. What
// is proved here is the other half, which no unit test can reach: that the snapshot
// this layer gathers is the one the person's own records add up to, and that somebody
// who is not a member of the space is told nothing at all.

import { describe, expect, it } from "vitest";
import { NotFoundError } from "../errors.ts";
import { saveIndexRates } from "../repositories/indices.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

const TODAY = "2026-09-20";

export function runAdviceConformance(adapter: AdapterUnderTest): void {
	describe("what the figures have to say", () => {
		it("reads the months behind and finds a category above its usual", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
					initialBalance: 500_000,
				});
				const eating = await fixture.asAna.categories.create({
					spaceId: space.id,
					name: "Restaurante",
					kind: "expense",
				});

				// Three months behind at twenty thousand, and this month at ninety.
				for (const month of ["2026-06", "2026-07", "2026-08"]) {
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "income",
						amount: 600_000,
						happenedOn: `${month}-05`,
						description: "Salario",
						accountId: account.id,
					});
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 20_000,
						happenedOn: `${month}-12`,
						description: "Almoco",
						accountId: account.id,
						categoryId: eating.id,
					});
				}
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 90_000,
					happenedOn: "2026-09-12",
					description: "Jantar",
					accountId: account.id,
					categoryId: eating.id,
				});

				const snapshot = await fixture.asAna.advice.snapshot({ spaceId: space.id, today: TODAY });
				expect(snapshot.before).toHaveLength(3);
				expect(snapshot.thisMonth.expense).toBe(90_000);

				const found = await fixture.asAna.advice.findings({ spaceId: space.id, today: TODAY });
				const category = found.find((one) => one.code === "categoryAboveUsual");
				expect(category?.subject).toBe("Restaurante");
				expect(category?.amounts.usual).toBe(20_000);
				expect(category?.amounts.difference).toBe(70_000);
			} finally {
				await fixture.close();
			}
		});

		it("counts money on hand without counting what is put aside as cash", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
					initialBalance: 300_000,
				});
				await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "investment",
					name: "Corretora",
					initialBalance: 5_000_000,
				});

				const snapshot = await fixture.asAna.advice.snapshot({ spaceId: space.id, today: TODAY });
				expect(snapshot.onHand).toBe(300_000);
			} finally {
				await fixture.close();
			}
		});

		it("finds what repeats every month, and says nothing about two coffees", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});

				for (const month of ["2026-07", "2026-08", "2026-09"]) {
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 2_790,
						happenedOn: `${month}-15`,
						description: "Streaming",
						accountId: account.id,
					});
				}
				// The same amount twice in one month is not something that repeats.
				for (const day of ["2026-09-03", "2026-09-04"]) {
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 800,
						happenedOn: day,
						description: "Cafe",
						accountId: account.id,
					});
				}

				const snapshot = await fixture.asAna.advice.snapshot({ spaceId: space.id, today: TODAY });
				expect(snapshot.repeating.map((one) => one.description)).toEqual(["streaming"]);
				expect(snapshot.repeating[0]?.occurrences).toBe(3);
			} finally {
				await fixture.close();
			}
		});

		it("spots the same charge twice, a day apart, in the same account", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});

				// Written newest first, which is what quick entry does when somebody
				// writes today's charge and then remembers yesterday's.
				for (const day of ["2026-09-15", "2026-09-14"]) {
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 18_990,
						happenedOn: day,
						description: "Mercado do bairro",
						accountId: account.id,
					});
				}

				const snapshot = await fixture.asAna.advice.snapshot({ spaceId: space.id, today: TODAY });
				expect(snapshot.possibleRepeats).toHaveLength(1);
				expect(snapshot.possibleRepeats[0]?.amount).toBe(18_990);
			} finally {
				await fixture.close();
			}
		});

		it("reads the four signs out of what is actually written down", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
					initialBalance: 500_000,
				});

				// Six thousand in and four thousand out, three months running. The expense
				// is described differently each month on purpose, so that none of it counts
				// as a thing that repeats and the fourth sign stays out of the way.
				for (const month of ["2026-06", "2026-07", "2026-08"]) {
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "income",
						amount: 600_000,
						happenedOn: `${month}-05`,
						description: "Salario",
						accountId: account.id,
					});
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 400_000,
						happenedOn: `${month}-12`,
						description: `Gastos de ${month}`,
						accountId: account.id,
					});
				}

				const reading = await fixture.asAna.advice.reading({ spaceId: space.id, today: TODAY });
				expect(reading.monthsRead).toBe(3);

				const signs = new Map(reading.signs.map((sign) => [sign.code, sign]));
				// A third of what comes in is left over.
				expect(signs.get("savingRate")?.value).toBe(33);
				expect(signs.get("savingRate")?.state).toBe("good");

				// Five hundred to start plus six hundred kept is eleven thousand on hand,
				// which is two months and three quarters of ordinary spending.
				expect(signs.get("reserve")?.amounts.onHand).toBe(1_100_000);
				expect(signs.get("reserve")?.value).toBe(28);
				expect(signs.get("reserve")?.state).toBe("fair");

				expect(signs.get("committed")?.state).toBe("good");
				expect(signs.get("repeatingLoad")?.amounts.count).toBe(0);

				// Nothing poor, and one thing not yet good.
				expect(reading.verdict).toBe("steady");
			} finally {
				await fixture.close();
			}
		});

		it("turns a goal into a step with a month on it, and does not call it stalled", async () => {
			const fixture = await prepare(adapter);
			try {
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
					name: "Reserva",
				});

				for (const month of ["2026-06", "2026-07", "2026-08"]) {
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "income",
						amount: 600_000,
						happenedOn: `${month}-05`,
						description: "Salario",
						accountId: account.id,
					});
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 400_000,
						happenedOn: `${month}-12`,
						description: `Gastos de ${month}`,
						accountId: account.id,
					});
				}

				await fixture.asAna.goals.create({
					spaceId: space.id,
					name: "Viagem",
					targetAmount: 600_000,
					accountId: savings.id,
				});

				const reading = await fixture.asAna.advice.reading({ spaceId: space.id, today: TODAY });

				// Two hundred a month left over, so three months of cover comes first and
				// the goal queues behind it.
				expect(reading.plan.surplus).toBe(200_000);
				expect(reading.plan.steps.map((step) => step.code)).toEqual(["reserve", "goal"]);

				const goal = reading.plan.steps[1];
				expect(goal?.subject).toBe("Viagem");
				expect(goal?.amount).toBe(600_000);
				expect(goal?.months).toBe(3);

				// It was made a moment ago and has never been fed, which is not stalled.
				expect(reading.findings.map((one) => one.code)).not.toContain("goalStalled");
			} finally {
				await fixture.close();
			}
		});

		/**
		 * The balance from before is the only figure on the check up that cannot be read
		 * out of the records: they hold what somebody has now. So it is walked backwards
		 * through every movement, and a transfer is a movement even though nothing was
		 * spent.
		 */
		it("reads a balance from before by undoing what moved, transfers and all", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
					initialBalance: 100_000,
				});
				const broker = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "investment",
					name: "Corretora",
				});

				// Six closed months, which is what the comparison needs, and a transfer
				// out to the broker in the middle of the recent window.
				for (const month of ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]) {
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "income",
						amount: 600_000,
						happenedOn: `${month}-05`,
						description: "Salario",
						accountId: account.id,
					});
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 400_000,
						happenedOn: `${month}-12`,
						description: `Gastos de ${month}`,
						accountId: account.id,
					});
				}
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "transfer",
					amount: 500_000,
					happenedOn: "2026-07-20",
					description: "Para a corretora",
					accountId: account.id,
					counterAccountId: broker.id,
				});

				const reading = await fixture.asAna.advice.reading({ spaceId: space.id, today: TODAY });
				const trend = reading.trend;
				expect(trend?.since).toBe("2026-06");

				// The end of May: what they started with plus three months of two hundred
				// kept. Since then they kept six hundred more and moved five of it to the
				// broker, which is a hundred more on hand and not six.
				const onHand = trend?.movements.find((one) => one.code === "onHand");
				expect(onHand?.before).toBe(700_000);
				expect(onHand?.now).toBe(800_000);
				expect(onHand?.difference).toBe(100_000);
			} finally {
				await fixture.close();
			}
		});

		it("adds up the invoices behind and the instalments still to come", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				const card = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "credit",
					name: "Cartao",
					closingDay: 28,
					dueDay: 5,
					creditLimit: 5_000_000,
				});

				// Two closed invoices behind, and a purchase in six parts ahead.
				for (const month of ["2026-07", "2026-08"]) {
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 30_000,
						happenedOn: `${month}-10`,
						description: "Compra",
						accountId: card.id,
					});
				}
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 120_000,
					happenedOn: "2026-09-10",
					description: "Geladeira",
					accountId: card.id,
					installments: 6,
				});

				const card_ = (await fixture.asAna.advice.reading({ spaceId: space.id, today: TODAY }))
					.commitments;

				expect(card_?.usual).toBe(30_000);
				// The first part falls this month and is already behind today, so five of
				// the six are still ahead.
				expect(card_?.ahead).toHaveLength(5);
				expect(card_?.aheadTotal).toBe(100_000);
				expect(card_?.lastMonth).toBe("2027-02");
			} finally {
				await fixture.close();
			}
		});

		it("reads where the money comes from, and what would be left without the biggest", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
					initialBalance: 900_000,
				});

				for (const month of ["2026-06", "2026-07", "2026-08"]) {
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "income",
						amount: 600_000,
						happenedOn: `${month}-05`,
						description: "Salario",
						accountId: account.id,
					});
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "income",
						amount: 200_000,
						happenedOn: `${month}-10`,
						description: "Aluguel",
						accountId: account.id,
					});
				}

				const exposure = (await fixture.asAna.advice.reading({ spaceId: space.id, today: TODAY }))
					.exposure;

				expect(exposure?.sources.map((one) => one.name)).toEqual(["salario", "aluguel"]);
				expect(exposure?.concentration).toBe(75);
				expect(exposure?.without).toBe(200_000);
			} finally {
				await fixture.close();
			}
		});

		/**
		 * The year ahead is the one question here that reads more than six months, and
		 * the six every median is made of are the first six of what it read.
		 */
		it("reads a year and a half of totals without moving what an ordinary month is", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});

				// Thirteen closed months, and one of them three times as dear.
				const months = [
					"2025-09",
					"2025-10",
					"2025-11",
					"2025-12",
					"2026-01",
					"2026-02",
					"2026-03",
					"2026-04",
					"2026-05",
					"2026-06",
					"2026-07",
					"2026-08",
				];
				for (const month of months) {
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: month === "2025-12" ? 900_000 : 300_000,
						happenedOn: `${month}-12`,
						description: `Gastos de ${month}`,
						accountId: account.id,
					});
				}

				const snapshot = await fixture.asAna.advice.snapshot({ spaceId: space.id, today: TODAY });
				expect(snapshot.longer).toHaveLength(12);
				expect(snapshot.before).toHaveLength(6);

				const season = (await fixture.asAna.advice.reading({ spaceId: space.id, today: TODAY }))
					.season;
				expect(season?.heavy.map((one) => one.was)).toEqual(["2025-12"]);
				expect(season?.heavy[0]?.next).toBe("2026-12");
			} finally {
				await fixture.close();
			}
		});

		it("says what a year of standing still costs, once the index is in the database", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
					initialBalance: 3_000_000,
				});

				for (const month of ["2026-06", "2026-07", "2026-08"]) {
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 300_000,
						happenedOn: `${month}-12`,
						description: `Gastos de ${month}`,
						accountId: account.id,
					});
				}

				// Twelve months of half a per cent, which compounds to a little over six.
				await saveIndexRates(
					fixture.driver,
					"ipca",
					Array.from({ length: 12 }, (_, index) => ({
						month: `2025-${String(index + 1).padStart(2, "0")}`,
						rate: 50,
					})),
				);

				const found = (
					await fixture.asAna.advice.findings({ spaceId: space.id, today: TODAY })
				).find((one) => one.code === "idleCash");

				// Half a per cent twelve times over is not six per cent, it is 6,17.
				expect(found?.amounts.inflation).toBe(617);
				// Twenty one thousand on hand, nine of it the three month reserve, so
				// twelve thousand sits still and loses that share of itself in a year.
				expect(found?.amounts.spare).toBe(1_200_000);
				expect(found?.amounts.losing).toBe(74_040);
			} finally {
				await fixture.close();
			}
		});

		it("tells somebody who is not in the space that there is no such space", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				// Not a refusal, which would confirm that the space exists. The same rule
				// every other read in this layer follows.
				await expect(
					fixture.asJoao.advice.findings({ spaceId: space.id, today: TODAY }),
				).rejects.toBeInstanceOf(NotFoundError);
				await expect(
					fixture.asJoao.advice.reading({ spaceId: space.id, today: TODAY }),
				).rejects.toBeInstanceOf(NotFoundError);
			} finally {
				await fixture.close();
			}
		});
	});
}
