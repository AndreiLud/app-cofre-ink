// Taking the data away, on every adapter.
//
// Two things have to be true of a destructive action, and neither is obvious from
// reading the code. What it says it will erase has to actually leave the database, not
// merely stop being listed. And what it does not name has to be untouched, including the
// other spaces of the same person and the spaces of everybody else.
//
// So these tests count rows in the tables themselves rather than asking a repository,
// because a repository that hides a row and a database that no longer holds it look the
// same from the outside, and the whole point here is the difference.

import { describe, expect, it } from "vitest";
import type { Driver } from "../driver.ts";
import { NotFoundError, PermissionError } from "../errors.ts";
import type { Session } from "../session.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

async function countRows(driver: Driver, table: string, spaceId: string): Promise<number> {
	const rows = await driver.all(
		`SELECT COUNT(*) AS how_many FROM "${table}" WHERE "space_id" = ?`,
		[spaceId],
	);
	return Number(rows[0]?.how_many ?? 0);
}

/** A space with something in every corner of it, so an erasure has something to miss. */
async function furnish(session: Session): Promise<{ spaceId: string }> {
	const space = await session.spaces.create({ name: "Casa" });
	const account = await session.accounts.create({
		spaceId: space.id,
		kind: "checking",
		name: "Conta",
		initialBalance: 100_000,
	});
	await session.cards.create({
		spaceId: space.id,
		kind: "debit",
		name: "Debito",
		debitAccountId: account.id,
	});
	// Two levels, because a category points at its parent and refuses to be left
	// dangling: erasing the lot in one statement trips over that pointer unless the
	// children go first. Flat categories would let that bug through.
	const parent = await session.categories.create({
		spaceId: space.id,
		name: "Casa",
		kind: "expense",
	});
	const category = await session.categories.create({
		spaceId: space.id,
		name: "Mercado",
		kind: "expense",
		parentId: parent.id,
	});
	await session.transactions.create({
		spaceId: space.id,
		kind: "expense",
		amount: 4_290,
		happenedOn: "2026-09-10",
		description: "Feira",
		accountId: account.id,
		categoryId: category.id,
	});
	await session.budgets.create({ spaceId: space.id, scope: "total", amount: 300_000 });
	await session.savedFilters.create({
		spaceId: space.id,
		name: "Deste mes",
		query: { month: "2026-09" },
	});
	return { spaceId: space.id };
}

const FILLED = ["accounts", "cards", "categories", "transactions", "budgets", "saved_filters"];

