// The list of records and what it adds up to, on every adapter. Part 2, section F of the
// request for 2.0.0.

import { describe, expect, it } from "vitest";
import { type AdapterUnderTest, prepare } from "./setup.ts";

export function runListingConformance(adapter: AdapterUnderTest): void {
	describe("the list and what it adds up to", () => {
		// F.4: the list gave two hundred records and the footer added only those; records written
		// at the same instant could repeat or go missing between pages.
		it("pages through every record once, and adds up all of them", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				const space = await on.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await on.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});
				// One import writes them all in one instant, which is what made the order unstable.
				await on.imports.create({
					spaceId: space.id,
					accountId: account.id,
					records: Array.from({ length: 250 }, (_unused, index) => ({
						happenedOn: "2026-10-15",
						amount: -1000,
						description: `Compra ${index + 1}`,
					})),
				});
				const filter = { spaceId: space.id, from: "2026-10-01", to: "2026-10-31" };
				const first = await on.transactions.list(filter);
				const second = await on.transactions.list({ ...filter, offset: 200 });
				expect([first.length, second.length]).toEqual([200, 50]);
				expect(new Set([...first, ...second].map((row) => row.id)).size).toBe(250);

				const summary = await on.transactions.summarize(filter);
				expect([summary.count, summary.income, summary.expense]).toEqual([250, 0, 250_000]);
				expect(summary.byMonth).toEqual([
					{ month: "2026-10", count: 250, income: 0, expense: 250_000 },
				]);
			} finally {
				await fixture.close();
			}
		});

		// F.5.3 and F.5.5: a move and the payment of an invoice are neither, unless the filter is
		// the account; and somebody who sees only their own records adds up only those.
		it("counts a move only from the account it touches, and a logger's own records", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = fixture.asAna;
				const house = await on.spaces.create({ name: "Casa" });
				await on.members.invite({ spaceId: house.id, userId: fixture.joao.id, role: "logger" });
				await fixture.asJoao.members.accept(house.id);
				const checking = await on.accounts.create({
					spaceId: house.id,
					kind: "checking",
					name: "Corrente",
				});
				const card = await on.accounts.create({
					spaceId: house.id,
					kind: "credit",
					name: "Cartao",
					closingDay: 3,
					dueDay: 10,
				});
				await on.transactions.create({
					spaceId: house.id,
					kind: "income",
					amount: 612_000,
					happenedOn: "2026-10-05",
					description: "Salario",
					accountId: checking.id,
				});
				await on.invoices.pay({
					accountId: card.id,
					fromAccountId: checking.id,
					amount: 120_000,
					happenedOn: "2026-10-10",
					month: "2026-10",
					description: "Pagamento da fatura",
				});
				const ofTheAccount = await on.transactions.summarize({
					spaceId: house.id,
					accountId: checking.id,
				});
				expect([ofTheAccount.income, ofTheAccount.expense]).toEqual([612_000, 120_000]);
				const ofTheSpace = await on.transactions.summarize({ spaceId: house.id });
				expect([ofTheSpace.count, ofTheSpace.income, ofTheSpace.expense]).toEqual([2, 612_000, 0]);

				await fixture.asJoao.transactions.create({
					spaceId: house.id,
					kind: "expense",
					amount: 3_000,
					happenedOn: "2026-10-12",
					description: "Pao",
					accountId: checking.id,
				});
				const theirs = await fixture.asJoao.transactions.summarize({ spaceId: house.id });
				expect([theirs.count, theirs.income, theirs.expense]).toEqual([1, 0, 3_000]);
			} finally {
				await fixture.close();
			}
		});
	});
}
