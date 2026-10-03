// Who writes the records of a series, and how they stay written once. Part 2, G.5 of the
// request for 2.0.0.
//
// A series writes on the day somebody opens the application, from every device and every
// request. Two requests at the same moment wrote the day twice; a day somebody said did not
// happen came back after a backup; the first day a series wrote moved when a restore wrote the
// moment the row was created again; and a series on an account that was gone kept writing.

import type { CalendarDate } from "@cofre/core";
import { describe, expect, it } from "vitest";
import { migrate } from "../migrate.ts";
import { openSession, type Session } from "../session.ts";
import { applyPeople } from "../sync.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

/** A session whose today is the twenty eighth of October of 2026, or the day given. */
async function onTheDay(
	fixture: Awaited<ReturnType<typeof prepare>>,
	day = "2026-10-28",
): Promise<Session> {
	return openSession({
		driver: fixture.driver,
		userId: fixture.ana.id,
		deviceId: `deviceAna${day}`,
		now: () => Date.parse(`${day}T12:00:00-03:00`),
	});
}

/** A rent of R$ 1.450,00 on the fifth, written down on the twenty eighth of October. */
async function aRent(on: Session) {
	const space = await on.spaces.create({ name: "Casa" });
	const account = await on.accounts.create({
		spaceId: space.id,
		kind: "checking",
		name: "Corrente",
		initialBalance: 500_000,
	});
	const series = await on.recurrences.create({
		spaceId: space.id,
		description: "Aluguel",
		kind: "expense",
		amount: 145_000,
		accountId: account.id,
		frequency: "monthly",
		startsOn: "2026-10-05" as CalendarDate,
		dayOfMonth: 5,
	});
	return { spaceId: space.id, accountId: account.id, series };
}

async function daysOf(on: Session, spaceId: string): Promise<string[]> {
	return (await on.transactions.list({ spaceId }))
		.filter((one) => one.recurrenceId !== null)
		.map((one) => one.happenedOn)
		.sort();
}

/** The records of the series of a space, as [day, amount], oldest first. */
async function amountsOf(on: Session, spaceId: string): Promise<[string, number][]> {
	return (await on.transactions.list({ spaceId }))
		.filter((one) => one.recurrenceId !== null)
		.map((one): [string, number] => [one.happenedOn, one.amount])
		.sort(([left], [right]) => left.localeCompare(right));
}

