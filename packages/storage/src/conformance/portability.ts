// Getting data in and getting it out again.
//
// The promise of this application is that the data belongs to whoever runs it. That
// promise is only worth what this file proves: a statement can be written down in one
// go, everything can leave as one file, and that file can come back somewhere else and
// be the same money life again.

import { describe, expect, it } from "vitest";
import type { Driver } from "../driver.ts";
import { NotFoundError, PermissionError, RuleError } from "../errors.ts";
import { migrate } from "../migrate.ts";
import type { User } from "../models.ts";
import { backupFromBundle } from "../repositories/backup.ts";
import { openSession, type Session } from "../session.ts";
import { applyPeople, changesSince, peopleInSpace, replicableOnly } from "../sync.ts";
import { BUNDLE_FORMAT, BUNDLE_VERSION, type SyncBundle } from "../syncStore.ts";
import { type AdapterUnderTest, LATER, prepare } from "./setup.ts";

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

				const balances = await fixture.asAna.transactions.balances(space.id, LATER);
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

		// Part 2, A.4.5 of the request for 2.0.0: a move reached the account it left and not the
		// one it landed in, and it came back positive on the side it left, so the statement of
		// either account read the same Pix as something new.
		it("gives the reading side the moves that touch an account, as that account sees them", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const checking = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});
				const savings = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "savings",
					name: "Reserva",
				});
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "transfer",
					amount: 50_000,
					happenedOn: "2026-10-20",
					description: "PIX POUPANCA",
					accountId: checking.id,
					counterAccountId: savings.id,
				});

				const out = await fixture.asAna.imports.existing(space.id, { accountId: checking.id });
				expect(out).toMatchObject([{ amount: -50_000, moved: true }]);
				const into = await fixture.asAna.imports.existing(space.id, { accountId: savings.id });
				expect(into).toMatchObject([{ amount: 50_000, moved: true }]);
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
				const card = await fixture.asAna.cards.create({
					spaceId: space.id,
					kind: "debit",
					name: "Cartao da casa",
					lastFour: "4417",
					debitAccountId: account.id,
				});
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Mercado do bairro",
					accountId: account.id,
					categoryId: category.id,
					cardId: card.id,
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

				// The card came with it, still pointing at the account it spends, and the
				// record still says it was the one used. A backup that loses which card
				// paid is a backup that loses a column of every statement.
				const carried = await other.session.cards.list(space.id);
				expect(carried.map((one) => one.lastFour)).toEqual(["4417"]);
				expect(carried[0]?.debitAccountId).toBe(account.id);
				expect(records[0]?.cardId).toBe(card.id);

				expect(
					(await other.session.accounts.list(space.id)).map((found) => found.initialBalance),
				).toEqual([100_000]);
				expect(await other.session.budgets.list(space.id)).toHaveLength(1);
			} finally {
				await other.close();
				await fixture.close();
			}
		});

		// Part 2, K.6.4 and K.8.3 of the request for 2.0.0: the version of a backup rose to 2 once
		// in this release. A file of 1.2.1, version 1, still restores; one a later version wrote
		// is refused by name rather than read with what it carries lost in silence.
		it("restores a backup of 1.2.1, and refuses one written by a later version", async () => {
			const fixture = await prepare(adapter);
			const other = await elsewhere([fixture.ana], fixture.ana, "restoreVersions");
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta da casa",
					initialBalance: 100_000,
				});
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Mercado do bairro",
					accountId: account.id,
				});
				const backup = await fixture.asAna.backup.exportSpace(space.id);

				await expect(other.session.backup.restore({ ...backup, version: 3 })).rejects.toMatchObject(
					{ rule: "backupIsNewer" },
				);
				const restored = await other.session.backup.restore({ ...backup, version: 1 });
				expect(restored.spaces[0]?.created).toBe(true);
				await other.session.refresh();
				expect(await other.session.transactions.list({ spaceId: space.id })).toHaveLength(1);
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

		it("makes a whole copy when the space belongs to somebody else", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta da casa",
					initialBalance: 50_000,
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

				const backup = await fixture.asAna.backup.exportSpace(space.id);

				// The same database, and Joao has never been in this space.
				const result = await fixture.asJoao.backup.restore(backup);
				await fixture.asJoao.refresh();

				const copy = result.spaces[0]?.spaceId ?? "";
				expect(copy).not.toBe(space.id);
				expect(result.spaces[0]?.written).toBe(3);

				const records = await fixture.asJoao.transactions.list({ spaceId: copy });
				const accounts = await fixture.asJoao.accounts.list(copy);
				const categories = await fixture.asJoao.categories.list(copy);

				expect(records).toHaveLength(1);
				// The copy points at its own rows, not at the ones it was copied from.
				expect(records[0]?.accountId).toBe(accounts[0]?.id);
				expect(records[0]?.accountId).not.toBe(account.id);
				expect(records[0]?.categoryId).toBe(categories[0]?.id);
				expect(accounts[0]?.initialBalance).toBe(50_000);

				// And the space it was copied from is exactly as it was.
				expect(await fixture.asAna.transactions.list({ spaceId: space.id })).toHaveLength(1);
			} finally {
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

		// Part 2, A.1.4 of the request for 2.0.0: the spreadsheet called a payment of an invoice
		// and money moved into savings the same thing, a transfer, which the interface no longer
		// says. The kind of the account it landed in tells the two apart.
		it("says what kind of account a transfer landed in", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const make = (kind: "checking" | "savings" | "credit", name: string) =>
					fixture.asAna.accounts.create({
						spaceId: space.id,
						kind,
						name,
						...(kind === "credit" ? { closingDay: 3, dueDay: 10 } : {}),
					});
				const checking = await make("checking", "Conta corrente");
				const savings = await make("savings", "Reserva");
				const card = await make("credit", "Cartao");
				for (const [to, description] of [
					[savings.id, "Guardar"],
					[card.id, "Pagamento"],
				] as const) {
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "transfer",
						amount: 10_000,
						happenedOn: "2026-09-10",
						description,
						accountId: checking.id,
						counterAccountId: to,
					});
				}

				const rows = await fixture.asAna.backup.recordsForExport(space.id);
				const read = rows.map((row) => [row.description, row.counterKind]);
				expect(read.sort()).toEqual([
					["Guardar", "savings"],
					["Pagamento", "credit"],
				]);
			} finally {
				await fixture.close();
			}
		});

		it("gives a logger the records of that logger, and no others", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
				});
				await fixture.asAna.members.invite({
					spaceId: space.id,
					userId: fixture.joao.id,
					role: "logger",
				});
				await fixture.asJoao.members.accept(space.id);

				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Mercado do bairro",
					accountId: account.id,
				});
				await fixture.asJoao.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 1200,
					happenedOn: "2026-09-11",
					description: "Pao",
					accountId: account.id,
				});

				// The list already kept the role. The spreadsheet did not, and it is the
				// same space read through a different door.
				expect(await fixture.asJoao.transactions.list({ spaceId: space.id })).toHaveLength(1);

				const mine = await fixture.asJoao.backup.recordsForExport(space.id);
				expect(mine.map((row) => row.description)).toEqual(["Pao"]);

				const hers = await fixture.asAna.backup.recordsForExport(space.id);
				expect(hers).toHaveLength(2);
			} finally {
				await fixture.close();
			}
		});

		/**
		 * One file whether it holds one space or nine. Two shapes of file meant two
		 * buttons with two names, and somebody deciding which of the two was the backup.
		 */
		it("hands over the spaces that were chosen, and says which ones may be", async () => {
			const fixture = await prepare(adapter);
			try {
				const mine = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const house = await fixture.asAna.spaces.create({ name: "Casa" });
				const theirs = await fixture.asJoao.spaces.create({ name: "Casa do Joao" });
				await fixture.asJoao.members.invite({
					spaceId: theirs.id,
					userId: fixture.ana.id,
					role: "viewer",
				});
				await fixture.asAna.members.accept(theirs.id);
				await fixture.asAna.refresh();

				// Three spaces in reach, and one of them is somebody else's to copy.
				expect((await fixture.asAna.spaces.list()).length).toBe(3);
				expect((await fixture.asAna.backup.copyable()).sort()).toEqual([mine.id, house.id].sort());

				const one = await fixture.asAna.backup.exportSpaces([house.id]);
				expect(one.spaces.map((space) => space.name)).toEqual(["Casa"]);

				const both = await fixture.asAna.backup.exportSpaces([mine.id, house.id]);
				expect(both.spaces.map((space) => space.name)).toEqual(["Pessoal", "Casa"]);

				// Asking for one that is only readable is refused rather than quietly
				// dropped, because a file that silently holds less than it was asked for
				// is a backup somebody trusts and should not.
				await expect(fixture.asAna.backup.exportSpaces([theirs.id])).rejects.toBeInstanceOf(
					PermissionError,
				);

				// And everything is still the same list, taken without being asked twice.
				expect(
					(await fixture.asAna.backup.exportEverything()).spaces.map((one) => one.name),
				).toEqual(["Pessoal", "Casa"]);
			} finally {
				await fixture.close();
			}
		});

		it("brings back only the spaces that were ticked", async () => {
			const fixture = await prepare(adapter);
			const other = await elsewhere([fixture.ana], fixture.ana, "restoreSome");
			try {
				const mine = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const house = await fixture.asAna.spaces.create({ name: "Casa" });
				for (const spaceId of [mine.id, house.id]) {
					await fixture.asAna.accounts.create({ spaceId, kind: "cash", name: "Dinheiro" });
				}

				const backup = await fixture.asAna.backup.exportEverything();
				expect(backup.spaces).toHaveLength(2);

				const result = await other.session.backup.restore(backup, { only: [house.id] });
				expect(result.spaces.map((space) => space.name)).toEqual(["Casa"]);

				await other.session.refresh();
				expect((await other.session.spaces.list()).map((space) => space.name)).toEqual(["Casa"]);
			} finally {
				await other.close();
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

	/**
	 * The other direction, and the one that had never been covered: a file coming back
	 * into a space this database already holds. Every earlier case above restores into a
	 * database that had never seen the space, which is the easy half.
	 */
	describe("bringing a backup into a space that is already here", () => {
		it("adds what is missing and leaves alone what is not", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta da casa",
				});
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: account.id,
				});

				const backup = await fixture.asAna.backup.exportSpace(space.id);

				// Something written after the file was saved, which the file knows nothing
				// about and must survive it.
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 1000,
					happenedOn: "2026-09-11",
					description: "Cafe",
					accountId: account.id,
				});

				const result = await fixture.asAna.backup.restore(backup);
				expect(result.spaces[0]?.created).toBe(false);
				expect(result.spaces[0]?.spaceId).toBe(space.id);
				expect(result.spaces[0]?.written).toBe(0);

				const after = await fixture.asAna.transactions.list({ spaceId: space.id });
				expect(after.map((one) => one.description).sort()).toEqual(["Cafe", "Mercado"]);
				expect(await fixture.asAna.accounts.list(space.id)).toHaveLength(1);
				expect(
					(await fixture.asAna.spaces.list()).filter((one) => one.id === space.id),
				).toHaveLength(1);
			} finally {
				await fixture.close();
			}
		});

		it("asks for the role that exporting asks for, when the space is already here", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Casa" });
				await fixture.asAna.members.invite({
					spaceId: space.id,
					userId: fixture.joao.id,
					role: "editor",
				});
				await fixture.asJoao.members.accept(space.id);
				await fixture.asJoao.refresh();

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

				// Ana may export it, so Ana may pour it back.
				const backup = await fixture.asAna.backup.exportSpace(space.id);
				await expect(fixture.asAna.backup.restore(backup)).resolves.toBeTruthy();

				// An editor writes one record at a time and does not pour a whole space in.
				await expect(fixture.asJoao.backup.restore(backup)).rejects.toBeInstanceOf(PermissionError);
			} finally {
				await fixture.close();
			}
		});

		/**
		 * The file written to meet another device, read by the door that brings a space
		 * home. Somebody whose only copy is that file used to be sent back to a device
		 * they no longer have.
		 */
		it("reads the file kept for syncing, and merges a personal space like a backup", async () => {
			const fixture = await prepare(adapter);
			const other = await elsewhere([fixture.ana], fixture.ana, "bundleAsBackup");
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta corrente",
					initialBalance: 100_000,
				});
				const category = await fixture.asAna.categories.create({
					spaceId: space.id,
					name: "Mercado",
					kind: "expense",
				});
				const [kept] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Mercado do bairro",
					accountId: account.id,
					categoryId: category.id,
				});
				const [gone] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 999,
					happenedOn: "2026-09-11",
					description: "Apagado",
					accountId: account.id,
				});
				await fixture.asAna.transactions.remove(gone?.id ?? "");
				// An edit after the fact, so the fold has more than one entry to resolve.
				await fixture.asAna.transactions.update(kept?.id ?? "", { description: "Mercado da rua" });

				const bundle: SyncBundle = {
					format: BUNDLE_FORMAT,
					version: BUNDLE_VERSION,
					spaceId: space.id,
					changes: replicableOnly(await changesSince(fixture.driver, space.id, null, 20_000)),
					people: await peopleInSpace(fixture.driver, space.id),
					writtenAt: 1_760_000_000_000,
				};

				const asBackup = backupFromBundle(bundle);
				expect(asBackup.format).toBe("cofre.backup");
				expect(asBackup.spaces[0]?.name).toBe("Pessoal");
				expect(asBackup.spaces[0]?.kind).toBe("personal");
				// The deleted one is left out, the way an export leaves it out, and the
				// edit won.
				expect(asBackup.spaces[0]?.tables.transactions).toHaveLength(1);
				expect(asBackup.spaces[0]?.tables.transactions?.[0]?.description).toBe("Mercado da rua");

				// The device is gone and this is a new one, which already made a personal
				// space of its own the moment somebody opened it.
				const fresh = await other.session.spaces.create({ name: "Pessoal", kind: "personal" });
				const result = await other.session.backup.restore(asBackup);

				expect(result.spaces[0]?.created).toBe(false);
				expect(result.spaces[0]?.spaceId).toBe(fresh.id);
				expect((await other.session.spaces.list()).length).toBe(1);

				const records = await other.session.transactions.list({ spaceId: fresh.id });
				expect(records.map((one) => one.description)).toEqual(["Mercado da rua"]);
				expect(records[0]?.amount).toBe(-4290);
				expect(records[0]?.categoryId).toBe(category.id);
				expect(
					(await other.session.accounts.list(fresh.id)).map((one) => one.initialBalance),
				).toEqual([100_000]);
			} finally {
				await other.close();
				await fixture.close();
			}
		});

		it("refuses a sync file that never carried the space itself", async () => {
			expect(() =>
				backupFromBundle({
					format: BUNDLE_FORMAT,
					version: BUNDLE_VERSION,
					spaceId: "01a00000-0000-7000-8000-000000000000",
					changes: [],
					people: [],
					writtenAt: 0,
				}),
			).toThrow(RuleError);
		});
	});
}
