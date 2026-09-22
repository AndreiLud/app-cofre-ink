// One suite, every adapter.
//
// A storage adapter is finished when this file is green against it. That is the whole
// promise of the repository layer: the browser, the server and the cloud behave the
// same, including who is allowed to see what.

import {
	columnsQuery,
	differences,
	MIGRATIONS,
	SCHEMA,
	type ShapeRow,
	shapeOfRows,
	shapeOfSchema,
} from "@cofre/db";
import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, PERMISSIONS, type Permission, type Role } from "../actor.ts";
import { NotFoundError, PermissionError, RuleError } from "../errors.ts";
import { migrate } from "../migrate.ts";
import { createUser } from "../repositories/users.ts";
import type { Session } from "../session.ts";
import { runAdviceConformance } from "./advice.ts";
import { runCardConformance } from "./cards.ts";
import { runCategoryConformance } from "./categories.ts";
import { runFutureConformance } from "./future.ts";
import { runPlanConformance } from "./plan.ts";
import { runPortabilityConformance } from "./portability.ts";
import { runReportConformance } from "./reports.ts";
import { runRuleConformance } from "./rules.ts";
import { runSavedFilterConformance } from "./savedFilters.ts";
import { type AdapterUnderTest, type Fixture, prepare } from "./setup.ts";
import { runSyncConformance } from "./sync.ts";
import { runTransactionConformance } from "./transactions.ts";

type ProbeContext = {
	spaceId: string;
	accountId: string;
	transactionId: string;
	guestId: string;
};

type Probe = {
	permission: Permission;
	run: (session: Session, context: ProbeContext) => Promise<unknown>;
};

const PROBES: Probe[] = [
	{ permission: "space.read", run: (session, where) => session.spaces.get(where.spaceId) },
	{
		permission: "space.update",
		run: (session, where) => session.spaces.update(where.spaceId, { name: "Outro nome" }),
	},
	{ permission: "space.delete", run: (session, where) => session.spaces.remove(where.spaceId) },
	{ permission: "space.leave", run: (session, where) => session.members.leave(where.spaceId) },
	{ permission: "member.read", run: (session, where) => session.members.list(where.spaceId) },
	{
		permission: "member.invite",
		run: (session, where) =>
			session.members.invite({ spaceId: where.spaceId, userId: where.guestId, role: "viewer" }),
	},
	{
		permission: "member.changeRole",
		run: (session, where) => session.members.changeRole(where.spaceId, where.guestId, "editor"),
	},
	{
		permission: "member.remove",
		run: (session, where) => session.members.remove(where.spaceId, where.guestId),
	},
	{ permission: "account.read", run: (session, where) => session.accounts.list(where.spaceId) },
	{
		permission: "account.create",
		run: (session, where) =>
			session.accounts.create({ spaceId: where.spaceId, kind: "cash", name: "Dinheiro" }),
	},
	{
		permission: "account.update",
		run: (session, where) => session.accounts.update(where.accountId, { name: "Renomeada" }),
	},
	{
		permission: "account.archive",
		run: (session, where) => session.accounts.archive(where.accountId),
	},
	{
		permission: "account.delete",
		run: (session, where) => session.accounts.remove(where.accountId),
	},
	// A card holds no money and shows nothing a person could not already see, so it
	// borrows the words of the accounts rather than inventing five roles of its own.
	{ permission: "account.read", run: (session, where) => session.cards.list(where.spaceId) },
	{
		permission: "account.create",
		run: (session, where) =>
			session.cards.create({
				spaceId: where.spaceId,
				kind: "debit",
				name: "Debito",
				debitAccountId: where.accountId,
			}),
	},
	{
		permission: "transaction.read",
		run: (session, where) => session.transactions.list({ spaceId: where.spaceId }),
	},
	{
		permission: "transaction.create",
		run: (session, where) =>
			session.transactions.create({
				spaceId: where.spaceId,
				kind: "expense",
				amount: 1000,
				happenedOn: "2026-09-10",
				description: "Cafe",
				accountId: where.accountId,
			}),
	},
	{
		permission: "transaction.update",
		run: (session, where) =>
			session.transactions.update(where.transactionId, { description: "Outro" }),
	},
	{
		permission: "transaction.delete",
		run: (session, where) => session.transactions.remove(where.transactionId),
	},
	{
		permission: "transaction.reconcile",
		run: (session, where) => session.transactions.reconcile(where.transactionId, true),
	},
	{
		permission: "category.read",
		run: (session, where) => session.categories.list(where.spaceId),
	},
	{
		permission: "category.write",
		run: (session, where) =>
			session.categories.create({ spaceId: where.spaceId, name: "Padaria", kind: "expense" }),
	},
	{
		permission: "rule.read",
		run: (session, where) => session.rules.list(where.spaceId),
	},
	{
		permission: "rule.write",
		run: (session, where) => session.rules.applyToExisting({ spaceId: where.spaceId }),
	},
	{
		permission: "recurrence.read",
		run: (session, where) => session.recurrences.list(where.spaceId),
	},
	{
		permission: "recurrence.write",
		run: (session, where) =>
			session.recurrences.create({
				spaceId: where.spaceId,
				description: "Assinatura",
				kind: "expense",
				amount: 2000,
				accountId: where.accountId,
				frequency: "monthly",
				startsOn: "2026-09-10",
			}),
	},
	{
		permission: "plan.read",
		run: (session, where) => session.budgets.list(where.spaceId),
	},
	{
		permission: "plan.write",
		run: (session, where) =>
			session.budgets.create({ spaceId: where.spaceId, scope: "total", amount: 100_000 }),
	},
	{
		permission: "sharing.read",
		run: (session, where) => session.sharing.balances(where.spaceId),
	},
	{
		permission: "sharing.write",
		run: (session, where) =>
			session.sharing.split({ transactionId: where.transactionId, method: "evenly" }),
	},
	{
		permission: "filter.read",
		run: (session, where) => session.savedFilters.list(where.spaceId),
	},
	{
		permission: "filter.write",
		run: (session, where) =>
			session.savedFilters.create({
				spaceId: where.spaceId,
				name: "Deste mes",
				query: { month: "2026-09" },
			}),
	},
	{
		permission: "activity.read",
		run: (session, where) => session.changes.list({ spaceId: where.spaceId }),
	},
	{
		permission: "backup.export",
		run: (session, where) => session.backup.exportSpace(where.spaceId),
	},
	{
		permission: "investment.read",
		run: (session, where) => session.investments.list(where.spaceId),
	},
	{
		permission: "investment.write",
		run: (session, where) =>
			session.investments.create({
				spaceId: where.spaceId,
				accountId: where.accountId,
				name: "Fundo",
				kind: "fund",
				quantity: 100_000_000,
				unitPrice: 10_000,
			}),
	},
];

