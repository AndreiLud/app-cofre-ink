// What the figures have to say, gathered from a real database, on every adapter.
//
// The arithmetic is proved in `packages/core` against a snapshot written by hand. What
// is proved here is the other half, which no unit test can reach: that the snapshot
// this layer gathers is the one the person's own records add up to, and that somebody
// who is not a member of the space is told nothing at all.

import { describe, expect, it } from "vitest";
import { NotFoundError } from "../errors.ts";
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

		it("tells somebody who is not in the space that there is no such space", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				// Not a refusal, which would confirm that the space exists. The same rule
				// every other read in this layer follows.
				await expect(
					fixture.asJoao.advice.findings({ spaceId: space.id, today: TODAY }),
				).rejects.toBeInstanceOf(NotFoundError);
			} finally {
				await fixture.close();
			}
		});
	});
}
