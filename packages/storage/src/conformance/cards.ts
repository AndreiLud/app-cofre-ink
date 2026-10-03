// Cards, on every adapter.
//
// What is checked here is the one thing a card can get wrong in a way nobody notices:
// reaching an account it has no business reaching. A purchase written against the meal
// voucher but stamped with the credit card would land on an invoice that never charged
// it, and every screen that adds up a card would be adding up a story. So each rule is
// checked from the outside, through the repository, exactly as a screen would hit it.

import { todayIn } from "@cofre/core";
import { describe, expect, it } from "vitest";
import { NotFoundError, RuleError } from "../errors.ts";
import { migrate } from "../migrate.ts";
import { openSession } from "../session.ts";
import { type AdapterUnderTest, LATER, prepare } from "./setup.ts";

export function runCardConformance(adapter: AdapterUnderTest): void {
	describe("benefit accounts", () => {
		it("works out what is left from the allowance, because nothing is written when it lands", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const voucher = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale refeicao",
					benefit: "meal",
					quotaAmount: 90_000,
					quotaDay: 5,
					quotaCarries: true,
				});
				// What a release before this one left on the card. A new one is written down
				// empty, because what is on a benefit card is worked out from the allowance,
				// and correcting the number is still allowed for exactly this: it is the
				// starting point of everything that has carried.
				await fixture.asAna.accounts.update(voucher.id, { initialBalance: 64_500 });

				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4_500,
					happenedOn: todayIn("America/Sao_Paulo"),
					description: "Almoco",
					accountId: voucher.id,
				});

				const state = await fixture.asAna.accounts.benefitLeft(
					voucher.id,
					todayIn("America/Sao_Paulo"),
				);
				// Written down today, so no allowance has landed since: what was typed, less
				// the lunch. The card being credited is not a record anybody wrote.
				expect(state?.landed).toBe(0);
				expect(state?.left).toBe(60_000);
				expect(state?.quota).toBe(90_000);
			} finally {
				await fixture.close();
			}
		});

		// Part 1, B.1 of the request for 2.0.0, with its numbers: a card written down on the
		// twenty eighth, credited on the fifth, and a lunch of 56 on the twenty fourth. The
		// landing of the fifth counted and the lunch, before the card was written down, did
		// not, so the card said 900 of 900.
		it("counts a lunch from earlier in the period the card was written down in", async () => {
			const fixture = await prepare(adapter);
			try {
				const onThe28th = await openSession({
					driver: fixture.driver,
					userId: fixture.ana.id,
					deviceId: "deviceAna",
					now: () => Date.parse("2026-10-28T12:00:00-03:00"),
				});
				const space = await onThe28th.spaces.create({ name: "Pessoal", kind: "personal" });
				const voucher = await onThe28th.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale refeicao",
					benefit: "meal",
					quotaAmount: 90_000,
					quotaDay: 5,
					quotaCarries: true,
				});
				await onThe28th.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 5_600,
					happenedOn: "2026-10-24",
					description: "Almoco",
					accountId: voucher.id,
				});

				expect((await onThe28th.accounts.benefitLeft(voucher.id, "2026-10-28"))?.left).toBe(84_400);
				// And after the next landing, on a card that carries.
				expect((await onThe28th.accounts.benefitLeft(voucher.id, "2026-11-05"))?.left).toBe(
					174_400,
				);
			} finally {
				await fixture.close();
			}
		});

		// Part 1, B.3 of the request for 2.0.0, decision 4: ten landings of 900 and then a
		// raise to 1,000. The allowance was multiplied by every landing since the card was
		// written down, so the raise added 1,000 at once and rewrote ten months of income.
		it("changes an allowance from its next landing, and leaves what landed alone", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = (day: string) =>
					openSession({
						driver: fixture.driver,
						userId: fixture.ana.id,
						deviceId: "deviceAna",
						now: () => Date.parse(`${day}T12:00:00-03:00`),
					});
				const january = await on("2026-01-06");
				const space = await january.spaces.create({ name: "Pessoal", kind: "personal" });
				const voucher = await january.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale refeicao",
					benefit: "meal",
					quotaAmount: 90_000,
					quotaDay: 5,
					quotaCarries: true,
				});

				// January to October: ten landings of 900.
				const october = await on("2026-10-06");
				const left = async (day: string) =>
					(await october.accounts.benefitLeft(voucher.id, day))?.left;
				expect(await left("2026-10-06")).toBe(900_000);

				await october.accounts.update(voucher.id, { quotaAmount: 100_000 });
				// Nothing changes until the next landing, and then it lands at 1,000.
				expect(await left("2026-10-06")).toBe(900_000);
				expect(await left("2026-11-04")).toBe(900_000);
				expect(await left("2026-11-05")).toBe(1_000_000);

				// A month already closed keeps the 900 it had.
				const september = await october.reports.totals({
					spaceId: space.id,
					from: "2026-09-01",
					to: "2026-09-30",
				});
				expect(september.benefits).toBe(90_000);

				// And the account keeps the version it replaced, with the day the new one starts.
				const account = await october.accounts.get(voucher.id);
				expect(account.quotaSince).toBe("2026-11-05");
				expect(account.quotaBefore).toEqual([
					{ amount: 90_000, day: 5, carries: true, since: null },
				]);
			} finally {
				await fixture.close();
			}
		});

		// Part 1, B.4 of the request for 2.0.0, decision 3: how much is on a card that carries,
		// today, kept with the day it was said. Counting starts there: a lunch from before is
		// inside the figure, and one after it comes off.
		it("counts from what somebody said was on the card, on the day they said it", async () => {
			const fixture = await prepare(adapter);
			try {
				const on20th = await openSession({
					driver: fixture.driver,
					userId: fixture.ana.id,
					deviceId: "deviceAna",
					now: () => Date.parse("2026-10-20T12:00:00-03:00"),
				});
				const space = await on20th.spaces.create({ name: "Pessoal", kind: "personal" });
				const voucher = await on20th.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale refeicao",
					benefit: "meal",
					quotaAmount: 90_000,
					quotaDay: 5,
					quotaCarries: true,
					knownAmount: 30_000,
				});
				expect([voucher.initialBalance, voucher.balanceKnownOn]).toEqual([30_000, "2026-10-20"]);

				for (const [day, amount] of [
					["2026-10-10", 4_000],
					["2026-10-22", 5_000],
				] as const) {
					await on20th.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount,
						happenedOn: day,
						description: "Almoco",
						accountId: voucher.id,
					});
				}

				expect((await on20th.accounts.benefitLeft(voucher.id, "2026-10-25"))?.left).toBe(25_000);
				expect((await on20th.accounts.benefitLeft(voucher.id, "2026-11-05"))?.left).toBe(115_000);

				// Said again on a later day, it counts from that day.
				const on1st = await openSession({
					driver: fixture.driver,
					userId: fixture.ana.id,
					deviceId: "deviceAna",
					now: () => Date.parse("2026-11-01T12:00:00-03:00"),
				});
				const corrected = await on1st.accounts.update(voucher.id, { knownAmount: 20_000 });
				expect(corrected.balanceKnownOn).toBe("2026-11-01");
				expect((await on1st.accounts.benefitLeft(voucher.id, "2026-11-05"))?.left).toBe(110_000);

				// Only on a card that carries: on one that resets, the allowance says it.
				await expect(
					on20th.accounts.create({
						spaceId: space.id,
						kind: "voucher",
						name: "Vale transporte",
						benefit: "transport",
						quotaAmount: 30_000,
						quotaDay: 1,
						quotaCarries: false,
						knownAmount: 10_000,
					}),
				).rejects.toMatchObject({ rule: "knownAmountIsForCarryingVouchers" });
			} finally {
				await fixture.close();
			}
		});

		// Part 1, B.5 of the request for 2.0.0. A top up by Pix, written as a move between
		// accounts the way the application says to, left the current account and arrived
		// nowhere. And a refund on a voucher had no way in at all; decided with the owner, it is
		// a purchase taken back: back on the card, off its category, never income.
		it("counts a top up once its day comes, and takes a refunded lunch back", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = await openSession({
					driver: fixture.driver,
					userId: fixture.ana.id,
					deviceId: "deviceAna",
					now: () => Date.parse("2026-09-20T12:00:00-03:00"),
				});
				const space = await on.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await on.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
					initialBalance: 100_000,
				});
				const voucher = await on.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale refeicao",
					benefit: "meal",
					quotaAmount: 90_000,
					quotaDay: 5,
					quotaCarries: true,
				});
				const eating = await on.categories.create({
					spaceId: space.id,
					name: "Restaurante",
					kind: "expense",
				});

				for (const [day, amount] of [
					["2026-09-21", 10_000],
					["2026-09-28", 20_000],
				] as const) {
					await on.transactions.create({
						spaceId: space.id,
						kind: "transfer",
						amount,
						happenedOn: day,
						description: "Recarga por Pix",
						accountId: checking.id,
						counterAccountId: voucher.id,
					});
				}
				const [lunch] = await on.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 5_600,
					happenedOn: "2026-09-22",
					description: "Almoco",
					accountId: voucher.id,
					categoryId: eating.id,
				});
				const refund = await on.transactions.refund(lunch?.id ?? "", {
					amount: 5_600,
					happenedOn: "2026-09-23",
					description: "Estorno: Almoco",
				});
				expect([refund.kind, refund.amount, refund.categoryId]).toEqual([
					"expense",
					5_600,
					eating.id,
				]);

				// The allowance of the fifth, the top up of the twenty first, the lunch and its
				// refund. The top up of the twenty eighth has not happened yet.
				expect((await on.accounts.benefitLeft(voucher.id, "2026-09-25"))?.left).toBe(100_000);
				expect((await on.accounts.benefitLeft(voucher.id, "2026-09-28"))?.left).toBe(120_000);

				// The refund is not income, and the lunch is no longer spending.
				const september = { spaceId: space.id, from: "2026-09-01", to: "2026-09-30" };
				const totals = await on.reports.totals(september);
				expect([totals.income, totals.expense]).toEqual([0, 0]);
				const restaurant = (await on.reports.byCategory(september)).find(
					(one) => one.categoryId === eating.id,
				);
				expect(restaurant?.total ?? 0).toBe(0);

				// Only up to the purchase, and only on a benefit card.
				await expect(
					on.transactions.refund(lunch?.id ?? "", {
						amount: 5_601,
						happenedOn: "2026-09-23",
						description: "Estorno",
					}),
				).rejects.toMatchObject({ rule: "refundIsUpToThePurchase" });
			} finally {
				await fixture.close();
			}
		});

		// Part 1, B.7 of the request for 2.0.0. The two rules of a benefit card were asked only
		// when a record was created: editing one, moving a selection, a series and a file
		// brought in all wrote what creating refused. And an income written on a card before
		// 2.0.0 was counted on top of the allowance worked out for the same month; decided with
		// the owner, that income stands for the allowance of its month.
		it("asks a benefit card's rules on every path, and counts an old income once", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = await openSession({
					driver: fixture.driver,
					userId: fixture.ana.id,
					deviceId: "deviceAna",
					now: () => Date.parse("2026-09-20T12:00:00-03:00"),
				});
				const space = await on.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await on.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});
				const voucher = await on.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale refeicao",
					benefit: "meal",
					quotaAmount: 90_000,
					quotaDay: 5,
					quotaCarries: true,
				});

				const [salary] = await on.transactions.create({
					spaceId: space.id,
					kind: "income",
					amount: 100_000,
					happenedOn: "2026-09-10",
					description: "Salario",
					accountId: checking.id,
				});
				await expect(
					on.transactions.update(salary?.id ?? "", { accountId: voucher.id }),
				).rejects.toMatchObject({ rule: "benefitIsNotIncome" });
				await expect(
					on.transactions.updateMany([salary?.id ?? ""], { accountId: voucher.id }),
				).rejects.toMatchObject({ rule: "benefitIsNotIncome" });

				const savings = await on.accounts.create({
					spaceId: space.id,
					kind: "savings",
					name: "Poupanca",
				});
				const [move] = await on.transactions.create({
					spaceId: space.id,
					kind: "transfer",
					amount: 10_000,
					happenedOn: "2026-09-11",
					description: "Guardar",
					accountId: checking.id,
					counterAccountId: savings.id,
				});
				await expect(
					on.transactions.update(move?.id ?? "", { accountId: voucher.id }),
				).rejects.toMatchObject({ rule: "benefitDoesNotLeave" });

				await expect(
					on.recurrences.create({
						spaceId: space.id,
						description: "Salario",
						kind: "income",
						amount: 100_000,
						accountId: voucher.id,
						frequency: "monthly",
						startsOn: "2026-10-05",
					}),
				).rejects.toMatchObject({ rule: "benefitIsNotIncome" });
				const series = await on.recurrences.create({
					spaceId: space.id,
					description: "Salario",
					kind: "income",
					amount: 100_000,
					accountId: checking.id,
					frequency: "monthly",
					startsOn: "2026-10-05",
				});
				await expect(
					on.recurrences.update(series.id, { accountId: voucher.id }),
				).rejects.toMatchObject({ rule: "benefitIsNotIncome" });

				// A line that adds, in a file read into the card, is a refund and not income.
				const imported = await on.imports.create({
					spaceId: space.id,
					accountId: voucher.id,
					records: [{ happenedOn: "2026-09-12", amount: 2_000, description: "Estorno Loja" }],
				});
				const refund = await on.transactions.get(imported.ids[0] ?? "");
				expect([refund.kind, refund.amount]).toEqual(["expense", 2_000]);

				// An income on the card from before 2.0.0, which was the allowance of September
				// written by hand: September counts once, by that income.
				await fixture.driver.run(
					`INSERT INTO "transactions" ("id", "space_id", "kind", "status", "amount", "currency",
					   "amount_in_base", "happened_on", "description", "account_id", "created_by",
					   "created_at", "updated_at", "hlc")
					 VALUES ('oldAllowance', ?, 'income', 'settled', 90000, 'BRL', 90000,
					   '2026-09-05', 'Credito do vale', ?, ?, 0, 0, 'stamp1')`,
					[space.id, voucher.id, fixture.ana.id],
				);
				expect((await on.accounts.benefitLeft(voucher.id, "2026-09-25"))?.left).toBe(92_000);
				const september = await on.reports.totals({
					spaceId: space.id,
					from: "2026-09-01",
					to: "2026-09-30",
				});
				expect([september.income, september.benefits]).toEqual([190_000, 0]);
			} finally {
				await fixture.close();
			}
		});

		// Part 1, B.9 of the request for 2.0.0. An allowance was accepted with no day, the form
		// wrote the first of the month under an example showing the fifth when the field was
		// left empty, and the edit wrote no day at all, so the overview said there was none.
		it("refuses an allowance with no day, written or edited", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				await expect(
					fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "voucher",
						name: "Vale sem dia",
						benefit: "meal",
						quotaAmount: 90_000,
					}),
				).rejects.toMatchObject({ rule: "quotaNeedsADay" });

				const voucher = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale",
					benefit: "meal",
					quotaAmount: 90_000,
					quotaDay: 5,
				});
				// The edit that sent the amount and an empty day.
				await expect(
					fixture.asAna.accounts.update(voucher.id, { quotaAmount: 100_000, quotaDay: null }),
				).rejects.toMatchObject({ rule: "quotaNeedsADay" });
				expect((await fixture.asAna.accounts.get(voucher.id)).quotaDay).toBe(5);

				// And a voucher from before 2.0.0 with an amount and no day takes one on its next edit.
				const old = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale antigo",
					benefit: "meal",
				});
				await expect(
					fixture.asAna.accounts.update(old.id, { quotaAmount: 50_000 }),
				).rejects.toMatchObject({ rule: "quotaNeedsADay" });
				const fixed = await fixture.asAna.accounts.update(old.id, {
					quotaAmount: 50_000,
					quotaDay: 10,
				});
				expect([fixed.quotaAmount, fixed.quotaDay]).toEqual([50_000, 10]);
			} finally {
				await fixture.close();
			}
		});

		it("says nothing for a voucher with no allowance on it, which every old one is", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const voucher = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale antigo",
					benefit: "meal",
				});
				await fixture.asAna.accounts.update(voucher.id, { initialBalance: 30_000 });
				expect(
					await fixture.asAna.accounts.benefitLeft(voucher.id, todayIn("America/Sao_Paulo")),
				).toBeNull();
			} finally {
				await fixture.close();
			}
		});

		/**
		 * A card is written down with nothing on it.
		 *
		 * Neither kind holds a balance somebody can type: what is on a credit card is its
		 * invoice, made of purchases, and what is on a benefit card is the allowance less what
		 * was eaten. The form offered the field under the sentence "how much is in this
		 * account today", which is the wrong question for both, and whatever was typed then
		 * sat in every total for ever with nothing to explain it.
		 *
		 * Only on a new one. Correcting the number on an account that already carries one is
		 * how a card written down by an older release keeps counting, and how somebody says
		 * what was on a benefit card the day they wrote it down.
		 */
		it("refuses an opening balance on a new card, and takes a correction to an old one", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });

				for (const kind of ["credit", "voucher"] as const) {
					await expect(
						fixture.asAna.accounts.create({
							spaceId: space.id,
							kind,
							name: `Novo ${kind}`,
							initialBalance: 50_000,
							...(kind === "credit" ? { closingDay: 28, dueDay: 5 } : { benefit: "meal" as const }),
						}),
					).rejects.toBeInstanceOf(RuleError);
				}

				// Zero is not a number somebody typed, so it is taken and changes nothing.
				const card = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "credit",
					name: "Cartão",
					initialBalance: 0,
					closingDay: 28,
					dueDay: 5,
				});
				expect(card.initialBalance).toBe(0);

				// And the correction, which is what carries an older card across.
				const corrected = await fixture.asAna.accounts.update(card.id, {
					initialBalance: -40_000,
				});
				expect(corrected.initialBalance).toBe(-40_000);
			} finally {
				await fixture.close();
			}
		});

		it("refuses an allowance on an account that is not a benefit card", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				await expect(
					fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "checking",
						name: "Conta corrente",
						quotaAmount: 90_000,
						quotaDay: 5,
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await fixture.close();
			}
		});

		it("refuses income on a benefit card, because the credit is not a record", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const voucher = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale refeicao",
					benefit: "meal",
				});
				await expect(
					fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "income",
						amount: 90_000,
						happenedOn: "2026-09-05",
						description: "Credito do vale",
						accountId: voucher.id,
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await fixture.close();
			}
		});

		it("refuses moving money out of a benefit card, and takes a top up into one", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
					initialBalance: 100_000,
				});
				const voucher = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale refeicao",
					benefit: "meal",
				});

				await expect(
					fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "transfer",
						amount: 10_000,
						happenedOn: "2026-09-10",
						description: "Sacando o vale",
						accountId: voucher.id,
						counterAccountId: checking.id,
					}),
				).rejects.toBeInstanceOf(RuleError);

				// The other direction is real: cards like Caju and Flash take a top up.
				const [topUp] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "transfer",
					amount: 10_000,
					happenedOn: "2026-09-10",
					description: "Recarga",
					accountId: checking.id,
					counterAccountId: voucher.id,
				});
				expect(topUp?.kind).toBe("transfer");
			} finally {
				await fixture.close();
			}
		});

		it("counts the allowance as money that came in, on its own line", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const voucher = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale refeicao",
					benefit: "meal",
					quotaAmount: 90_000,
					quotaDay: 5,
					quotaCarries: true,
				});

				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 25_500,
					happenedOn: "2026-09-10",
					description: "Almoco",
					accountId: voucher.id,
				});

				const month = await fixture.asAna.reports.totals({
					spaceId: space.id,
					from: "2026-09-01",
					to: "2026-09-30",
				});

				// The lunch is spending like any other. Without the credit beside it the month
				// would close worse by exactly what was eaten, and nobody writes the credit
				// down because nothing of theirs moved.
				expect(month.benefits).toBe(90_000);
				expect(month.expense).toBe(25_500);
				expect(month.left).toBe(90_000 - 25_500);

				// And not a real before the card existed. The allowance was counted over any
				// range at all, so a card written down this month paid a household nine hundred
				// in every month back to the beginning of its records, and every one of those
				// months read as though it had ended better than it did.
				const before = await fixture.asAna.reports.totals({
					spaceId: space.id,
					from: "2026-03-01",
					to: "2026-03-31",
				});
				expect(before.benefits).toBe(0);
				expect(before.left).toBe(0);

				// Nor after it is archived, for the same reason from the other end.
				await fixture.asAna.accounts.archive(voucher.id);
				const after = await fixture.asAna.reports.totals({
					spaceId: space.id,
					from: "2026-12-01",
					to: "2026-12-31",
				});
				expect(after.benefits).toBe(0);
			} finally {
				await fixture.close();
			}
		});

		it("refuses a day that is not a day of the month", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				await expect(
					fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "voucher",
						name: "Vale",
						benefit: "meal",
						quotaAmount: 90_000,
						quotaDay: 32,
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await fixture.close();
			}
		});
	});

	describe("cards", () => {
		it("gives a cartao multiplo both of its accounts, and keeps them apart", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});
				const invoice = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "credit",
					name: "Cartao",
					closingDay: 3,
					dueDay: 10,
				});

				const card = await fixture.asAna.cards.create({
					spaceId: space.id,
					kind: "multiple",
					name: "Nubank",
					lastFour: "1234",
					creditAccountId: invoice.id,
					debitAccountId: checking.id,
				});
				expect(card.creditAccountId).toBe(invoice.id);
				expect(card.debitAccountId).toBe(checking.id);

				// The same plastic, used the two ways it can be used. One lands on the
				// invoice with a month stamped on it, the other leaves the balance today.
				const [onCredit] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 9_900,
					happenedOn: "2026-09-10",
					description: "Livraria",
					accountId: invoice.id,
					cardId: card.id,
				});
				const [onDebit] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4_200,
					happenedOn: "2026-09-10",
					description: "Padaria",
					accountId: checking.id,
					cardId: card.id,
				});

				expect(onCredit?.invoiceMonth).toBe("2026-10");
				expect(onDebit?.invoiceMonth).toBeNull();
				expect(onCredit?.cardId).toBe(card.id);
				expect(onDebit?.cardId).toBe(card.id);

				const byCard = await fixture.asAna.transactions.list({
					spaceId: space.id,
					cardId: card.id,
				});
				expect(byCard.map((one) => one.description).sort()).toEqual(["Livraria", "Padaria"]);
			} finally {
				await fixture.close();
			}
		});

		it("refuses a card whose accounts do not match what its kind promises", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});
				const invoice = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "credit",
					name: "Cartao",
					closingDay: 3,
					dueDay: 10,
				});

				// A credit card with no invoice cannot charge anything.
				await expect(
					fixture.asAna.cards.create({ spaceId: space.id, kind: "credit", name: "Sem fatura" }),
				).rejects.toBeInstanceOf(RuleError);

				// A debit card that points at an invoice is a credit card mislabelled.
				await expect(
					fixture.asAna.cards.create({
						spaceId: space.id,
						kind: "debit",
						name: "Debito",
						debitAccountId: invoice.id,
					}),
				).rejects.toBeInstanceOf(RuleError);

				// And an invoice only lives on a credit account.
				await expect(
					fixture.asAna.cards.create({
						spaceId: space.id,
						kind: "credit",
						name: "Credito",
						creditAccountId: checking.id,
					}),
				).rejects.toBeInstanceOf(RuleError);

				// A benefit card spends a balance and never charges an invoice.
				await expect(
					fixture.asAna.cards.create({
						spaceId: space.id,
						kind: "benefit",
						name: "VR",
						debitAccountId: checking.id,
						creditAccountId: invoice.id,
					}),
				).rejects.toBeInstanceOf(RuleError);

				await expect(
					fixture.asAna.cards.create({
						spaceId: space.id,
						kind: "debit",
						name: "Digitos",
						debitAccountId: checking.id,
						lastFour: "12",
					}),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await fixture.close();
			}
		});

		it("never lets a card reach an account of another space", async () => {
			const fixture = await prepare(adapter);
			try {
				const mine = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const theirs = await fixture.asJoao.spaces.create({ name: "Pessoal", kind: "personal" });
				const elsewhere = await fixture.asJoao.accounts.create({
					spaceId: theirs.id,
					kind: "checking",
					name: "Conta do Joao",
				});

				await expect(
					fixture.asAna.cards.create({
						spaceId: mine.id,
						kind: "debit",
						name: "Emprestado",
						debitAccountId: elsewhere.id,
					}),
				).rejects.toBeInstanceOf(NotFoundError);
			} finally {
				await fixture.close();
			}
		});

		it("refuses to stamp a record with a card that does not reach its account", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});
				const voucher = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale refeicao",
					benefit: "meal",
				});
				const card = await fixture.asAna.cards.create({
					spaceId: space.id,
					kind: "benefit",
					name: "VR",
					debitAccountId: voucher.id,
				});

				await expect(
					fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 3_500,
						happenedOn: "2026-09-10",
						description: "Almoco",
						accountId: checking.id,
						cardId: card.id,
					}),
				).rejects.toBeInstanceOf(RuleError);

				// Archived, it is not something to write with either.
				await fixture.asAna.cards.archive(card.id);
				await expect(
					fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 3_500,
						happenedOn: "2026-09-10",
						description: "Almoco",
						accountId: voucher.id,
						cardId: card.id,
					}),
				).rejects.toBeInstanceOf(RuleError);

				expect(await fixture.asAna.cards.list(space.id)).toEqual([]);
				expect((await fixture.asAna.cards.list(space.id, { includeArchived: true })).length).toBe(
					1,
				);
			} finally {
				await fixture.close();
			}
		});

		it("drops the card when a record moves somewhere the card does not reach", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});
				const cash = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "cash",
					name: "Carteira",
				});
				const card = await fixture.asAna.cards.create({
					spaceId: space.id,
					kind: "debit",
					name: "Debito",
					debitAccountId: checking.id,
				});

				const [record] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 2_000,
					happenedOn: "2026-09-10",
					description: "Feira",
					accountId: checking.id,
					cardId: card.id,
				});
				expect(record?.cardId).toBe(card.id);

				const moved = await fixture.asAna.transactions.update(record?.id ?? "", {
					accountId: cash.id,
				});
				expect(moved.cardId).toBeNull();
			} finally {
				await fixture.close();
			}
		});

		/**
		 * Removing a card takes the card and nothing else.
		 *
		 * This is the test that has to keep passing. A card is a label on money that
		 * already moved, and money that already moved is not undone by throwing away the
		 * piece of plastic: the account, the balance, the invoice it was charged on and
		 * the invoice month stamped on it all belong to the record, not to the card.
		 */
		it("takes only the card away, and leaves the invoice and the money behind", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});
				const invoice = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "credit",
					name: "Cartao",
					closingDay: 3,
					dueDay: 10,
				});
				const card = await fixture.asAna.cards.create({
					spaceId: space.id,
					kind: "multiple",
					name: "Do banco",
					lastFour: "4417",
					creditAccountId: invoice.id,
					debitAccountId: checking.id,
				});

				const [onDebit] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 2_000,
					happenedOn: "2026-09-10",
					description: "Feira",
					accountId: checking.id,
					cardId: card.id,
				});
				const parts = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 90_000,
					happenedOn: "2026-09-10",
					description: "Fone",
					accountId: invoice.id,
					cardId: card.id,
					installments: 3,
				});

				await fixture.asAna.cards.remove(card.id);
				await expect(fixture.asAna.cards.get(card.id)).rejects.toBeInstanceOf(NotFoundError);

				// The two accounts the card reached are untouched.
				expect((await fixture.asAna.accounts.list(space.id)).map((one) => one.name).sort()).toEqual(
					["Cartao", "Conta corrente"],
				);

				// The money is still charged where it was charged, which is what a balance
				// is made of.
				const kept = await fixture.asAna.transactions.get(onDebit?.id ?? "");
				expect(kept.accountId).toBe(checking.id);
				const balances = await fixture.asAna.transactions.balances(space.id, LATER);
				expect(balances.find((one) => one.accountId === checking.id)?.settled).toBe(-2_000);

				// And the invoice still has every part of the purchase, on the month it was
				// stamped with when it was written.
				const onInvoice = await fixture.asAna.transactions.list({
					spaceId: space.id,
					accountId: invoice.id,
					invoiceMonth: "2026-10",
				});
				expect(onInvoice).toHaveLength(1);
				expect(parts).toHaveLength(3);
				expect(
					(
						await fixture.asAna.transactions.list({
							spaceId: space.id,
							accountId: invoice.id,
						})
					).reduce((sum, one) => sum + one.amount, 0),
				).toBe(-90_000);
			} finally {
				await fixture.close();
			}
		});

		it("takes the cards with it when the account they reach is removed", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});
				const invoice = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "credit",
					name: "Cartao",
					closingDay: 3,
					dueDay: 10,
				});
				const onBoth = await fixture.asAna.cards.create({
					spaceId: space.id,
					kind: "multiple",
					name: "Do banco",
					creditAccountId: invoice.id,
					debitAccountId: checking.id,
				});
				const onlyDebit = await fixture.asAna.cards.create({
					spaceId: space.id,
					kind: "debit",
					name: "Da conta",
					debitAccountId: checking.id,
				});
				const [record] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 2_000,
					happenedOn: "2026-09-10",
					description: "Feira",
					accountId: checking.id,
					cardId: onlyDebit.id,
				});

				await fixture.asAna.accounts.remove(checking.id);

				// Both cards reached that account, so neither is a card any more. A card
				// left naming an account that is gone would still be offered on a record
				// it could never be saved with.
				expect(await fixture.asAna.cards.list(space.id)).toEqual([]);
				await expect(fixture.asAna.cards.get(onBoth.id)).rejects.toBeInstanceOf(NotFoundError);
				await expect(fixture.asAna.cards.get(onlyDebit.id)).rejects.toBeInstanceOf(NotFoundError);

				// The other account is untouched, and so is the record.
				expect((await fixture.asAna.accounts.list(space.id)).map((one) => one.name)).toEqual([
					"Cartao",
				]);
				expect((await fixture.asAna.transactions.get(record?.id ?? "")).amount).toBe(-2_000);
			} finally {
				await fixture.close();
			}
		});

		/**
		 * VA and VR became one pot. Two things have to be true of that, and only one of
		 * them is about code somebody will read again: the rows that already said VA have
		 * to say the one that is left, and a row that arrives afterwards still saying VA,
		 * from a device running an older build, has to be read as the one that is left
		 * rather than as a value nothing knows how to show.
		 */
		it("folds the benefit that was retired into the one that replaced it", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale",
					benefit: "meal",
				});

				// A row as an older build would have written it, straight into the table.
				await fixture.driver.run(`UPDATE "accounts" SET "benefit" = 'food' WHERE "id" = ?`, [
					account.id,
				]);
				expect((await fixture.asAna.accounts.get(account.id)).benefit).toBe("meal");

				// And the migration itself, run again over a row that has it.
				await fixture.driver.run(`DELETE FROM "schema_migrations" WHERE "id" = ?`, [
					"0012_one_food_benefit",
				]);
				expect(await migrate(fixture.driver)).toEqual(["0012_one_food_benefit"]);

				const rows = await fixture.driver.all(`SELECT "benefit" FROM "accounts" WHERE "id" = ?`, [
					account.id,
				]);
				expect(rows[0]?.benefit).toBe("meal");
			} finally {
				await fixture.close();
			}
		});

		it("lets only a voucher account say which benefit it holds", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				await expect(
					fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "checking",
						name: "Conta corrente",
						benefit: "transport",
					}),
				).rejects.toBeInstanceOf(RuleError);

				const transport = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "voucher",
					name: "Vale transporte",
					benefit: "transport",
				});
				expect(transport.benefit).toBe("transport");
			} finally {
				await fixture.close();
			}
		});
	});
}
