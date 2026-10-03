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

export function runSeriesWritingConformance(adapter: AdapterUnderTest): void {
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

		it("keeps the first day it wrote on the series, where a backup carries it", async () => {
			const fixture = await prepare(adapter);
			try {
				const on = await onTheDay(fixture);
				const { spaceId, series } = await aRent(on);
				expect(series.writesFrom).toBeNull();
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
				expect(logged.some((row) => said(row.payload).includes("writes_from"))).toBe(true);
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
