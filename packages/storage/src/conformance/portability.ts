// Getting data in and getting it out again.
//
// The promise of this application is that the data belongs to whoever runs it. That
// promise is only worth what this file proves: a statement can be written down in one
// go, everything can leave as one file, and that file can come back somewhere else and
// be the same money life again.

import { describe, expect, it } from "vitest";
import type { Driver } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { migrate } from "../migrate.ts";
import type { User } from "../models.ts";
import { openSession, type Session } from "../session.ts";
import { applyPeople } from "../sync.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

export function runPortabilityConformance(adapter: AdapterUnderTest): void {
	/**
	 * A database somewhere else, with nothing in it and only the people it is told
	 * about. Restoring a backup into the same database would prove nothing: the whole
	 * point is moving from the browser to a server, or from one server to another.
	 */
	async function elsewhere(
		people: readonly User[],
		as: User,
		name: string,
	): Promise<{ driver: Driver; session: Session; close: () => Promise<void> }> {
		const driver = adapter.openAnother ? await adapter.openAnother(name) : await adapter.open();
		await migrate(driver);
		await applyPeople(
			driver,
			people.map((person) => ({
				id: person.id,
				email: person.email,
				name: person.name,
				image: person.image,
				createdAt: person.createdAt,
				updatedAt: person.updatedAt,
			})),
		);
		return {
			driver,
			session: await openSession({ driver, userId: as.id, deviceId: name }),
			close: () => driver.close(),
		};
	}

	describe("reading a statement into a space", () => {
		it("writes every line at once, taking the direction from the sign", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});

				const result = await fixture.asAna.imports.create({
					spaceId: space.id,
					accountId: account.id,
					records: [
						{ happenedOn: "2026-09-10", amount: -4290, description: "Mercado", externalId: "abc" },
						{ happenedOn: "2026-09-05", amount: 500_000, description: "Salario" },
					],
				});

				expect(result.written).toBe(2);

				const written = await fixture.asAna.transactions.list({ spaceId: space.id });
				expect(written.map((record) => record.kind).sort()).toEqual(["expense", "income"]);
				expect(written.find((record) => record.amount === -4290)?.externalId).toBe("abc");
				expect(written.every((record) => record.status === "settled")).toBe(true);

				const balances = await fixture.asAna.transactions.balances(space.id);
				expect(balances[0]?.settled).toBe(495_710);
			} finally {
				await fixture.close();
			}
		});

		it("writes nothing at all when one line is wrong", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "cash",
					name: "Carteira",
				});

				await expect(
					fixture.asAna.imports.create({
						spaceId: space.id,
						accountId: account.id,
						records: [
							{ happenedOn: "2026-09-10", amount: -1000, description: "Padaria" },
							{ happenedOn: "2026-09-11", amount: -1000, description: "   " },
						],
					}),
				).rejects.toBeInstanceOf(RuleError);

				expect(await fixture.asAna.transactions.list({ spaceId: space.id })).toEqual([]);
			} finally {
				await fixture.close();
			}
		});

		it("lets the rules of the space sort what arrives", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});
				const category = await fixture.asAna.categories.create({
					spaceId: space.id,
					name: "Mercado",
					kind: "expense",
				});
				await fixture.asAna.rules.create({
					spaceId: space.id,
					matchText: "mercado",
					categoryId: category.id,
				});

				await fixture.asAna.imports.create({
					spaceId: space.id,
					accountId: account.id,
					records: [
						{ happenedOn: "2026-09-10", amount: -4290, description: "MERCADO DO BAIRRO" },
						{ happenedOn: "2026-09-11", amount: -1000, description: "Outra coisa" },
					],
				});

				const written = await fixture.asAna.transactions.list({ spaceId: space.id });
				expect(written.find((record) => record.amount === -4290)?.categoryId).toBe(category.id);
				expect(written.find((record) => record.amount === -1000)?.categoryId).toBe(null);
			} finally {
				await fixture.close();
			}
		});

		it("stamps a card purchase with the invoice it will be charged on", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const card = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "credit",
					name: "Cartao",
					closingDay: 5,
					dueDay: 12,
				});

				await fixture.asAna.imports.create({
					spaceId: space.id,
					accountId: card.id,
					records: [{ happenedOn: "2026-09-10", amount: -4290, description: "Mercado" }],
				});

				const written = await fixture.asAna.transactions.list({ spaceId: space.id });
				expect(written[0]?.invoiceMonth).toBe("2026-10");
			} finally {
				await fixture.close();
			}
		});

		it("gives the reading side what it needs to spot a repeat", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});

				await fixture.asAna.imports.create({
					spaceId: space.id,
					accountId: account.id,
					records: [
						{ happenedOn: "2026-09-10", amount: -4290, description: "Mercado", externalId: "abc" },
						{ happenedOn: "2026-08-01", amount: -1000, description: "Antigo" },
					],
				});

				const known = await fixture.asAna.imports.existing(space.id, { from: "2026-09-01" });
				expect(known).toHaveLength(1);
				expect(known[0]).toMatchObject({
					happenedOn: "2026-09-10",
					amount: -4290,
					externalId: "abc",
				});
			} finally {
				await fixture.close();
			}
		});
	});

	describe("taking everything with you", () => {
		it("carries the space, and brings it back somewhere else", async () => {
			const fixture = await prepare(adapter);
			const other = await elsewhere([fixture.ana], fixture.ana, "restoreOne");
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta da casa",
					initialBalance: 100_000,
				});
				const category = await fixture.asAna.categories.create({
					spaceId: space.id,
					name: "Mercado",
					kind: "expense",
				});
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Mercado do bairro",
					accountId: account.id,
					categoryId: category.id,
				});
				await fixture.asAna.budgets.create({
					spaceId: space.id,
					scope: "total",
					amount: 300_000,
				});

				const backup = await fixture.asAna.backup.exportSpace(space.id);
				expect(backup.format).toBe("cofre.backup");
				expect(backup.spaces).toHaveLength(1);
				expect(backup.spaces[0]?.tables.transactions).toHaveLength(1);

				// The same person, on their own server now, opens the file.
				const result = await other.session.backup.restore(backup);
				await other.session.refresh();

				expect(result.spaces[0]?.created).toBe(true);
				// The identifier travels, so the browser that still holds the original can
				// meet this database later and agree with it instead of doubling it.
				expect(result.spaces[0]?.spaceId).toBe(space.id);

				const restored = (await other.session.spaces.list()).find((found) => found.id === space.id);
				expect(restored?.name).toBe("Casa");

				const records = await other.session.transactions.list({ spaceId: space.id });
				expect(records).toHaveLength(1);
				expect(records[0]?.amount).toBe(-4290);
				expect(records[0]?.categoryId).toBe(category.id);

				expect(
					(await other.session.accounts.list(space.id)).map((found) => found.initialBalance),
				).toEqual([100_000]);
				expect(await other.session.budgets.list(space.id)).toHaveLength(1);
			} finally {
				await other.close();
				await fixture.close();
			}
		});

		it("changes nothing the second time the same file is opened", async () => {
			const fixture = await prepare(adapter);
			const other = await elsewhere([fixture.ana], fixture.ana, "restoreTwice");
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "cash",
					name: "Dinheiro",
				});
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 1000,
					happenedOn: "2026-09-10",
					description: "Cafe",
					accountId: account.id,
				});

				const backup = await fixture.asAna.backup.exportSpace(space.id);
				await other.session.backup.restore(backup);
				await other.session.refresh();

				const again = await other.session.backup.restore(backup);
				expect(again.spaces[0]?.written).toBe(0);
				expect(again.spaces[0]?.skipped.every((entry) => entry.reason === "alreadyHere")).toBe(
					true,
				);
				expect(await other.session.transactions.list({ spaceId: space.id })).toHaveLength(1);
			} finally {
				await other.close();
				await fixture.close();
			}
		});

		it("puts a personal space back into the personal space there already is", async () => {
			const fixture = await prepare(adapter);
			const other = await elsewhere([fixture.ana], fixture.ana, "restorePersonal");
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "cash",
					name: "Carteira",
				});
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 1000,
					happenedOn: "2026-09-10",
					description: "Cafe",
					accountId: account.id,
				});

				const backup = await fixture.asAna.backup.exportSpace(space.id);

				// Signing up somewhere else creates a personal space before the file arrives.
				const fresh = await other.session.spaces.create({ name: "Pessoal", kind: "personal" });
				const result = await other.session.backup.restore(backup);

				expect(result.spaces[0]?.created).toBe(false);
				expect(result.spaces[0]?.spaceId).toBe(fresh.id);
				expect(await other.session.transactions.list({ spaceId: fresh.id })).toHaveLength(1);
				// Still one personal space, which is the rule everywhere else.
				expect((await other.session.spaces.list()).length).toBe(1);
			} finally {
				await other.close();
				await fixture.close();
			}
		});

		it("says out loud what it could not bring back", async () => {
			const fixture = await prepare(adapter);
			// A database that knows Ana and has never heard of Joao.
			const other = await elsewhere([fixture.ana], fixture.ana, "restoreStranger");
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				await fixture.asAna.members.invite({
					spaceId: space.id,
					userId: fixture.joao.id,
					role: "editor",
				});
				await fixture.asJoao.members.accept(space.id);

				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta da casa",
				});
				const [record] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 10_000,
					happenedOn: "2026-09-10",
					description: "Feira",
					accountId: account.id,
				});
				await fixture.asAna.sharing.split({ transactionId: record?.id ?? "", method: "evenly" });

				const backup = await fixture.asAna.backup.exportSpace(space.id);
				expect(backup.people.map((person) => person.name).sort()).toEqual(["Ana", "Joao"]);
				expect(backup.spaces[0]?.tables.expense_splits).toHaveLength(2);

				const result = await other.session.backup.restore(backup);
				const lost = result.spaces[0]?.skipped.find((entry) => entry.reason === "unknownPerson");
				expect(lost?.table).toBe("expense_splits");
				// The half that belongs to Ana comes back. The half that belongs to somebody
				// this database does not know is left out, and said out loud.
				expect(lost?.count).toBe(1);

				const splits = await other.driver.all(
					`SELECT "user_id" FROM "expense_splits" WHERE "space_id" = ?`,
					[space.id],
				);
				expect(splits.map((row) => String(row.user_id))).toEqual([fixture.ana.id]);
			} finally {
				await other.close();
				await fixture.close();
			}
		});

		it("refuses a file that is not a backup", async () => {
			const fixture = await prepare(adapter);
			try {
				await expect(
					fixture.asAna.backup.restore({ format: "outra coisa" } as never),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await fixture.close();
			}
		});

		it("gives a spreadsheet the names, not the identifiers", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});
				const category = await fixture.asAna.categories.create({
					spaceId: space.id,
					name: "Mercado",
					kind: "expense",
				});
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Mercado do bairro",
					accountId: account.id,
					categoryId: category.id,
				});

				const rows = await fixture.asAna.backup.recordsForExport(space.id);
				expect(rows).toHaveLength(1);
				expect(rows[0]).toMatchObject({
					happenedOn: "2026-09-10",
					description: "Mercado do bairro",
					amount: -4290,
					account: "Conta corrente",
					category: "Mercado",
				});
			} finally {
				await fixture.close();
			}
		});

		it("keeps a space away from somebody who is not in it", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				await expect(fixture.asJoao.backup.exportSpace(space.id)).rejects.toBeInstanceOf(
					NotFoundError,
				);
				expect((await fixture.asJoao.backup.exportEverything()).spaces).toEqual([]);
			} finally {
				await fixture.close();
			}
		});
	});
}