export function runConformanceSuite(adapter: AdapterUnderTest): void {
	describe(`storage adapter: ${adapter.name}`, () => {
		describe("migrations", () => {
			it("creates the schema once and stays quiet afterwards", async () => {
				const driver = await adapter.open();
				try {
					expect(await migrate(driver)).toEqual(MIGRATIONS.map((migration) => migration.id));
					expect(await migrate(driver)).toEqual([]);
				} finally {
					await driver.close();
				}
			});

			it("ends with exactly the schema that is described", async () => {
				const driver = await adapter.open();
				try {
					await migrate(driver);
					const rows = (await driver.all(columnsQuery(driver.dialect))) as unknown as ShapeRow[];
					expect(differences(shapeOfSchema(SCHEMA), shapeOfRows(rows))).toEqual([]);
				} finally {
					await driver.close();
				}
			});
		});

		describe("people", () => {
			it("refuses a second account with the same email", async () => {
				const fixture = await prepare(adapter);
				try {
					await expect(
						createUser(fixture.driver, { email: "ana@exemplo.com", name: "Outra Ana" }),
					).rejects.toBeInstanceOf(RuleError);
				} finally {
					await fixture.close();
				}
			});

			it("refuses something that is not an email", async () => {
				const fixture = await prepare(adapter);
				try {
					await expect(
						createUser(fixture.driver, { email: "sem arroba", name: "Ninguem" }),
					).rejects.toBeInstanceOf(RuleError);
				} finally {
					await fixture.close();
				}
			});
		});

		describe("spaces", () => {
			it("gives the person who creates a space the role of owner", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
					expect(space.kind).toBe("personal");
					expect(fixture.asAna.actor.memberships).toEqual([
						{ spaceId: space.id, role: "owner", state: "active" },
					]);
				} finally {
					await fixture.close();
				}
			});

			it("allows only one personal space per person", async () => {
				const fixture = await prepare(adapter);
				try {
					await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
					await expect(
						fixture.asAna.spaces.create({ name: "Outro pessoal", kind: "personal" }),
					).rejects.toBeInstanceOf(RuleError);
				} finally {
					await fixture.close();
				}
			});

			it("lists the personal space before the shared ones", async () => {
				const fixture = await prepare(adapter);
				try {
					await fixture.asAna.spaces.create({ name: "Viagem" });
					await fixture.asAna.spaces.create({ name: "Casa" });
					await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
					expect((await fixture.asAna.spaces.list()).map((space) => space.name)).toEqual([
						"Pessoal",
						"Casa",
						"Viagem",
					]);
				} finally {
					await fixture.close();
				}
			});

			it("hides a space from anyone who is not a member", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
					expect(await fixture.asJoao.spaces.list()).toEqual([]);
					await expect(fixture.asJoao.spaces.get(space.id)).rejects.toBeInstanceOf(NotFoundError);
				} finally {
					await fixture.close();
				}
			});

			it("refuses to remove the personal space through this door", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
					await expect(fixture.asAna.spaces.remove(space.id)).rejects.toBeInstanceOf(RuleError);
				} finally {
					await fixture.close();
				}
			});
		});

		describe("membership", () => {
			it("takes someone from invited to active only when they accept", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Casa" });
					await fixture.asAna.members.invite({
						spaceId: space.id,
						userId: fixture.joao.id,
						role: "editor",
					});

					await fixture.asJoao.refresh();
					expect(await fixture.asJoao.spaces.list()).toEqual([]);

					await fixture.asJoao.members.accept(space.id);
					expect((await fixture.asJoao.spaces.list()).map((found) => found.name)).toEqual(["Casa"]);
				} finally {
					await fixture.close();
				}
			});

			it("never lets the personal space receive a member", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
					await expect(
						fixture.asAna.members.invite({
							spaceId: space.id,
							userId: fixture.joao.id,
							role: "viewer",
						}),
					).rejects.toBeInstanceOf(RuleError);
				} finally {
					await fixture.close();
				}
			});

			it("refuses to change your own role and to remove yourself", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Casa" });
					await expect(
						fixture.asAna.members.changeRole(space.id, fixture.ana.id, "viewer"),
					).rejects.toBeInstanceOf(RuleError);
					await expect(
						fixture.asAna.members.remove(space.id, fixture.ana.id),
					).rejects.toBeInstanceOf(RuleError);
				} finally {
					await fixture.close();
				}
			});

			it("keeps the owner in the space until the space is transferred", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Casa" });
					await fixture.asAna.members.invite({
						spaceId: space.id,
						userId: fixture.joao.id,
						role: "admin",
					});
					await fixture.asJoao.members.accept(space.id);

					await expect(
						fixture.asJoao.members.remove(space.id, fixture.ana.id),
					).rejects.toBeInstanceOf(RuleError);
					await expect(fixture.asAna.members.leave(space.id)).rejects.toBeInstanceOf(RuleError);

					await fixture.asAna.members.transferOwnership(space.id, fixture.joao.id);
					await fixture.asJoao.refresh();

					expect(fixture.asAna.actor.memberships[0]?.role).toBe("admin");
					expect(fixture.asJoao.actor.memberships[0]?.role).toBe("owner");
					await fixture.asAna.members.leave(space.id);
					expect(await fixture.asAna.spaces.list()).toEqual([]);
				} finally {
					await fixture.close();
				}
			});
		});

		describe("accounts", () => {
			it("keeps an opening balance as an exact integer of minor units", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
					const account = await fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "checking",
						name: "Conta corrente",
						initialBalance: 123_456_789,
					});
					expect(account.initialBalance).toBe(123_456_789);
					expect((await fixture.asAna.accounts.get(account.id)).initialBalance).toBe(123_456_789);
				} finally {
					await fixture.close();
				}
			});

			it("refuses an opening balance that is not an integer", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
					await expect(
						fixture.asAna.accounts.create({
							spaceId: space.id,
							kind: "cash",
							name: "Dinheiro",
							initialBalance: 42.9,
						}),
					).rejects.toBeInstanceOf(RuleError);
				} finally {
					await fixture.close();
				}
			});

			it("hides an archived account until it is asked for", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
					const account = await fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "savings",
						name: "Poupanca",
					});
					await fixture.asAna.accounts.archive(account.id);

					expect(await fixture.asAna.accounts.list(space.id)).toEqual([]);
					expect(
						(await fixture.asAna.accounts.list(space.id, { includeArchived: true })).length,
					).toBe(1);

					await fixture.asAna.accounts.unarchive(account.id);
					expect((await fixture.asAna.accounts.list(space.id)).length).toBe(1);
				} finally {
					await fixture.close();
				}
			});

			it("answers the same way for another space and for nothing at all", async () => {
				const fixture = await prepare(adapter);
				try {
					const anaSpace = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
					const account = await fixture.asAna.accounts.create({
						spaceId: anaSpace.id,
						kind: "checking",
						name: "Conta da Ana",
					});
					await fixture.asJoao.spaces.create({ name: "Pessoal", kind: "personal" });

					await expect(fixture.asJoao.accounts.get(account.id)).rejects.toBeInstanceOf(
						NotFoundError,
					);
					await expect(
						fixture.asJoao.accounts.get("11111111-1111-7111-8111-111111111111"),
					).rejects.toBeInstanceOf(NotFoundError);
				} finally {
					await fixture.close();
				}
			});

			it("gathers every space of the person in the consolidated view", async () => {
				const fixture = await prepare(adapter);
				try {
					const personal = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
					const house = await fixture.asAna.spaces.create({ name: "Casa" });
					await fixture.asAna.accounts.create({
						spaceId: personal.id,
						kind: "checking",
						name: "Conta da Ana",
					});
					await fixture.asAna.accounts.create({
						spaceId: house.id,
						kind: "checking",
						name: "Conta da casa",
					});

					const everywhere = await fixture.asAna.accounts.listEverywhere();
					expect(everywhere.map((account) => account.name)).toEqual([
						"Conta da Ana",
						"Conta da casa",
					]);

					await fixture.asJoao.spaces.create({ name: "Pessoal", kind: "personal" });
					expect(await fixture.asJoao.accounts.listEverywhere()).toEqual([]);
				} finally {
					await fixture.close();
				}
			});

			it("stops showing an account once it is removed", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
					const account = await fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "cash",
						name: "Carteira",
					});
					await fixture.asAna.accounts.remove(account.id);
					expect(await fixture.asAna.accounts.list(space.id)).toEqual([]);
					await expect(fixture.asAna.accounts.get(account.id)).rejects.toBeInstanceOf(
						NotFoundError,
					);
				} finally {
					await fixture.close();
				}
			});
		});

		describe("the change log", () => {
			it("records every write, in order, with who did it", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Casa" });
					const account = await fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "checking",
						name: "Conta da casa",
					});
					await fixture.asAna.accounts.update(account.id, { name: "Conta conjunta" });
					await fixture.asAna.accounts.remove(account.id);

					const log = await fixture.asAna.changes.list({ spaceId: space.id });
					expect(log.map((entry) => `${entry.entity}.${entry.operation}`)).toEqual([
						"spaces.insert",
						"space_members.insert",
						"accounts.insert",
						"accounts.update",
						"accounts.delete",
					]);
					expect(log.every((entry) => entry.actorId === fixture.ana.id)).toBe(true);
					expect(log.every((entry) => entry.deviceId === "deviceAna")).toBe(true);
					expect([...log.map((entry) => entry.hlc)].sort()).toEqual(log.map((entry) => entry.hlc));
					expect(log[2]?.payload.name).toBe("Conta da casa");
				} finally {
					await fixture.close();
				}
			});

			it("answers what happened after a stamp, which is what a device asks", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Casa" });
					const mark = await fixture.asAna.changes.latestStamp(space.id);
					expect(mark).not.toBeNull();

					await fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "cash",
						name: "Dinheiro",
					});

					const since = await fixture.asAna.changes.list({
						spaceId: space.id,
						after: mark ?? undefined,
					});
					expect(since.map((entry) => entry.entity)).toEqual(["accounts"]);
				} finally {
					await fixture.close();
				}
			});

			it("keeps the log of a space away from people outside it", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Casa" });
					await expect(fixture.asJoao.changes.list({ spaceId: space.id })).rejects.toBeInstanceOf(
						NotFoundError,
					);
				} finally {
					await fixture.close();
				}
			});
		});

		runTransactionConformance(adapter);
		runCardConformance(adapter);
		runCategoryConformance(adapter);
		runRuleConformance(adapter);
		runPlanConformance(adapter);
		runReportConformance(adapter);
		runSavedFilterConformance(adapter);
		runFutureConformance(adapter);
		runAdviceConformance(adapter);
		runPortabilityConformance(adapter);
		runSyncConformance(adapter);

		describe("the permission matrix", () => {
			it("covers every permission with at least one probe", () => {
				const covered = new Set(PROBES.map((probe) => probe.permission));
				expect([...ALL_PERMISSIONS].filter((permission) => !covered.has(permission))).toEqual([]);
			});

			const roles: Exclude<Role, "owner">[] = ["admin", "editor", "viewer", "logger"];

			for (const role of roles) {
				for (const probe of PROBES) {
					const allowed = (PERMISSIONS[probe.permission] as readonly Role[]).includes(role);
					it(`${allowed ? "lets" : "stops"} a ${role} run ${probe.permission}`, async () => {
						const fixture = await prepare(adapter);
						try {
							const space = await fixture.asAna.spaces.create({ name: "Casa" });
							await fixture.asAna.members.invite({
								spaceId: space.id,
								userId: fixture.joao.id,
								role,
							});
							await fixture.asJoao.members.accept(space.id);
							await fixture.asAna.members.invite({
								spaceId: space.id,
								userId: fixture.carla.id,
								role: "viewer",
							});
							await fixture.asCarla.members.accept(space.id);

							const account = await fixture.asAna.accounts.create({
								spaceId: space.id,
								kind: "checking",
								name: "Conta da casa",
							});
							const [record] = await fixture.asAna.transactions.create({
								spaceId: space.id,
								kind: "expense",
								amount: 1000,
								happenedOn: "2026-09-10",
								description: "Cafe da Ana",
								accountId: account.id,
							});

							const where = {
								spaceId: space.id,
								accountId: account.id,
								transactionId: record?.id ?? "",
								guestId: fixture.carla.id,
							};

							if (allowed) {
								// It may still refuse for a reason of its own, but never for lack of permission.
								await probe.run(fixture.asJoao, where).catch((error: unknown) => {
									expect(error).not.toBeInstanceOf(PermissionError);
								});
								return;
							}

							const refusal = await probe.run(fixture.asJoao, where).then(
								() => null,
								(error: unknown) => error,
							);
							expect(refusal, "it went through when it should not have").not.toBeNull();

							// A logger cannot see a record somebody else wrote, so a refusal
							// over one of those arrives as "there is no such thing", which
							// says even less than "you may not".
							const invisibleToLogger =
								role === "logger" &&
								(probe.permission === "transaction.update" ||
									probe.permission === "transaction.delete" ||
									probe.permission === "transaction.reconcile");

							if (invisibleToLogger) {
								expect(refusal instanceof PermissionError || refusal instanceof NotFoundError).toBe(
									true,
								);
							} else {
								expect(refusal).toBeInstanceOf(PermissionError);
							}
						} finally {
							await fixture.close();
						}
					});
				}
			}

			it("tells someone who is not a member that the space does not exist", async () => {
				const fixture: Fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Casa" });
					const account = await fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "checking",
						name: "Conta da casa",
					});
					const [record] = await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 1000,
						happenedOn: "2026-09-10",
						description: "Cafe da Ana",
						accountId: account.id,
					});
					const where = {
						spaceId: space.id,
						accountId: account.id,
						transactionId: record?.id ?? "",
						guestId: fixture.carla.id,
					};

					for (const probe of PROBES) {
						await expect(
							probe.run(fixture.asJoao, where),
							`${probe.permission} said too much`,
						).rejects.toBeInstanceOf(NotFoundError);
					}
				} finally {
					await fixture.close();
				}
			});
		});
	});
}

export { type AdapterUnderTest, prepare } from "./setup.ts";
