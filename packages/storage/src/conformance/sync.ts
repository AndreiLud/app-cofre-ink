// Replication, on every adapter.
//
// The test registry 0003 asked for is the one at the end: the same set of changes,
// applied in different orders, has to end in the same state. Everything above it builds
// the situations that make that hard, which are two people writing at once, a deletion
// crossing an edit, and an entry that tries to grant itself a role.

import { stampAt, uuidV7 } from "@cofre/core";
import { describe, expect, it } from "vitest";
import type { Driver } from "../driver.ts";
import { NotFoundError } from "../errors.ts";
import { SETTLED_AFTER, tidyEverySpace, tidySpace } from "../housekeeping.ts";
import { migrate } from "../migrate.ts";
import type { User } from "../models.ts";
import { openSession, type Session } from "../session.ts";
import {
	applyChanges,
	applyPeople,
	changesSince,
	changesToPush,
	compactChanges,
	isReplicated,
	latestStampOf,
	peopleInSpace,
	rowOf,
} from "../sync.ts";
import {
	createMemoryStore,
	StoreConflictError,
	type SyncStore,
	syncWithStore,
} from "../syncStore.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

type Device = { driver: Driver; session: Session; close: () => Promise<void> };

export function runSyncConformance(adapter: AdapterUnderTest): void {
	/**
	 * Another device of the same person: its own database, its own device name, and the
	 * same identity, which it learns the way a real one does.
	 */
	async function otherDevice(person: User, deviceId: string): Promise<Device> {
		const driver = adapter.openAnother ? await adapter.openAnother(deviceId) : await adapter.open();
		await migrate(driver);
		await applyPeople(driver, [
			{
				id: person.id,
				email: person.email,
				name: person.name,
				image: person.image,
				createdAt: person.createdAt,
				updatedAt: person.updatedAt,
			},
		]);
		const session = await openSession({ driver, userId: person.id, deviceId });
		return { driver, session, close: () => driver.close() };
	}

	/** Everything one side has, carried to the other, people first. */
	async function carry(from: Driver, to: Driver, spaceId: string) {
		await applyPeople(to, await peopleInSpace(from, spaceId));
		return applyChanges(to, await changesToPush(from, spaceId, null), { spaceId });
	}

	describe("an entry that reaches for a space it was not sent to", () => {
		it("cannot write a row into another space by naming it in the payload", async () => {
			const fixture = await prepare(adapter);
			try {
				const mine = await fixture.asAna.spaces.create({ name: "Minha" });
				const theirs = await fixture.asJoao.spaces.create({ name: "Deles" });
				const account = await fixture.asAna.accounts.create({
					spaceId: mine.id,
					kind: "checking",
					name: "Conta",
				});

				// A real record, written properly, and then its own entry replayed with one
				// word changed. Built this way rather than by hand so the payload is
				// exactly what the product writes, and the only difference is the attack.
				await fixture.asAna.transactions.create({
					spaceId: mine.id,
					kind: "expense",
					amount: 100_000,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: account.id,
				});

				const [honest] = (await changesSince(fixture.driver, mine.id, null)).filter(
					(change) => change.entity === "transactions",
				);
				expect(honest).toBeDefined();

				const done = await applyChanges(
					fixture.driver,
					[
						{
							...(honest as NonNullable<typeof honest>),
							id: uuidV7(),
							entityId: uuidV7(),
							// The entry still says it is about my space, and the gate lets
							// it through, because the entry is honest. What it carries is not.
							payload: { ...(honest?.payload ?? {}), space_id: theirs.id },
							hlc: stampAt(Date.now() + 1000),
						},
					],
					{ spaceId: mine.id },
				);

				expect(done.applied).toBe(1);

				// It landed in the space the entry was about, and nothing reached theirs.
				const intruders = await fixture.driver.all(
					`SELECT "id" FROM "transactions" WHERE "space_id" = ?`,
					[theirs.id],
				);
				expect(intruders).toHaveLength(0);
				expect(await fixture.asAna.transactions.list({ spaceId: mine.id })).toHaveLength(2);
			} finally {
				await fixture.close();
			}
		});

		it("cannot write over a row that belongs to another space", async () => {
			const fixture = await prepare(adapter);
			try {
				const mine = await fixture.asAna.spaces.create({ name: "Minha" });
				const theirs = await fixture.asJoao.spaces.create({ name: "Deles" });
				const account = await fixture.asJoao.accounts.create({
					spaceId: theirs.id,
					kind: "checking",
					name: "Conta deles",
				});
				const [record] = await fixture.asJoao.transactions.create({
					spaceId: theirs.id,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: account.id,
				});

				// Somebody who once knew this row, pushing an entry about it under their
				// own space. This is what a removed member has: the identifiers.
				const done = await applyChanges(
					fixture.driver,
					[
						{
							id: uuidV7(),
							spaceId: mine.id,
							entity: "transactions",
							entityId: record?.id ?? "",
							operation: "update",
							payload: { amount: -1, amount_in_base: -1, description: "Mexido" },
							hlc: stampAt(Date.now() + 1000),
							deviceId: "deviceAna",
							actorId: fixture.ana.id,
							createdAt: Date.now(),
						},
					],
					{ spaceId: mine.id },
				);

				expect(done.applied).toBe(0);
				expect(done.rejected[0]?.reason).toBe("wrongSpace");

				const kept = await fixture.asJoao.transactions.get(record?.id ?? "");
				expect(kept).toMatchObject({ description: "Mercado", amount: -4290 });
			} finally {
				await fixture.close();
			}
		});

		it("refuses an entry about one space that names another as the row", async () => {
			const fixture = await prepare(adapter);
			try {
				const mine = await fixture.asAna.spaces.create({ name: "Minha" });
				const theirs = await fixture.asJoao.spaces.create({ name: "Deles" });

				const done = await applyChanges(fixture.driver, [
					{
						id: uuidV7(),
						spaceId: mine.id,
						entity: "spaces",
						entityId: theirs.id,
						operation: "update",
						payload: { name: "Tomado" },
						hlc: stampAt(Date.now() + 1000),
						deviceId: "deviceAna",
						actorId: fixture.ana.id,
						createdAt: Date.now(),
					},
				]);

				expect(done.applied).toBe(0);
				expect(done.rejected[0]?.reason).toBe("wrongSpace");
				expect((await fixture.asJoao.spaces.get(theirs.id)).name).toBe("Deles");
			} finally {
				await fixture.close();
			}
		});
	});

	describe("replication", () => {
		it("carries a space and everything in it to another database", async () => {
			const one = await prepare(adapter);
			const two = await otherDevice(one.ana, "deviceTwo");
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });
				const account = await one.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
					initialBalance: 100_000,
				});
				await one.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: account.id,
				});

				const result = await carry(one.driver, two.driver, space.id);
				expect(result.applied).toBeGreaterThan(0);
				expect(result.rejected).toEqual([]);

				const there = await rowOf(two.driver, "spaces", space.id);
				expect(String(there?.name)).toBe("Casa");

				const rows = await two.driver.all(
					`SELECT "description", "amount" FROM "transactions" WHERE "space_id" = ?`,
					[space.id],
				);
				expect(rows).toHaveLength(1);
				expect(String(rows[0]?.description)).toBe("Mercado");
				expect(Number(rows[0]?.amount)).toBe(-4290);

				const account2 = await rowOf(two.driver, "accounts", account.id);
				expect(Number(account2?.initial_balance)).toBe(100_000);
			} finally {
				await one.close();
				await two.close();
			}
		});

		it("never replicates who belongs to a space, or who anybody is", async () => {
			const one = await prepare(adapter);
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });
				await one.asAna.members.invite({
					spaceId: space.id,
					userId: one.joao.id,
					role: "viewer",
				});

				expect(isReplicated("space_members")).toBe(false);
				expect(isReplicated("space_invitations")).toBe(false);
				expect(isReplicated("users")).toBe(false);
				expect(isReplicated("auth_users")).toBe(false);
				expect(isReplicated("changes")).toBe(false);
				expect(isReplicated("spaces")).toBe(true);
				expect(isReplicated("transactions")).toBe(true);

				// Membership writes stay out of what is sent.
				const sent = await changesToPush(one.driver, space.id, null);
				expect(sent.some((change) => change.entity === "space_members")).toBe(false);

				// And one that arrives anyway is refused, not ignored.
				const refused = await applyChanges(one.driver, [
					{
						id: "11111111-1111-7111-8111-111111111111",
						spaceId: space.id,
						entity: "space_members",
						entityId: "whatever",
						operation: "update",
						payload: { role: "owner" },
						hlc: "zzzzzzzzzzzz",
						deviceId: "attacker",
						actorId: one.joao.id,
						createdAt: Date.now(),
					},
				]);

				expect(refused.applied).toBe(0);
				expect(refused.rejected[0]?.reason).toBe("entityIsNotReplicated");
			} finally {
				await one.close();
			}
		});

		it("lets a space that arrived from a device be taken by whoever pushed it", async () => {
			const one = await prepare(adapter);
			const two = await otherDevice(one.ana, "deviceTwo");
			try {
				// Born on the device, where nobody signed in to anything.
				const space = await two.session.spaces.create({ name: "Casa" });
				await two.session.accounts.create({
					spaceId: space.id,
					kind: "cash",
					name: "Dinheiro",
				});

				// What arrives at the other end is the rows, never the membership.
				await carry(two.driver, one.driver, space.id);
				expect(await one.asAna.spaces.list()).toEqual([]);

				const taken = await one.asAna.spaces.adopt(space.id);
				expect(taken.name).toBe("Casa");
				expect((await one.asAna.spaces.list()).map((found) => found.id)).toEqual([space.id]);
				expect((await one.asAna.accounts.list(space.id)).map((found) => found.name)).toEqual([
					"Dinheiro",
				]);

				// And once it belongs to somebody, nobody else can take it.
				await expect(one.asJoao.spaces.adopt(space.id)).rejects.toBeInstanceOf(NotFoundError);
			} finally {
				await one.close();
				await two.close();
			}
		});

		it("carries a space through a file, with no server in the middle", async () => {
			const one = await prepare(adapter);
			const two = await otherDevice(one.ana, "deviceTwo");
			const store = createMemoryStore("uma pasta");
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });
				const account = await one.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});
				await one.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: account.id,
				});

				// The first device puts everything in the file.
				const sent = await syncWithStore(one.driver, store, { spaceId: space.id });
				expect(sent.pushed).toBeGreaterThan(0);
				expect(sent.unchanged).toBe(false);

				// The second one reads it and ends up with the same money.
				const received = await syncWithStore(two.driver, store, { spaceId: space.id });
				expect(received.pulled).toBeGreaterThan(0);

				await two.session.spaces.adopt(space.id);
				await two.session.refresh();

				const records = await two.session.transactions.list({ spaceId: space.id });
				expect(records.map((row) => row.amount)).toEqual([-4290]);

				// And doing it again says there is nothing to say.
				expect((await syncWithStore(two.driver, store, { spaceId: space.id })).unchanged).toBe(
					true,
				);
			} finally {
				await one.close();
				await two.close();
			}
		});

		it("brings two devices together when each one wrote while apart", async () => {
			const one = await prepare(adapter);
			const two = await otherDevice(one.ana, "deviceTwo");
			const store = createMemoryStore("uma pasta");
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });
				const account = await one.asAna.accounts.create({
					spaceId: space.id,
					kind: "cash",
					name: "Dinheiro",
				});

				await syncWithStore(one.driver, store, { spaceId: space.id });
				await syncWithStore(two.driver, store, { spaceId: space.id });
				await two.session.spaces.adopt(space.id);
				await two.session.refresh();

				// Each device writes something the other has never seen.
				await one.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 1000,
					happenedOn: "2026-09-10",
					description: "Cafe",
					accountId: account.id,
				});
				await two.session.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 2000,
					happenedOn: "2026-09-11",
					description: "Padaria",
					accountId: account.id,
				});

				// Both sync, one after the other, and then the first one reads again.
				await syncWithStore(one.driver, store, { spaceId: space.id });
				await syncWithStore(two.driver, store, { spaceId: space.id });
				await syncWithStore(one.driver, store, { spaceId: space.id });

				const here = await one.asAna.transactions.list({ spaceId: space.id });
				const there = await two.session.transactions.list({ spaceId: space.id });

				expect(here.map((row) => row.description).sort()).toEqual(["Cafe", "Padaria"]);
				expect(there.map((row) => row.description).sort()).toEqual(["Cafe", "Padaria"]);
			} finally {
				await one.close();
				await two.close();
			}
		});

		it("tries again when somebody else wrote the file first", async () => {
			const one = await prepare(adapter);
			const store = createMemoryStore("uma pasta");
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });

				// A store that lets the first write through and then says the file moved,
				// which is what two devices saving at the same moment looks like.
				let refusals = 1;
				const contested: SyncStore = {
					name: store.name,
					read: (spaceId) => store.read(spaceId),
					write: async (spaceId, bundle, revision) => {
						if (refusals > 0) {
							refusals -= 1;
							throw new StoreConflictError();
						}
						return store.write(spaceId, bundle, revision);
					},
				};

				const done = await syncWithStore(one.driver, contested, { spaceId: space.id });
				expect(done.pushed).toBeGreaterThan(0);
				expect((await store.read(space.id)).bundle?.spaceId).toBe(space.id);
			} finally {
				await one.close();
			}
		});

		it("folds a settled history into one entry and leaves the money alone", async () => {
			const one = await prepare(adapter);
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });
				const account = await one.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});
				const [record] = await one.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: account.id,
				});

				// A record written, corrected twice and settled is four entries saying, in
				// the end, one thing.
				await one.asAna.transactions.update(record?.id ?? "", { description: "Mercado do bairro" });
				await one.asAna.transactions.update(record?.id ?? "", { amount: 4390 });

				const before = await changesSince(one.driver, space.id, null);
				const cut = await latestStampOf(one.driver, space.id);

				const folded = await compactChanges(one.driver, space.id, { before: cut ?? "" });
				expect(folded.removed).toBeGreaterThan(0);

				const after = await changesSince(one.driver, space.id, null);
				expect(after.length).toBe(before.length - folded.removed);

				// One entry per row, and the row says what it said.
				const rows = after.filter((change) => change.entity === "transactions");
				expect(rows).toHaveLength(1);
				expect(rows[0]?.payload.description).toBe("Mercado do bairro");
				expect(rows[0]?.payload.amount).toBe(-4390);

				const here = await one.asAna.transactions.list({ spaceId: space.id });
				expect(here[0]).toMatchObject({ description: "Mercado do bairro", amount: -4390 });
			} finally {
				await one.close();
			}
		});

		it("tidies itself, once a day, and never twice for the same month", async () => {
			const one = await prepare(adapter);
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });
				const account = await one.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
					initialBalance: 100_000,
				});
				await one.asAna.accounts.update(account.id, { name: "Conta conjunta" });
				await one.asAna.accounts.update(account.id, { initialBalance: 120_000 });

				// Nothing is old enough yet, so the pass runs and folds nothing.
				const today = await tidySpace(one.driver, space.id);
				expect(today?.removed).toBe(0);

				// A month later the same entries are settled, and are folded.
				const later = Date.now() + SETTLED_AFTER + 1000;
				const folded = await tidySpace(one.driver, space.id, later);
				expect(folded?.removed).toBeGreaterThan(0);

				// The money is exactly where it was.
				const kept = await one.asAna.accounts.list(space.id);
				expect(kept[0]).toMatchObject({ name: "Conta conjunta", initialBalance: 120_000 });

				// And an hour after that, there is nothing worth another pass.
				expect(await tidySpace(one.driver, space.id, later + 60 * 60 * 1000)).toBeNull();
			} finally {
				await one.close();
			}
		});

		it("tidies every space in the database and stops for none of them", async () => {
			const one = await prepare(adapter);
			try {
				const home = await one.asAna.spaces.create({ name: "Casa" });
				const trip = await one.asAna.spaces.create({ name: "Viagem" });

				const later = Date.now() + SETTLED_AFTER + 1000;
				const done = await tidyEverySpace(one.driver, later);

				// The personal space of each person is in the database too, so the two
				// made here are a floor and not the whole count.
				const touched = done.map((result) => result.spaceId);
				expect(touched).toContain(home.id);
				expect(touched).toContain(trip.id);
			} finally {
				await one.close();
			}
		});

		it("carries a folded log to a device that has never seen the space", async () => {
			const one = await prepare(adapter);
			const two = await otherDevice(one.ana, "deviceTwo");
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });
				const account = await one.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
					initialBalance: 100_000,
				});
				await one.asAna.accounts.update(account.id, { name: "Conta conjunta" });
				await one.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: account.id,
				});

				await compactChanges(one.driver, space.id, {
					before: (await latestStampOf(one.driver, space.id)) ?? "",
				});

				await carry(one.driver, two.driver, space.id);

				const accounts = await two.driver.all(
					`SELECT "name", "initial_balance" FROM "accounts" WHERE "space_id" = ?`,
					[space.id],
				);
				expect(String(accounts[0]?.name)).toBe("Conta conjunta");
				expect(Number(accounts[0]?.initial_balance)).toBe(100_000);

				const records = await two.driver.all(
					`SELECT "description" FROM "transactions" WHERE "space_id" = ?`,
					[space.id],
				);
				expect(records.map((row) => String(row.description))).toEqual(["Mercado"]);
			} finally {
				await one.close();
				await two.close();
			}
		});

		it("does not let a device that has not folded put the old entries back", async () => {
			const one = await prepare(adapter);
			const two = await otherDevice(one.ana, "deviceTwo");
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });
				const account = await one.asAna.accounts.create({
					spaceId: space.id,
					kind: "cash",
					name: "Dinheiro",
				});
				await one.asAna.accounts.update(account.id, { name: "Carteira" });

				// The second device takes a copy while the log is still long.
				await carry(one.driver, two.driver, space.id);
				const theirs = await changesToPush(two.driver, space.id, null);

				await compactChanges(one.driver, space.id, {
					before: (await latestStampOf(one.driver, space.id)) ?? "",
				});
				const folded = (await changesSince(one.driver, space.id, null)).length;

				// And then sends everything back, as an unfolded device would.
				const answer = await applyChanges(one.driver, theirs, { spaceId: space.id });
				expect(answer.applied).toBe(0);
				expect((await changesSince(one.driver, space.id, null)).length).toBe(folded);

				// The row is still what it was.
				const rows = await one.asAna.accounts.list(space.id);
				expect(rows.map((row) => row.name)).toEqual(["Carteira"]);
			} finally {
				await one.close();
				await two.close();
			}
		});

		it("still takes an old entry about a row it has never seen", async () => {
			const one = await prepare(adapter);
			const two = await otherDevice(one.ana, "deviceTwo");
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });
				await carry(one.driver, two.driver, space.id);
				await two.session.spaces.adopt(space.id);
				await two.session.refresh();

				// The second device writes something while the first one folds its log.
				await two.session.accounts.create({
					spaceId: space.id,
					kind: "cash",
					name: "Dinheiro do aparelho",
				});

				await compactChanges(one.driver, space.id, {
					before: (await latestStampOf(two.driver, space.id)) ?? "",
				});

				await carry(two.driver, one.driver, space.id);
				expect((await one.asAna.accounts.list(space.id)).map((row) => row.name)).toEqual([
					"Dinheiro do aparelho",
				]);
			} finally {
				await one.close();
				await two.close();
			}
		});

		it("refuses a file that holds another space", async () => {
			const one = await prepare(adapter);
			const store = createMemoryStore("uma pasta");
			try {
				const mine = await one.asAna.spaces.create({ name: "Casa" });
				const other = await one.asAna.spaces.create({ name: "Viagem" });

				await syncWithStore(one.driver, store, { spaceId: other.id });
				await expect(syncWithStore(one.driver, store, { spaceId: mine.id })).rejects.toThrow();
			} finally {
				await one.close();
			}
		});

		it("refuses an entry that belongs to another space", async () => {
			const one = await prepare(adapter);
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });
				const other = await one.asAna.spaces.create({ name: "Viagem" });
				const changes = await changesToPush(one.driver, other.id, null);

				const refused = await applyChanges(one.driver, changes, { spaceId: space.id });
				expect(refused.applied).toBe(0);
				expect(refused.rejected.every((one) => one.reason === "wrongSpace")).toBe(true);
			} finally {
				await one.close();
			}
		});

		it("keeps the later edit, and the earlier one stays in the log", async () => {
			const one = await prepare(adapter);
			const two = await otherDevice(one.ana, "deviceTwo");
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });
				const account = await one.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});
				const [record] = await one.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 1000,
					happenedOn: "2026-09-10",
					description: "Primeiro nome",
					accountId: account.id,
				});
				const id = record?.id ?? "";

				await carry(one.driver, two.driver, space.id);

				// Both devices change the same record while they cannot see each other.
				// The second one writes with a later stamp, whatever its clock says.
				await one.asAna.transactions.update(id, { description: "Do primeiro" });
				await two.driver.run(
					`INSERT INTO "changes" ("id", "space_id", "entity", "entity_id", "operation",
					 "payload", "hlc", "device_id", "actor_id", "created_at")
					 VALUES (?, ?, 'transactions', ?, 'update', ?, 'zzzzzzzzzzzz', 'deviceTwo', ?, ?)`,
					[
						"22222222-2222-7222-8222-222222222222",
						space.id,
						id,
						JSON.stringify({ description: "Do segundo" }),
						one.ana.id,
						Date.now(),
					],
				);
				await applyChanges(two.driver, [], { spaceId: space.id });

				// They meet, in both directions.
				await carry(two.driver, one.driver, space.id);
				await carry(one.driver, two.driver, space.id);

				const here = await rowOf(one.driver, "transactions", id);
				const there = await rowOf(two.driver, "transactions", id);

				expect(String(here?.description)).toBe("Do segundo");
				expect(String(there?.description)).toBe("Do segundo");

				// The edit that lost is still in the log, so nothing was hidden.
				const log = await changesSince(one.driver, space.id, null);
				expect(log.some((change) => JSON.stringify(change.payload).includes("Do primeiro"))).toBe(
					true,
				);
			} finally {
				await one.close();
				await two.close();
			}
		});

		it("keeps an edit to one field and an edit to another, made at the same time", async () => {
			const one = await prepare(adapter);
			const two = await otherDevice(one.ana, "deviceTwo");
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });
				const account = await one.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});
				const [record] = await one.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 1000,
					happenedOn: "2026-09-10",
					description: "Mercado",
					accountId: account.id,
				});
				const id = record?.id ?? "";

				await carry(one.driver, two.driver, space.id);

				// One renames it, the other writes a note, neither can see the other.
				await one.asAna.transactions.update(id, { description: "Mercado do bairro" });
				await two.driver.run(
					`INSERT INTO "changes" ("id", "space_id", "entity", "entity_id", "operation",
					 "payload", "hlc", "device_id", "actor_id", "created_at")
					 VALUES (?, ?, 'transactions', ?, 'update', ?, 'zzzzzzzzzzzz', 'deviceTwo', ?, ?)`,
					[
						"33333333-3333-7333-8333-333333333333",
						space.id,
						id,
						JSON.stringify({ notes: "Comprei fiado" }),
						one.ana.id,
						Date.now(),
					],
				);

				await carry(two.driver, one.driver, space.id);
				await carry(one.driver, two.driver, space.id);

				const here = await rowOf(one.driver, "transactions", id);
				expect(String(here?.description)).toBe("Mercado do bairro");
				expect(String(here?.notes)).toBe("Comprei fiado");
			} finally {
				await one.close();
				await two.close();
			}
		});

		it("carries a deletion, and an edit that arrives later does not undo it", async () => {
			const one = await prepare(adapter);
			const two = await otherDevice(one.ana, "deviceTwo");
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });
				const account = await one.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});
				const [record] = await one.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 1000,
					happenedOn: "2026-09-10",
					description: "Some",
					accountId: account.id,
				});
				const id = record?.id ?? "";

				await carry(one.driver, two.driver, space.id);
				await one.asAna.transactions.remove(id);
				await carry(one.driver, two.driver, space.id);

				const there = await rowOf(two.driver, "transactions", id);
				expect(there?.deleted_at).not.toBe(null);

				// An edit written before the deletion arrives later and changes nothing
				// about the row being gone.
				await two.driver.run(
					`INSERT INTO "changes" ("id", "space_id", "entity", "entity_id", "operation",
					 "payload", "hlc", "device_id", "actor_id", "created_at")
					 VALUES (?, ?, 'transactions', ?, 'update', ?, 'zzzzzzzzzzzz', 'deviceTwo', ?, ?)`,
					[
						"44444444-4444-7444-8444-444444444444",
						space.id,
						id,
						JSON.stringify({ description: "Voltou?" }),
						one.ana.id,
						Date.now(),
					],
				);
				await carry(two.driver, one.driver, space.id);

				const after = await rowOf(one.driver, "transactions", id);
				expect(after?.deleted_at).not.toBe(null);
				expect(String(after?.description)).toBe("Voltou?");
			} finally {
				await one.close();
				await two.close();
			}
		});

		it("reaches the same state whatever order the changes arrive in", async () => {
			const source = await prepare(adapter);
			const first = await otherDevice(source.ana, "deviceTwo");
			const second = await otherDevice(source.ana, "deviceThree");
			try {
				const space = await source.asAna.spaces.create({ name: "Casa" });
				const account = await source.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
					initialBalance: 50_000,
				});
				const category = await source.asAna.categories.create({
					spaceId: space.id,
					name: "Mercado",
					kind: "expense",
				});
				const [record] = await source.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Feira",
					accountId: account.id,
				});
				await source.asAna.transactions.update(record?.id ?? "", {
					description: "Feira da semana",
					categoryId: category.id,
				});
				await source.asAna.accounts.update(account.id, { name: "Conta corrente" });
				await source.asAna.transactions.settle(record?.id ?? "");

				const changes = await changesToPush(source.driver, space.id, null);
				expect(changes.length).toBeGreaterThan(5);

				const people = await peopleInSpace(source.driver, space.id);
				await applyPeople(first.driver, people);
				await applyPeople(second.driver, people);

				// One takes the set as it came. The other takes it backwards, and then in
				// two halves, which is what a device that syncs twice does.
				await applyChanges(first.driver, changes, { spaceId: space.id });

				const half = Math.ceil(changes.length / 2);
				await applyChanges(second.driver, [...changes.slice(0, half)].reverse(), {
					spaceId: space.id,
				});
				await applyChanges(second.driver, [...changes.slice(half)].reverse(), {
					spaceId: space.id,
				});

				for (const entity of ["spaces", "accounts", "categories", "transactions"]) {
					const here = await first.driver.all(
						`SELECT * FROM ${entity === "spaces" ? `"spaces" WHERE "id" = ?` : `"${entity}" WHERE "space_id" = ?`} ORDER BY "id"`,
						[space.id],
					);
					const there = await second.driver.all(
						`SELECT * FROM ${entity === "spaces" ? `"spaces" WHERE "id" = ?` : `"${entity}" WHERE "space_id" = ?`} ORDER BY "id"`,
						[space.id],
					);
					expect(there, `${entity} differs`).toEqual(here);
				}

				expect(await latestStampOf(first.driver, space.id)).toBe(
					await latestStampOf(second.driver, space.id),
				);
			} finally {
				await source.close();
				await first.close();
				await second.close();
			}
		});

		it("says nothing changed when it runs again", async () => {
			const one = await prepare(adapter);
			const two = await otherDevice(one.ana, "deviceTwo");
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });
				await one.asAna.accounts.create({ spaceId: space.id, kind: "cash", name: "Carteira" });

				const changes = await changesToPush(one.driver, space.id, null);
				await applyPeople(two.driver, await peopleInSpace(one.driver, space.id));

				const firstRun = await applyChanges(two.driver, changes, { spaceId: space.id });
				const again = await applyChanges(two.driver, changes, { spaceId: space.id });

				expect(firstRun.applied).toBe(changes.length);
				expect(again.applied).toBe(0);
				expect(again.skipped).toBe(changes.length);

				const accounts = await two.driver.all(`SELECT "id" FROM "accounts" WHERE "space_id" = ?`, [
					space.id,
				]);
				expect(accounts).toHaveLength(1);
			} finally {
				await one.close();
				await two.close();
			}
		});

		it("sends only what the other side has not seen", async () => {
			const one = await prepare(adapter);
			try {
				const space = await one.asAna.spaces.create({ name: "Casa" });
				const mark = await latestStampOf(one.driver, space.id);

				await one.asAna.accounts.create({ spaceId: space.id, kind: "cash", name: "Carteira" });

				const since = await changesToPush(one.driver, space.id, mark);
				expect(since.every((change) => change.entity === "accounts")).toBe(true);
				expect(since.length).toBe(1);
			} finally {
				await one.close();
			}
		});
	});
}