export function runSeriesWritingConformance(adapter: AdapterUnderTest): void {
	/**
	 * Part 2, G.4 of the request for 2.0.0: a rent of R$ 1.450,00 on the fifth, written down on
	 * the first of October, changes to R$ 1.500,00 on the twenty eighth.
	 */
	describe("a change to a series, from the next occurrence on", () => {
		async function writtenOnTheFirst(fixture: Awaited<ReturnType<typeof prepare>>) {
			const first = await onTheDay(fixture, "2026-10-01");
			const rent = await aRent(first);
			await first.recurrences.materialize({ spaceId: rent.spaceId });
			return rent;
		}

		it("keeps what happened, and writes the new amount on the days ahead, once", async () => {
			const fixture = await prepare(adapter);
			try {
				const { spaceId, series } = await writtenOnTheFirst(fixture);
				const on = await onTheDay(fixture);
				await on.recurrences.update(series.id, { amount: 150_000 });
				await on.recurrences.materialize({ spaceId });
				expect(await amountsOf(on, spaceId)).toEqual([
					["2026-10-05", -145_000],
					["2026-11-05", -150_000],
					["2026-12-05", -150_000],
				]);
				// One line, with the amount it has now.
				const [head] = await on.recurrences.list(spaceId);
				expect(head?.amount).toBe(150_000);
				// And one list of what it wrote, through the series before it too.
				const listed = await on.transactions.list({ spaceId, recurrenceId: head?.id ?? "" });
				expect(listed.map((one) => one.happenedOn).sort()).toEqual([
					"2026-10-05",
					"2026-11-05",
					"2026-12-05",
				]);
				const fromTheFirst = await on.transactions.summarize({ spaceId, recurrenceId: series.id });
				expect([fromTheFirst.count, fromTheFirst.expense]).toEqual([3, 445_000]);
			} finally {
				await fixture.close();
			}
		});

		it("leaves a day somebody changed by hand, and writes nothing else in its month", async () => {
			const fixture = await prepare(adapter);
			try {
				const { spaceId, series } = await writtenOnTheFirst(fixture);
				const on = await onTheDay(fixture);
				const november = (await on.transactions.list({ spaceId })).find(
					(one) => one.happenedOn === "2026-11-05",
				);
				await on.transactions.update(november?.id ?? "", { amount: 146_000 });
				await on.recurrences.update(series.id, { amount: 150_000 });
				await on.recurrences.materialize({ spaceId });
				expect(await amountsOf(on, spaceId)).toEqual([
					["2026-10-05", -145_000],
					["2026-11-05", -146_000],
					["2026-12-05", -150_000],
				]);
			} finally {
				await fixture.close();
			}
		});

		it("moves the day of the month from the next month on", async () => {
			const fixture = await prepare(adapter);
			try {
				const { spaceId, series } = await writtenOnTheFirst(fixture);
				const on = await onTheDay(fixture);
				await on.recurrences.update(series.id, { dayOfMonth: 10 });
				await on.recurrences.materialize({ spaceId });
				expect((await amountsOf(on, spaceId)).map(([day]) => day)).toEqual([
					"2026-10-05",
					"2026-11-10",
					"2026-12-10",
				]);
			} finally {
				await fixture.close();
			}
		});

		it("writes nothing for the months it was on hold", async () => {
			const fixture = await prepare(adapter);
			try {
				const march = await onTheDay(fixture, "2026-03-05");
				const space = await march.spaces.create({ name: "Casa" });
				const account = await march.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Corrente",
				});
				const series = await march.recurrences.create({
					spaceId: space.id,
					description: "Aluguel",
					kind: "expense",
					amount: 145_000,
					accountId: account.id,
					frequency: "monthly",
					startsOn: "2026-03-05" as CalendarDate,
				});
				await march.recurrences.materialize({ spaceId: space.id });

				const april = await onTheDay(fixture, "2026-04-10");
				await april.recurrences.update(series.id, { paused: true });

				const on = await onTheDay(fixture);
				await on.recurrences.update(series.id, { paused: false });
				await on.recurrences.materialize({ spaceId: space.id });
				expect((await amountsOf(on, space.id)).map(([day]) => day)).toEqual([
					"2026-03-05",
					"2026-04-05",
					"2026-11-05",
					"2026-12-05",
				]);
			} finally {
				await fixture.close();
			}
		});

		it("still leaves a day changed by hand after a restore", async () => {
			// A restore writes the two moments of every row as the moment of the restore, so a
			// record changed by hand would look untouched to anything that read the moments.
			const fixture = await prepare(adapter);
			const driver = adapter.openAnother
				? await adapter.openAnother("seriesRestoredThenChanged")
				: await adapter.open();
			try {
				const { spaceId, series } = await writtenOnTheFirst(fixture);
				const first = await onTheDay(fixture, "2026-10-01");
				const november = (await first.transactions.list({ spaceId })).find(
					(one) => one.happenedOn === "2026-11-05",
				);
				await first.transactions.update(november?.id ?? "", {
					description: "Aluguel e condominio",
				});
				const backup = await first.backup.exportSpace(spaceId);

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
					now: () => Date.parse("2026-10-28T12:00:00-03:00"),
				});
				await there.backup.restore(backup);
				await there.refresh();
				await there.recurrences.update(series.id, { amount: 150_000 });
				await there.recurrences.materialize({ spaceId });
				const kept = (await there.transactions.list({ spaceId })).filter((one) =>
					one.happenedOn.startsWith("2026-11"),
				);
				expect(kept.map((one) => [one.description, one.amount])).toEqual([
					["Aluguel e condominio", -145_000],
				]);
			} finally {
				await driver.close();
				await fixture.close();
			}
		});

		it("takes back only what was ahead and untouched when it is deleted, saying which first", async () => {
			const fixture = await prepare(adapter);
			try {
				const { spaceId, series } = await writtenOnTheFirst(fixture);
				const on = await onTheDay(fixture);
				const head = await on.recurrences.update(series.id, { amount: 150_000 });
				await on.recurrences.materialize({ spaceId });

				expect(await on.recurrences.removalPreview(head.id)).toEqual([
					{ day: "2026-11-05", amount: -150_000 },
					{ day: "2026-12-05", amount: -150_000 },
				]);
				expect(await on.recurrences.remove(head.id)).toBe(2);
				expect(await amountsOf(on, spaceId)).toEqual([["2026-10-05", -145_000]]);
				expect(await on.recurrences.list(spaceId)).toEqual([]);
			} finally {
				await fixture.close();
			}
		});
	});

	describe("who writes a series, and how", () => {
		it("writes a day once when two writers ask at the same moment", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = await onTheDay(fixture);
				const { spaceId } = await aRent(on);
				// At the same moment where the database takes two at once. One connection to SQLite
				// runs one transaction at a time, so there the two are one after the other, which
				// is what two requests to a server on SQLite are.
				const [first, second] =
					fixture.driver.dialect === "postgres"
						? await Promise.all([
								on.recurrences.materialize({ spaceId }),
								on.recurrences.materialize({ spaceId }),
							])
						: [
								await on.recurrences.materialize({ spaceId }),
								await on.recurrences.materialize({ spaceId }),
							];
				// The fifth of October, of November and of December, each once.
				expect(await daysOf(on, spaceId)).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
				expect((first ?? 0) + (second ?? 0)).toBe(3);
			} finally {
				await fixture.close();
			}
		});

		it("keeps a day somebody said did not happen out, after a backup and a restore", async () => {
			const fixture = await prepare(adapter);
			const driver = adapter.openAnother
				? await adapter.openAnother("seriesRestored")
				: await adapter.open();
			try {
				const on = await onTheDay(fixture);
				const { spaceId } = await aRent(on);
				await on.recurrences.materialize({ spaceId });
				const november = (await on.transactions.list({ spaceId })).find(
					(one) => one.happenedOn === "2026-11-05",
				);
				// "Não aconteceu" deletes the record of the day.
				await on.transactions.remove(november?.id ?? "");
				await on.recurrences.materialize({ spaceId });
				expect(await daysOf(on, spaceId)).toEqual(["2026-10-05", "2026-12-05"]);

				const backup = await on.backup.exportSpace(spaceId);
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
					now: () => Date.parse("2026-10-29T12:00:00-03:00"),
				});
				await there.backup.restore(backup);
				await there.refresh();
				await there.recurrences.materialize({ spaceId });
				expect(await daysOf(there, spaceId)).toEqual(["2026-10-05", "2026-12-05"]);
			} finally {
				await driver.close();
				await fixture.close();
			}
		});

		it("keeps the first day a series from before 2.0.0 wrote, where a backup carries it", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = await onTheDay(fixture);
				const { spaceId, series } = await aRent(on);
				// A series written by a release before 2.0.0 has no first day of its own.
				await fixture.driver.run(`UPDATE "recurrences" SET "writes_from" = NULL WHERE "id" = ?`, [
					series.id,
				]);
				await on.recurrences.materialize({ spaceId });
				expect((await on.recurrences.get(series.id)).writesFrom).toBe("2026-10-01");

				const backup = await on.backup.exportSpace(spaceId);
				expect(backup.spaces[0]?.tables.recurrences?.[0]?.writes_from).toBe("2026-10-01");
				// In the log as well, so another device folds it.
				const logged = await fixture.driver.all(
					`SELECT "payload" FROM "changes" WHERE "entity" = 'recurrences' AND "entity_id" = ?`,
					[series.id],
				);
				const said = (payload: unknown) =>
					typeof payload === "string" ? payload : JSON.stringify(payload);
				expect(logged.some((row) => said(row.payload).includes("2026-10-01"))).toBe(true);
			} finally {
				await fixture.close();
			}
		});

		// Part 2, G.2: "Academia", R$ 149,00, on the twenty eighth of October, every month, from
		// the form of a record. One record on the twenty eighth, carrying the series, and the
		// series itself.
		it("writes a record that repeats as its series, with the day typed once", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = await onTheDay(fixture);
				const space = await on.spaces.create({ name: "Casa" });
				const account = await on.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Corrente",
				});
				const series = await on.recurrences.startWith({
					spaceId: space.id,
					kind: "expense",
					amount: 14_900,
					accountId: account.id,
					description: "Academia",
					happenedOn: "2026-10-28" as CalendarDate,
					frequency: "monthly",
				});
				expect(await on.recurrences.materialize({ spaceId: space.id })).toBe(0);
				const written = await on.transactions.list({ spaceId: space.id });
				expect(written.map((one) => one.happenedOn).sort()).toEqual([
					"2026-10-28",
					"2026-11-28",
					"2026-12-28",
				]);
				expect(written.every((one) => one.recurrenceId === series.id)).toBe(true);
				expect((await on.recurrences.list(space.id)).map((one) => one.description)).toEqual([
					"Academia",
				]);
			} finally {
				await fixture.close();
			}
		});

		// Part 2, G.6: on the twenty eighth of October, R$ 149,00 every month since the fifth of
		// August. The screen says it writes three days already gone, R$ 447,00, and the box
		// leaves them out.
		it("writes the days already gone only when they were not left out", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = await onTheDay(fixture);
				const space = await on.spaces.create({ name: "Casa" });
				const account = await on.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Corrente",
				});
				const gym = (leavePastOut: boolean, description: string) =>
					on.recurrences.create({
						spaceId: space.id,
						description,
						kind: "expense",
						amount: 14_900,
						accountId: account.id,
						frequency: "monthly",
						startsOn: "2026-08-05" as CalendarDate,
						leavePastOut,
					});
				await gym(false, "Academia");
				await gym(true, "Pilates");
				await on.recurrences.materialize({ spaceId: space.id });
				const written = await on.transactions.list({ spaceId: space.id });
				const daysOf = (description: string) =>
					written
						.filter((one) => one.description === description)
						.map((one) => one.happenedOn)
						.sort();
				const gone = written.filter(
					(one) => one.description === "Academia" && one.happenedOn < "2026-10-28",
				);
				expect(gone.map((one) => one.happenedOn).sort()).toEqual([
					"2026-08-05",
					"2026-09-05",
					"2026-10-05",
				]);
				expect(gone.reduce((sum, one) => sum - one.amount, 0)).toBe(44_700);
				expect(daysOf("Pilates")).toEqual(["2026-11-05", "2026-12-05"]);
			} finally {
				await fixture.close();
			}
		});

		it("stops on an account put away and says why, and ends with an account deleted", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = await onTheDay(fixture);
				const { spaceId, accountId, series } = await aRent(on);
				await on.accounts.archive(accountId);
				expect(await on.recurrences.materialize({ spaceId })).toBe(0);
				expect((await on.recurrences.get(series.id)).stoppedBy).toBe("account");

				const other = await on.accounts.create({ spaceId, kind: "checking", name: "Outra" });
				const gym = await on.recurrences.create({
					spaceId,
					description: "Academia",
					kind: "expense",
					amount: 14_900,
					accountId: other.id,
					frequency: "monthly",
					startsOn: "2026-10-28" as CalendarDate,
				});
				await on.accounts.remove(other.id);
				expect((await on.recurrences.get(gym.id)).endsOn).toBe("2026-10-28");
				expect(await on.recurrences.materialize({ spaceId })).toBe(0);
			} finally {
				await fixture.close();
			}
		});

		it("gives each occurrence the card of the series", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = await onTheDay(fixture);
				const space = await on.spaces.create({ name: "Casa" });
				const checking = await on.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Corrente",
				});
				const credit = await on.accounts.create({
					spaceId: space.id,
					kind: "credit",
					name: "Nubank",
					closingDay: 3,
					dueDay: 10,
				});
				await on.cards.create({
					spaceId: space.id,
					kind: "multiple",
					name: "Titular",
					lastFour: "1111",
					creditAccountId: credit.id,
					debitAccountId: checking.id,
				});
				const second = await on.cards.create({
					spaceId: space.id,
					kind: "multiple",
					name: "Adicional",
					lastFour: "2291",
					creditAccountId: credit.id,
					debitAccountId: checking.id,
				});
				await on.recurrences.create({
					spaceId: space.id,
					description: "Streaming",
					kind: "expense",
					amount: 2790,
					accountId: credit.id,
					cardId: second.id,
					frequency: "monthly",
					startsOn: "2026-10-22" as CalendarDate,
				});
				await on.recurrences.materialize({ spaceId: space.id });
				const written = await on.transactions.list({ spaceId: space.id });
				expect(written.length).toBeGreaterThan(0);
				expect(written.every((one) => one.cardId === second.id)).toBe(true);
				// On the invoice of the card: the twenty second is after the third.
				expect(written.map((one) => [one.happenedOn, one.invoiceMonth]).sort()).toEqual([
					["2026-10-22", "2026-11"],
					["2026-11-22", "2026-12"],
					["2026-12-22", "2027-01"],
				]);
			} finally {
				await fixture.close();
			}
		});
	});
}
