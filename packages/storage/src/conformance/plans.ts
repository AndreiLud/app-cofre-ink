// Plans of up to forty eight parts, on every adapter. Part 2, section D of the request for 2.0.0.

import { describe, expect, it } from "vitest";
import { RuleError } from "../errors.ts";
import { migrate } from "../migrate.ts";
import { openSession } from "../session.ts";
import { applyPeople } from "../sync.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

/** A current account, a card that closes on the third and falls due on the tenth, and a voucher. */
async function ready(adapter: AdapterUnderTest) {
	const fixture = await prepare(adapter);
	const on = fixture.asAna;
	const space = await on.spaces.create({ name: "Pessoal", kind: "personal" });
	const checking = await on.accounts.create({
		spaceId: space.id,
		kind: "checking",
		name: "Conta corrente",
	});
	const card = await on.accounts.create({
		spaceId: space.id,
		kind: "credit",
		name: "Cartao",
		closingDay: 3,
		dueDay: 10,
		creditLimit: 1_000_000,
	});
	const voucher = await on.accounts.create({
		spaceId: space.id,
		kind: "voucher",
		name: "Vale",
		benefit: "meal",
		quotaAmount: 90_000,
		quotaDay: 5,
		quotaCarries: true,
	});
	return { fixture, on, spaceId: space.id, checking, card, voucher };
}