export function runErasureConformance(adapter: AdapterUnderTest): void {
	describe("taking the data away", () => {
		it("leaves nothing of a shared space, in the tables themselves", async () => {
			const fixture = await prepare(adapter);
			try {
				const { spaceId } = await furnish(fixture.asAna);

				for (const table of FILLED) {
					expect(await countRows(fixture.driver, table, spaceId), table).toBeGreaterThan(0);
				}
				expect(await countRows(fixture.driver, "changes", spaceId)).toBeGreaterThan(0);

				const result = await fixture.asAna.erasure.eraseSpace(spaceId);
				expect(result.name).toBe("Casa");
				expect(result.spaceRemoved).toBe(true);
				expect(result.rows).toBeGreaterThan(0);

				// Not hidden. Gone.
				for (const table of FILLED) {
					expect(await countRows(fixture.driver, table, spaceId), table).toBe(0);
				}
				expect(await countRows(fixture.driver, "changes", spaceId)).toBe(0);
				expect(await countRows(fixture.driver, "space_members", spaceId)).toBe(0);
				expect(
					await fixture.driver.all(`SELECT "id" FROM "spaces" WHERE "id" = ?`, [spaceId]),
				).toHaveLength(0);

				expect(await fixture.asAna.spaces.list()).toEqual([]);
			} finally {
				await fixture.close();
			}
		});

		it("empties the personal space and leaves the space itself standing", async () => {
			const fixture = await prepare(adapter);
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
					amount: 1_000,
					happenedOn: "2026-09-10",
					description: "Cafe",
					accountId: account.id,
				});

				const result = await fixture.asAna.erasure.eraseSpace(space.id);
				expect(result.spaceRemoved).toBe(false);

				// The application needs a personal space, so it comes back empty rather
				// than not coming back.
				expect((await fixture.asAna.spaces.list()).map((one) => one.name)).toEqual(["Pessoal"]);
				expect(await fixture.asAna.accounts.list(space.id)).toEqual([]);
				expect(await fixture.asAna.transactions.list({ spaceId: space.id })).toEqual([]);
				expect(await countRows(fixture.driver, "transactions", space.id)).toBe(0);
			} finally {
				await fixture.close();
			}
		});

		it("never reaches the other spaces of the same person", async () => {
			const fixture = await prepare(adapter);
			try {
				const personal = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				await fixture.asAna.accounts.create({
					spaceId: personal.id,
					kind: "cash",
					name: "Carteira",
					initialBalance: 5_000,
				});
				const { spaceId } = await furnish(fixture.asAna);

				await fixture.asAna.erasure.eraseSpace(spaceId);

				expect((await fixture.asAna.spaces.list()).map((one) => one.name)).toEqual(["Pessoal"]);
				expect((await fixture.asAna.accounts.list(personal.id)).map((one) => one.name)).toEqual([
					"Carteira",
				]);
			} finally {
				await fixture.close();
			}
		});

		it("refuses anybody who is not the owner, and hides it from anybody outside", async () => {
			const fixture = await prepare(adapter);
			try {
				const { spaceId } = await furnish(fixture.asAna);
				await fixture.asAna.members.invite({
					spaceId,
					userId: fixture.joao.id,
					role: "admin",
				});
				await fixture.asJoao.members.accept(spaceId);

				// An admin runs the space day to day and still cannot empty it.
				await expect(fixture.asJoao.erasure.eraseSpace(spaceId)).rejects.toBeInstanceOf(
					PermissionError,
				);
				// And somebody outside is told there is no such space.
				await expect(fixture.asCarla.erasure.eraseSpace(spaceId)).rejects.toBeInstanceOf(
					NotFoundError,
				);

				expect(await countRows(fixture.driver, "transactions", spaceId)).toBe(1);
			} finally {
				await fixture.close();
			}
		});

		it("sweeps a space that was thrown away before, rows and all", async () => {
			const fixture = await prepare(adapter);
			try {
				await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const { spaceId } = await furnish(fixture.asAna);

				// Removing a space marks it deleted and leaves its rows behind, so that
				// the deletion can travel. They are unreachable from that moment on.
				await fixture.asAna.spaces.remove(spaceId);
				expect(await countRows(fixture.driver, "transactions", spaceId)).toBe(1);

				await fixture.asAna.erasure.eraseEverything();
				expect(await countRows(fixture.driver, "transactions", spaceId)).toBe(0);
				expect(
					await fixture.driver.all(`SELECT "id" FROM "spaces" WHERE "id" = ?`, [spaceId]),
				).toHaveLength(0);
			} finally {
				await fixture.close();
			}
		});

		it("erases what belongs to the person and leaves what belongs to others", async () => {
			const fixture = await prepare(adapter);
			try {
				const personal = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				await fixture.asAna.accounts.create({
					spaceId: personal.id,
					kind: "cash",
					name: "Carteira",
				});
				const mine = await furnish(fixture.asAna);

				// A space of somebody else, that Ana merely belongs to.
				const theirs = await furnish(fixture.asJoao);
				await fixture.asJoao.members.invite({
					spaceId: theirs.spaceId,
					userId: fixture.ana.id,
					role: "editor",
				});
				await fixture.asAna.members.accept(theirs.spaceId);

				const result = await fixture.asAna.erasure.eraseEverything();
				expect(result.erased.map((one) => one.name).sort()).toEqual(["Casa", "Pessoal"]);
				expect(result.left).toBe(1);

				expect(await countRows(fixture.driver, "transactions", mine.spaceId)).toBe(0);
				expect(await countRows(fixture.driver, "transactions", personal.id)).toBe(0);
				// The personal space is the one thing that comes back, empty, because the
				// application needs one and the account it belongs to still exists.
				expect((await fixture.asAna.spaces.list()).map((one) => one.name)).toEqual(["Pessoal"]);

				// The space of the other person is untouched, and he is still in it.
				expect(await countRows(fixture.driver, "transactions", theirs.spaceId)).toBe(1);
				expect((await fixture.asJoao.spaces.list()).map((one) => one.name)).toEqual(["Casa"]);
			} finally {
				await fixture.close();
			}
		});
	});
}