export function runPlanOfPartsConformance(adapter: AdapterUnderTest): void {
	describe("plans of parts", () => {
		// D.1.5: refused before anything is written, with a code of its own each.
		it("refuses forty nine parts, a part below a cent, money in and a voucher in parts", async () => {
			const setup = await ready(adapter);
			try {
				const { on, spaceId } = setup;
				const before = (await on.changes.list({ spaceId })).length;
				const attempt = (over: Record<string, unknown>) =>
					on.transactions.create({
						spaceId,
						kind: "expense",
						amount: 240_000,
						happenedOn: "2026-10-28",
						description: "Geladeira",
						accountId: setup.card.id,
						installments: 48,
						...over,
					});
				for (const [over, rule] of [
					[{ installments: 49 }, "tooManyInstallments"],
					[{ amount: 40 }, "partBelowOneCent"],
					[
						{ kind: "income", accountId: setup.checking.id, installments: 3 },
						"onlyExpensesGoInInstallments",
					],
					[{ accountId: setup.voucher.id, installments: 3 }, "benefitIsNotInInstallments"],
					[{ firstInstallment: 49 }, "firstInstallmentOutsidePlan"],
				] as const) {
					const refusal = await attempt(over).then(
						() => null,
						(error: unknown) => error,
					);
					expect(refusal).toBeInstanceOf(RuleError);
					expect(refusal).toMatchObject({ rule });
				}
				expect(await on.transactions.list({ spaceId })).toEqual([]);
				expect((await on.changes.list({ spaceId })).length).toBe(before);
			} finally {
				await setup.fixture.close();
			}
		});

		// D.3.4.1: from an anchor on the fifth part of ten, its invoice the one a statement said.
		it("writes a plan from the part after the ones paid, on the invoices after the anchor", async () => {
			const setup = await ready(adapter);
			try {
				const { on, spaceId } = setup;
				const written = await on.transactions.create({
					spaceId,
					kind: "expense",
					amount: 100_000,
					happenedOn: "2026-10-05",
					description: "Curso",
					accountId: setup.card.id,
					installments: 10,
					firstInstallment: 5,
					invoiceMonth: "2026-10",
				});
				expect(written.map((row) => [row.description, row.invoiceMonth, row.amount])).toEqual([
					["Curso 5/10", "2026-10", -10_000],
					["Curso 6/10", "2026-11", -10_000],
					["Curso 7/10", "2026-12", -10_000],
					["Curso 8/10", "2027-01", -10_000],
					["Curso 9/10", "2027-02", -10_000],
					["Curso 10/10", "2027-03", -10_000],
				]);
			} finally {
				await setup.fixture.close();
			}
		});

		// D.5.4: changing the category of the whole plan leaves the cents of each part as they were,
		// and an amount sent is the amount of each part.
		it("changes this part and the next without rewriting what each one is worth", async () => {
			const setup = await ready(adapter);
			try {
				const { on, spaceId } = setup;
				const [first] = await on.transactions.create({
					spaceId,
					kind: "expense",
					amount: 100_000,
					happenedOn: "2026-10-28",
					description: "Notebook",
					accountId: setup.card.id,
					installments: 48,
				});
				const category = await on.categories.create({ spaceId, name: "Casa", kind: "expense" });
				await on.transactions.updateFrom(first?.id ?? "", { categoryId: category.id });
				const parts = await on.transactions.list({ spaceId, limit: 100 });
				expect(parts.filter((row) => row.amount === -2_084)).toHaveLength(16);
				expect(parts.filter((row) => row.amount === -2_083)).toHaveLength(32);
				expect(parts.reduce((sum, row) => sum + row.amount, 0)).toBe(-100_000);

				await on.transactions.updateFrom(first?.id ?? "", { amount: 2_500 });
				const after = await on.transactions.list({ spaceId, limit: 100 });
				expect(after.every((row) => row.amount === -2_500)).toBe(true);
			} finally {
				await setup.fixture.close();
			}
		});

		// D.7: the check up stopped at twenty four months ahead.
		it("reads every part ahead in the check up, however far", async () => {
			const setup = await ready(adapter);
			try {
				const { on, spaceId } = setup;
				await on.transactions.create({
					spaceId,
					kind: "expense",
					amount: 240_000,
					happenedOn: "2026-10-28",
					description: "Geladeira",
					accountId: setup.card.id,
					installments: 48,
				});
				const snapshot = await on.advice.snapshot({ spaceId, today: "2026-10-28" });
				expect(snapshot.instalments).toHaveLength(47);
				expect(snapshot.instalments.reduce((sum, one) => sum + one.amount, 0)).toBe(235_000);
				expect(snapshot.instalments.at(-1)?.month).toBe("2030-09");
			} finally {
				await setup.fixture.close();
			}
		});

		// D.8: the months ahead stop at thirty six, and what the card still charges after them
		// was skipped with nothing said. From October 2026, the last month read is September 2029.
		it("says what the parts still charge after the months ahead, and until when", async () => {
			const setup = await ready(adapter);
			try {
				const { on, spaceId } = setup;
				await on.transactions.create({
					spaceId,
					kind: "expense",
					amount: 240_000,
					happenedOn: "2026-10-28",
					description: "Geladeira",
					accountId: setup.card.id,
					installments: 48,
				});
				const ahead = await on.projections.monthsAhead({
					spaceId,
					from: "2026-10",
					months: 36,
					today: "2026-10-28",
				});
				expect(ahead.months.at(-1)?.month).toBe("2029-09");
				expect(ahead.after).toEqual({ amount: 65_000, last: "2030-10" });
			} finally {
				await setup.fixture.close();
			}
		});

		// Found reviewing the pictures of 2.0.0: the file of September, which says its figures are as
		// they stood on the thirtieth, said R$ 120,00 in parts were still to come until April 2027,
		// from a chair bought on the seventeenth of October. As it stood, a plan counts once its
		// first part had come, which is what the cards of that file already read (registry 0062).
		it("reads the months ahead of a day that has gone without a plan bought after it", async () => {
			const setup = await ready(adapter);
			try {
				const { on, spaceId } = setup;
				for (const [description, amount, happenedOn] of [
					["Sofá", 60_000, "2026-09-15"],
					["Cadeira", 72_000, "2026-10-17"],
				] as const) {
					await on.transactions.create({
						spaceId,
						kind: "expense",
						amount,
						happenedOn,
						description,
						accountId: setup.card.id,
						installments: 6,
					});
				}
				const read = (asItStood: boolean) =>
					on.projections.monthsAhead({
						spaceId,
						from: "2026-10",
						months: 6,
						today: "2026-09-30",
						asItStood,
					});

				// The sofa's six parts fall due from the tenth of October to the tenth of March, all
				// inside the six months. The chair's fall due from November to April, the last one
				// after them.
				const now = await read(false);
				expect(now.after).toEqual({ amount: 12_000, last: "2027-04" });
				expect(now.months.map((month) => month.expenseFrom.written)).toEqual([
					10_000, 22_000, 22_000, 22_000, 22_000, 22_000,
				]);

				// As it stood on the thirtieth, the sofa is there and the chair is not.
				const stood = await read(true);
				expect(stood.after).toBeNull();
				expect(stood.months.map((month) => month.expenseFrom.written)).toEqual([
					10_000, 10_000, 10_000, 10_000, 10_000, 10_000,
				]);
			} finally {
				await setup.fixture.close();
			}
		});

		// D.6: converted part by part, US$ 1.000,00 in forty eight at 5,4321 came to R$ 5.432,00.
		it("converts a plan in another currency once, so it adds up", async () => {
			const setup = await ready(adapter);
			try {
				const { on, spaceId } = setup;
				await on.transactions.create({
					spaceId,
					kind: "expense",
					amount: 100_000,
					currency: "USD",
					fxRate: 543_210_000,
					happenedOn: "2026-10-28",
					description: "Curso no exterior",
					accountId: setup.card.id,
					installments: 48,
				});
				const parts = await on.transactions.list({ spaceId, limit: 100 });
				expect(parts.reduce((sum, row) => sum + row.amountInBase, 0)).toBe(-543_210);
			} finally {
				await setup.fixture.close();
			}
		});

		// D.9: dividing one part divided only that part, and the balance between people counted
		// every division whatever the day of its record.
		it("divides the whole plan from one part, and owes each part from its day", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				const house = await on.spaces.create({ name: "Casa" });
				await on.members.invite({ spaceId: house.id, userId: fixture.joao.id, role: "editor" });
				await fixture.asJoao.members.accept(house.id);
				const card = await on.accounts.create({
					spaceId: house.id,
					kind: "credit",
					name: "Cartao",
					closingDay: 3,
					dueDay: 10,
					creditLimit: 1_000_000,
				});
				const parts = await on.transactions.create({
					spaceId: house.id,
					kind: "expense",
					amount: 240_000,
					happenedOn: "2026-10-28",
					description: "Geladeira",
					accountId: card.id,
					installments: 48,
				});
				const sharesOfThePlan = async () =>
					(await Promise.all(parts.map((part) => on.sharing.splitsOf(part.id)))).flat();

				await on.sharing.split({ transactionId: parts[5]?.id ?? "", method: "evenly" });
				expect(await sharesOfThePlan()).toHaveLength(96);

				const owedOn = async (day: string) => {
					const then = await openSession({
						driver: fixture.driver,
						userId: fixture.ana.id,
						deviceId: `ana${day}`,
						now: () => Date.parse(`${day}T15:00:00Z`),
					});
					const balances = await then.sharing.balances(house.id);
					return balances.find((one) => one.userId === fixture.joao.id)?.amount;
				};
				expect(await owedOn("2026-10-28")).toBe(-2_500);
				expect(await owedOn("2026-11-28")).toBe(-5_000);

				await on.sharing.clearSplit(parts[47]?.id ?? "");
				expect(await sharesOfThePlan()).toEqual([]);
			} finally {
				await fixture.close();
			}
		});

		// D.1.2 and D.1.5: a plan of sixty parts, which 1.2.1 could write, comes back whole from a
		// backup, and its tenth part can still be changed with the ones after it.
		it("restores a plan of sixty parts written before the ceiling, and edits it", async () => {
			const setup = await ready(adapter);
			const driver = adapter.openAnother
				? await adapter.openAnother("plansRestore")
				: await adapter.open();
			try {
				const { on, spaceId } = setup;
				await on.transactions.create({
					spaceId,
					kind: "expense",
					amount: 60_000,
					happenedOn: "2026-10-28",
					description: "Sofa",
					accountId: setup.card.id,
					installments: 2,
				});
				const backup = await on.backup.exportSpace(spaceId);
				const rows = backup.spaces[0]?.tables.transactions ?? [];
				const [model] = rows;
				// What 1.2.1 wrote: sixty parts of R$ 10,00.
				const sixty = Array.from({ length: 60 }, (_unused, index) => ({
					...model,
					id: `01890000-0000-7000-8000-${String(index + 1).padStart(12, "0")}`,
					amount: -1_000,
					amount_in_base: -1_000,
					description: `Sofa ${index + 1}/60`,
					installment_number: index + 1,
					installment_count: 60,
				}));
				rows.splice(0, rows.length, ...sixty);

				await migrate(driver);
				const ana = setup.fixture.ana;
				await applyPeople(driver, [
					{
						id: ana.id,
						email: ana.email,
						name: ana.name,
						image: ana.image,
						createdAt: ana.createdAt,
						updatedAt: ana.updatedAt,
					},
				]);
				const elsewhere = await openSession({ driver, userId: ana.id, deviceId: "plansRestore" });
				await elsewhere.backup.restore(backup);
				await elsewhere.refresh();
				const restored = await elsewhere.transactions.list({ spaceId, limit: 100 });
				expect(restored).toHaveLength(60);
				const tenth = restored.find((row) => row.installmentNumber === 10);
				expect(await elsewhere.transactions.updateFrom(tenth?.id ?? "", { notes: "Loja" })).toBe(
					51,
				);
			} finally {
				await driver.close();
				await setup.fixture.close();
			}
		});
	});
}
