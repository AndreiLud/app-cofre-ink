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
import { METHOD_PERMISSIONS, type RepositoryMethod } from "../methodPermissions.ts";
import { migrate } from "../migrate.ts";
import { BACKUP_FORMAT, BACKUP_VERSION } from "../repositories/backup.ts";
import { createUser } from "../repositories/users.ts";
import type { Session } from "../session.ts";
import { runAdviceConformance } from "./advice.ts";
import { runArrangementConformance } from "./arrangements.ts";
import { runCardConformance } from "./cards.ts";
import { runCategoryConformance } from "./categories.ts";
import { runErasureConformance } from "./erasure.ts";
import { runFallsDueConformance } from "./fallsDue.ts";
import { runFutureConformance } from "./future.ts";
import { runHappenedConformance } from "./happened.ts";
import { runHoldingsConformance } from "./holdings.ts";
import { runImportingConformance } from "./importing.ts";
import { runInvoiceConformance } from "./invoices.ts";
import { runListingConformance } from "./listing.ts";
import { runPlanConformance } from "./plan.ts";
import { runPlanOfPartsConformance } from "./plans.ts";
import { runPortabilityConformance } from "./portability.ts";
import { runReportConformance } from "./reports.ts";
import { runRecurrenceRepairConformance, runRuleConformance } from "./rules.ts";
import { runSavedFilterConformance } from "./savedFilters.ts";
import { runSeriesWritingConformance } from "./seriesWriting.ts";
import { type AdapterUnderTest, type Fixture, prepare } from "./setup.ts";
import { runSyncConformance } from "./sync.ts";
import { runTransactionConformance } from "./transactions.ts";
import { runUpgradeConformance } from "./upgrade.ts";

type ProbeContext = {
	spaceId: string;
	accountId: string;
	transactionId: string;
	guestId: string;
	cardId: string;
	cardAccountId: string;
	categoryId: string;
	/** A purchase in two parts on the card, for the calls that take a whole plan. */
	groupId: string;
	/** A rent written down by the owner, for the calls about one series. */
	recurrenceId: string;
	/** A holding in a broker account, and money put into it, for the calls about holdings. */
	holdingId: string;
	holdingMoveId: string;
};

type Probe = {
	/** The call it makes, so the table a screen reads can be proved against this one. */
	method: RepositoryMethod;
	permission: Permission;
	run: (session: Session, context: ProbeContext) => Promise<unknown>;
};

const PROBES: Probe[] = [
	{
		method: "spaces.get",
		permission: "space.read",
		run: (session, where) => session.spaces.get(where.spaceId),
	},
	{
		method: "spaces.update",
		permission: "space.update",
		run: (session, where) => session.spaces.update(where.spaceId, { name: "Outro nome" }),
	},
	{
		method: "spaces.remove",
		permission: "space.delete",
		run: (session, where) => session.spaces.remove(where.spaceId),
	},
	{
		method: "members.leave",
		permission: "space.leave",
		run: (session, where) => session.members.leave(where.spaceId),
	},
	{
		method: "members.list",
		permission: "member.read",
		run: (session, where) => session.members.list(where.spaceId),
	},
	{
		method: "members.invite",
		permission: "member.invite",
		run: (session, where) =>
			session.members.invite({ spaceId: where.spaceId, userId: where.guestId, role: "viewer" }),
	},
	{
		method: "members.changeRole",
		permission: "member.changeRole",
		run: (session, where) => session.members.changeRole(where.spaceId, where.guestId, "editor"),
	},
	{
		method: "members.remove",
		permission: "member.remove",
		run: (session, where) => session.members.remove(where.spaceId, where.guestId),
	},
	{
		method: "accounts.list",
		permission: "account.read",
		run: (session, where) => session.accounts.list(where.spaceId),
	},
	{
		method: "accounts.create",
		permission: "account.create",
		run: (session, where) =>
			session.accounts.create({ spaceId: where.spaceId, kind: "cash", name: "Dinheiro" }),
	},
	{
		method: "accounts.update",
		permission: "account.update",
		run: (session, where) => session.accounts.update(where.accountId, { name: "Renomeada" }),
	},
	{
		method: "accounts.archive",
		permission: "account.archive",
		run: (session, where) => session.accounts.archive(where.accountId),
	},
	{
		method: "accounts.remove",
		permission: "account.delete",
		run: (session, where) => session.accounts.remove(where.accountId),
	},
	// A card holds no money and shows nothing a person could not already see, so it
	// borrows the words of the accounts rather than inventing five roles of its own.
	{
		method: "cards.list",
		permission: "account.read",
		run: (session, where) => session.cards.list(where.spaceId),
	},
	{
		method: "cards.create",
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
		method: "transactions.list",
		permission: "transaction.read",
		run: (session, where) => session.transactions.list({ spaceId: where.spaceId }),
	},
	{
		method: "transactions.create",
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
		method: "transactions.update",
		permission: "transaction.update",
		run: (session, where) =>
			session.transactions.update(where.transactionId, { description: "Outro" }),
	},
	{
		// Editing several at once, from the selection on the records screen.
		method: "transactions.updateMany",
		permission: "transaction.update",
		run: (session, where) =>
			session.transactions.updateMany([where.transactionId], { description: "Outro" }),
	},
	{
		// Editing a part of a plan and the parts after it.
		method: "transactions.updateFrom",
		permission: "transaction.update",
		run: (session, where) =>
			session.transactions.updateFrom(where.transactionId, { description: "Outro" }),
	},
	{
		method: "transactions.remove",
		permission: "transaction.delete",
		run: (session, where) => session.transactions.remove(where.transactionId),
	},
	{
		// Removing a selection, and undoing what the quick entry just wrote.
		method: "transactions.removeMany",
		permission: "transaction.delete",
		run: (session, where) => session.transactions.removeMany([where.transactionId]),
	},
	{
		// Removing every part of a plan at once.
		method: "transactions.removeGroup",
		permission: "transaction.delete",
		run: (session, where) => session.transactions.removeGroup(where.groupId),
	},
	{
		// The button on the overview that says a promise happened.
		method: "transactions.settle",
		permission: "transaction.update",
		run: (session, where) => session.transactions.settle(where.transactionId, "2026-09-29"),
	},
	{
		// "Aconteceram todos", on the overview and on a selection.
		method: "transactions.settleMany",
		permission: "transaction.update",
		run: (session, where) => session.transactions.settleMany([where.transactionId], "2026-09-29"),
	},
	{
		// And the one beside it that pays a card invoice, which writes a transfer.
		method: "invoices.pay",
		permission: "transaction.create",
		run: (session, where) =>
			session.invoices.pay({
				accountId: where.cardAccountId,
				fromAccountId: where.accountId,
				amount: 1000,
				happenedOn: "2026-09-29",
				month: "2026-10",
				description: "Pagamento",
			}),
	},
	{
		// Every invoice before one marked paid, which writes a payment for each.
		method: "invoices.markPaidUntil",
		permission: "transaction.create",
		run: (session, where) =>
			session.invoices.markPaidUntil({
				accountId: where.cardAccountId,
				month: "2026-11",
				fromAccountId: where.accountId,
				today: "2026-10-29",
				description: "Pagamento {{month}}",
			}),
	},
	{
		// A purchase moved to the next invoice, from the invoice and from the records.
		method: "invoices.move",
		permission: "transaction.update",
		run: (session, where) => session.invoices.move(where.transactionId, "later"),
	},
	{
		// "Esta fatura fechou em", which moves the purchases of the days between.
		method: "invoices.closedOn",
		permission: "transaction.update",
		run: (session, where) =>
			session.invoices.closedOn({
				accountId: where.cardAccountId,
				month: "2026-10",
				day: "2026-10-04",
			}),
	},
	{
		// Paying an invoice with another card. Here with the same card, which a member who may
		// write is refused for that reason and not for want of permission.
		method: "invoices.payWithCard",
		permission: "transaction.create",
		run: (session, where) =>
			session.invoices.payWithCard({
				accountId: where.cardAccountId,
				month: "2026-10",
				cardAccountId: where.cardAccountId,
				amount: 1000,
				charged: 1000,
				eachPart: false,
				parts: 1,
				happenedOn: "2026-10-05",
				today: "2026-10-05",
				description: "Pagamento",
				costDescription: "Juros",
			}),
	},
	{
		// Splitting the invoice that holds the first part of the plan in two.
		method: "invoices.split",
		permission: "transaction.create",
		run: (session, where) =>
			session.invoices.split({
				accountId: where.cardAccountId,
				month: "2026-10",
				entry: 0,
				parts: 2,
				amount: 2000,
				eachPart: false,
				today: "2026-10-05",
				description: "Parcelamento",
				costDescription: "Juros",
				entryDescription: "Entrada",
				taxDescription: "IOF",
			}),
	},
	{
		method: "invoices.undoPlan",
		permission: "transaction.delete",
		run: (session, where) =>
			session.invoices.undoPlan({
				accountId: where.cardAccountId,
				month: "2026-10",
				today: "2026-10-05",
			}),
	},
	{
		method: "transactions.summarize",
		permission: "transaction.read",
		run: (session, where) => session.transactions.summarize({ spaceId: where.spaceId }),
	},
	{
		method: "imports.existing",
		permission: "transaction.read",
		run: (session, where) =>
			session.imports.existing(where.spaceId, { accountId: where.accountId }),
	},
	{
		method: "imports.create",
		permission: "transaction.create",
		run: (session, where) =>
			session.imports.create({
				spaceId: where.spaceId,
				accountId: where.accountId,
				records: [{ happenedOn: "2026-10-05", amount: -1000, description: "Cafe" }],
			}),
	},
	{
		method: "imports.undo",
		permission: "transaction.delete",
		run: (session, where) => session.imports.undo([where.transactionId]),
	},
	{
		method: "cards.remove",
		permission: "account.delete",
		run: (session, where) => session.cards.remove(where.cardId),
	},
	{
		method: "recurrences.materialize",
		permission: "recurrence.write",
		run: (session, where) => session.recurrences.materialize({ spaceId: where.spaceId }),
	},
	{
		method: "recurrences.startWith",
		permission: "recurrence.write",
		run: (session, where) =>
			session.recurrences.startWith({
				spaceId: where.spaceId,
				kind: "expense",
				amount: 14_900,
				accountId: where.accountId,
				description: "Academia",
				happenedOn: "2026-09-10",
				frequency: "monthly",
			}),
	},
	{
		method: "recurrences.update",
		permission: "recurrence.write",
		run: (session, where) =>
			session.recurrences.update(where.recurrenceId, { description: "Outra" }),
	},
	{
		method: "recurrences.removalPreview",
		permission: "recurrence.write",
		run: (session, where) => session.recurrences.removalPreview(where.recurrenceId),
	},
	{
		method: "recurrences.remove",
		permission: "recurrence.write",
		run: (session, where) => session.recurrences.remove(where.recurrenceId),
	},
	{
		method: "transactions.reconcile",
		permission: "transaction.reconcile",
		run: (session, where) => session.transactions.reconcile(where.transactionId, true),
	},
	{
		// The purchase here is not on a benefit card, so whoever may write is refused for that
		// reason, and whoever may not is refused before it.
		method: "transactions.refund",
		permission: "transaction.create",
		run: (session, where) =>
			session.transactions.refund(where.transactionId, {
				amount: 100,
				happenedOn: "2026-09-10",
				description: "Estorno",
			}),
	},
	{
		method: "transactions.toTransfer",
		permission: "transaction.update",
		run: (session, where) =>
			session.transactions.toTransfer(where.transactionId, {
				otherAccountId: where.cardAccountId,
				invoiceMonth: "2026-09",
			}),
	},
	{
		method: "categories.list",
		permission: "category.read",
		run: (session, where) => session.categories.list(where.spaceId),
	},
	{
		method: "categories.create",
		permission: "category.write",
		run: (session, where) =>
			session.categories.create({ spaceId: where.spaceId, name: "Padaria", kind: "expense" }),
	},
	{
		method: "rules.list",
		permission: "rule.read",
		run: (session, where) => session.rules.list(where.spaceId),
	},
	{
		// Teaching a rule from a record, which is the button on the records screen.
		method: "rules.create",
		permission: "rule.write",
		run: (session, where) =>
			session.rules.create({
				spaceId: where.spaceId,
				matchText: "mercado",
				categoryId: where.categoryId,
			}),
	},
	{
		method: "rules.applyToExisting",
		permission: "rule.write",
		run: (session, where) => session.rules.applyToExisting({ spaceId: where.spaceId }),
	},
	{
		method: "recurrences.list",
		permission: "recurrence.read",
		run: (session, where) => session.recurrences.list(where.spaceId),
	},
	{
		method: "recurrences.create",
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
		method: "budgets.list",
		permission: "plan.read",
		run: (session, where) => session.budgets.list(where.spaceId),
	},
	{
		method: "budgets.create",
		permission: "plan.write",
		run: (session, where) =>
			session.budgets.create({ spaceId: where.spaceId, scope: "total", amount: 100_000 }),
	},
	{
		method: "sharing.balances",
		permission: "sharing.read",
		run: (session, where) => session.sharing.balances(where.spaceId),
	},
	{
		method: "sharing.split",
		permission: "sharing.write",
		run: (session, where) =>
			session.sharing.split({ transactionId: where.transactionId, method: "evenly" }),
	},
	{
		method: "savedFilters.list",
		permission: "filter.read",
		run: (session, where) => session.savedFilters.list(where.spaceId),
	},
	{
		method: "savedFilters.create",
		permission: "filter.write",
		run: (session, where) =>
			session.savedFilters.create({
				spaceId: where.spaceId,
				name: "Deste mes",
				query: { month: "2026-09" },
			}),
	},
	{
		method: "changes.list",
		permission: "activity.read",
		run: (session, where) => session.changes.list({ spaceId: where.spaceId }),
	},
	{
		method: "backup.exportSpace",
		permission: "backup.export",
		run: (session, where) => session.backup.exportSpace(where.spaceId),
	},
	{
		// A file naming a space that is already here, with nothing in it: enough to be
		// refused for the right reason, and harmless when it goes through.
		method: "backup.restore",
		permission: "backup.restore",
		run: (session, where) =>
			session.backup.restore({
				format: BACKUP_FORMAT,
				version: BACKUP_VERSION,
				exportedAt: 0,
				spaces: [
					{
						id: where.spaceId,
						kind: "shared",
						name: "Casa",
						colour: "slate",
						icon: "wallet",
						baseCurrency: "BRL",
						timezone: "America/Sao_Paulo",
						tables: {},
					},
				],
				people: [],
			}),
	},
	{
		method: "investments.list",
		permission: "investment.read",
		run: (session, where) => session.investments.list(where.spaceId),
	},
	{
		method: "investments.create",
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
	{
		method: "investments.update",
		permission: "investment.write",
		run: (session, where) => session.investments.update(where.holdingId, { name: "Outro" }),
	},
	{
		method: "investments.price",
		permission: "investment.write",
		run: (session, where) => session.investments.price({ id: where.holdingId, unitPrice: 2_000 }),
	},
	{
		method: "investments.prices",
		permission: "investment.read",
		run: (session, where) => session.investments.prices(where.holdingId),
	},
	{
		method: "investments.move",
		permission: "investment.write",
		run: (session, where) =>
			session.investments.move({
				holdingId: where.holdingId,
				kind: "in",
				onDay: "2026-09-10",
				amount: 10_000,
			}),
	},
	{
		method: "investments.moves",
		permission: "investment.read",
		run: (session, where) => session.investments.moves(where.holdingId),
	},
	{
		method: "investments.goingBack",
		permission: "investment.write",
		run: (session, where) => session.investments.goingBack({ holdingId: where.holdingId }),
	},
	{
		method: "investments.removeMove",
		permission: "investment.write",
		run: (session, where) => session.investments.removeMove(where.holdingMoveId),
	},
	{
		method: "investments.remove",
		permission: "investment.write",
		run: (session, where) => session.investments.remove(where.holdingId),
	},
	{
		// Writing through the change log as somebody, so only somebody who may change the
		// space. With nothing to repair it changes nothing when it goes through.
		method: "repairs.run",
		permission: "space.update",
		run: (session, where) => session.repairs.run(where.spaceId),
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

			/**
			 * Two lists, and the difference matters on any screen that divides money.
			 *
			 * Somebody in two shared spaces reads everybody through the first one, which
			 * is what lets a name be shown wherever it turns up. Dividing an expense is
			 * the other question: it is between the people of the space the expense is
			 * in, and offering the rest offers a division that is refused.
			 */
			it("tells who is in one space apart from everybody this person knows", async () => {
				const fixture = await prepare(adapter);
				try {
					const house = await fixture.asAna.spaces.create({ name: "Casa" });
					await fixture.asAna.members.invite({
						spaceId: house.id,
						userId: fixture.joao.id,
						role: "editor",
					});
					await fixture.asJoao.members.accept(house.id);

					const trip = await fixture.asAna.spaces.create({ name: "Viagem" });
					await fixture.asAna.members.invite({
						spaceId: trip.id,
						userId: fixture.carla.id,
						role: "editor",
					});
					await fixture.asCarla.members.accept(trip.id);
					await fixture.asAna.refresh();

					expect((await fixture.asAna.users.peers()).map((one) => one.name)).toEqual([
						"Ana",
						"Carla",
						"Joao",
					]);
					expect((await fixture.asAna.users.inSpace(house.id)).map((one) => one.name)).toEqual([
						"Ana",
						"Joao",
					]);
					expect((await fixture.asAna.users.inSpace(trip.id)).map((one) => one.name)).toEqual([
						"Ana",
						"Carla",
					]);

					// And it is a space of theirs or it does not exist, like everything else.
					await expect(fixture.asCarla.users.inSpace(house.id)).rejects.toBeInstanceOf(
						NotFoundError,
					);
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

			/**
			 * Nothing is converted when the currency of a space changes, on purpose: a
			 * record keeps the amount and the currency it was written in. That is fine for
			 * a record and not for a total, because every balance, every division and every
			 * settlement already written is a number of minor units of the old currency, and
			 * reading them as the new one adds euros to reais.
			 *
			 * So it is correctable while the space is empty, which is the real case, right
			 * after the front door made one, and settled by the first record.
			 */
			it("lets the currency be corrected while a space is empty, and not after", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Casa" });
					expect(space.baseCurrency).toBe("BRL");

					const corrected = await fixture.asAna.spaces.update(space.id, { baseCurrency: "EUR" });
					expect(corrected.baseCurrency).toBe("EUR");

					const account = await fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "checking",
						name: "Conta",
						currency: "EUR",
					});
					await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 5000,
						happenedOn: "2026-09-10",
						description: "Mercado",
						accountId: account.id,
					});

					await expect(
						fixture.asAna.spaces.update(space.id, { baseCurrency: "USD" }),
					).rejects.toBeInstanceOf(RuleError);

					// The name and the colour are still corrections, and still allowed.
					const renamed = await fixture.asAna.spaces.update(space.id, { name: "Casa nova" });
					expect(renamed.name).toBe("Casa nova");
					expect(renamed.baseCurrency).toBe("EUR");
				} finally {
					await fixture.close();
				}
			});

			// Part 1, G.4 of the request for 2.0.0: the front door makes a space in reais without
			// asking, and the accounts written down next were in reais too. Changing the space to
			// euros afterwards left them there, and every record after that was refused for want
			// of a rate, on a form with no field for one. The accounts with no records follow the
			// space; one written down in a third currency on purpose stays in it.
			it("takes the accounts along when the currency of an empty space is corrected", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Casa" });
					const checking = await fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "checking",
						name: "Conta",
						initialBalance: 250_000,
					});
					const card = await fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "credit",
						name: "Cartao",
						closingDay: 3,
						dueDay: 10,
						creditLimit: 300_000,
					});
					const dollars = await fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "checking",
						name: "Conta em dolar",
						currency: "USD",
					});
					expect(checking.currency).toBe("BRL");

					await fixture.asAna.spaces.update(space.id, { baseCurrency: "EUR" });
					expect((await fixture.asAna.accounts.get(checking.id)).currency).toBe("EUR");
					expect((await fixture.asAna.accounts.get(card.id)).currency).toBe("EUR");
					expect((await fixture.asAna.accounts.get(dollars.id)).currency).toBe("USD");

					// The record that was refused for want of a rate.
					const [written] = await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 5000,
						happenedOn: "2026-09-10",
						description: "Mercado",
						accountId: checking.id,
					});
					expect(written).toMatchObject({ currency: "EUR", amountInBase: -5000 });
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

			// Part 1, D.10 of the request for 2.0.0: an account is refused a name of nothing when
			// it is written, and the edit took one, in browser mode where nothing else stood in front.
			it("refuses to rename an account to nothing", async () => {
				const fixture = await prepare(adapter);
				try {
					const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
					const account = await fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "cash",
						name: "Dinheiro",
					});
					for (const name of ["", "   "]) {
						await expect(fixture.asAna.accounts.update(account.id, { name })).rejects.toMatchObject(
							{
								rule: "nameIsRequired",
							},
						);
					}
					expect((await fixture.asAna.accounts.get(account.id)).name).toBe("Dinheiro");
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

			// Part 1, H.1.5 of the request for 2.0.0: the question before deleting an account said
			// the money of its records stops counting anywhere. It leaves the balances, and the
			// reports and the budget go on counting it, which is what the question says now.
			it("leaves the records of a removed account in the reports and the budget", async () => {
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
						amount: 8_000,
						happenedOn: "2026-09-10",
						description: "Feira",
						accountId: account.id,
					});
					await fixture.asAna.budgets.create({
						spaceId: space.id,
						scope: "total",
						amount: 100_000,
					});
					await fixture.asAna.accounts.remove(account.id);

					const balances = await fixture.asAna.transactions.balances(space.id, "2026-09-30");
					expect(balances.map((one) => one.accountId)).not.toContain(account.id);
					const totals = await fixture.asAna.reports.totals({
						spaceId: space.id,
						from: "2026-09-01",
						to: "2026-09-30",
					});
					expect(totals.expense).toBe(8_000);
					const limits = await fixture.asAna.budgets.progress({
						spaceId: space.id,
						month: "2026-09",
						today: "2026-09-30",
					});
					expect(limits[0]?.progress.spent).toBe(8_000);
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
		runHappenedConformance(adapter);
		runCardConformance(adapter);
		runInvoiceConformance(adapter);
		runArrangementConformance(adapter);
		runPlanOfPartsConformance(adapter);
		runImportingConformance(adapter);
		runListingConformance(adapter);
		runCategoryConformance(adapter);
		runRuleConformance(adapter);
		runRecurrenceRepairConformance(adapter);
		runSeriesWritingConformance(adapter);
		runPlanConformance(adapter);
		runReportConformance(adapter);
		runSavedFilterConformance(adapter);
		runFutureConformance(adapter);
		runHoldingsConformance(adapter);
		runAdviceConformance(adapter);
		runFallsDueConformance(adapter);
		runPortabilityConformance(adapter);
		runErasureConformance(adapter);
		runSyncConformance(adapter);
		runUpgradeConformance(adapter);

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

							// A card and the account it reaches, so the two calls a card screen makes
							// are probed like every other one.
							const cardAccount = await fixture.asAna.accounts.create({
								spaceId: space.id,
								kind: "credit",
								name: "Cartao da casa",
								closingDay: 3,
								dueDay: 10,
							});
							const card = await fixture.asAna.cards.create({
								spaceId: space.id,
								kind: "credit",
								name: "Plastico",
								creditAccountId: cardAccount.id,
							});

							const category = await fixture.asAna.categories.create({
								spaceId: space.id,
								name: "Mercado",
								kind: "expense",
							});
							const plan = (session: Session) =>
								session.transactions.create({
									spaceId: space.id,
									kind: "expense",
									amount: 2000,
									happenedOn: "2026-09-10",
									description: "Fone em duas vezes",
									accountId: cardAccount.id,
									installments: 2,
								});
							const [part] = await plan(fixture.asAna);

							// A logger sees only what they wrote, so the calls about a record are asked
							// about records of their own. Asked about Ana's, the answer was "there is
							// no such thing" before the permission was read, and a wrong refusal of a
							// logger's own record could never show.
							const asLogger = role === "logger";
							const [own] = asLogger
								? await fixture.asJoao.transactions.create({
										spaceId: space.id,
										kind: "expense",
										amount: 1000,
										happenedOn: "2026-09-10",
										description: "Cafe do Joao",
										accountId: account.id,
									})
								: [record];
							const [ownPart] = asLogger ? await plan(fixture.asJoao) : [part];
							const series = await fixture.asAna.recurrences.create({
								spaceId: space.id,
								description: "Aluguel",
								kind: "expense",
								amount: 145_000,
								accountId: account.id,
								frequency: "monthly",
								startsOn: "2026-09-05",
							});
							const broker = await fixture.asAna.accounts.create({
								spaceId: space.id,
								kind: "investment",
								name: "Corretora",
							});
							const holding = await fixture.asAna.investments.create({
								spaceId: space.id,
								accountId: broker.id,
								name: "Fundo",
								kind: "fund",
								quantity: 100_000_000,
								unitPrice: 10_000,
							});
							const holdingMove = await fixture.asAna.investments.move({
								holdingId: holding.id,
								kind: "in",
								onDay: "2026-09-10",
								amount: 5_000,
							});

							const where = {
								spaceId: space.id,
								accountId: account.id,
								transactionId: own?.id ?? "",
								guestId: fixture.carla.id,
								cardId: card.id,
								cardAccountId: cardAccount.id,
								categoryId: category.id,
								groupId: ownPart?.installmentGroup ?? "",
								recurrenceId: series.id,
								holdingId: holding.id,
								holdingMoveId: holdingMove.id,
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
							expect(refusal).toBeInstanceOf(PermissionError);
						} finally {
							await fixture.close();
						}
					});
				}
			}

			/**
			 * The table a screen reads, against the repositories themselves.
			 *
			 * Every probe above proves, on every adapter, that one call refuses exactly the roles
			 * its permission refuses. This ties the table to those probes, so a control that
			 * names the call it makes cannot be drawn behind the wrong permission, and moving a
			 * permission in the matrix reaches every button with nothing copied by hand.
			 */
			it("says the same thing about a call as the table the screens read", () => {
				for (const probe of PROBES) {
					expect(METHOD_PERMISSIONS[probe.method], probe.method).toBe(probe.permission);
				}
			});

			it("has a probe behind every call the table names", () => {
				// Otherwise the table grows an entry nobody proved, which is the hole this was
				// built to close, moved from a screen into a file.
				const probed = new Set(PROBES.map((probe) => probe.method));
				for (const method of Object.keys(METHOD_PERMISSIONS)) {
					expect(probed.has(method as RepositoryMethod), method).toBe(true);
				}
			});

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
					const cardAccount = await fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "credit",
						name: "Cartao da casa",
						closingDay: 3,
						dueDay: 10,
					});
					const card = await fixture.asAna.cards.create({
						spaceId: space.id,
						kind: "credit",
						name: "Plastico",
						creditAccountId: cardAccount.id,
					});
					const category = await fixture.asAna.categories.create({
						spaceId: space.id,
						name: "Mercado",
						kind: "expense",
					});
					const [part] = await fixture.asAna.transactions.create({
						spaceId: space.id,
						kind: "expense",
						amount: 2000,
						happenedOn: "2026-09-10",
						description: "Fone em duas vezes",
						accountId: cardAccount.id,
						installments: 2,
					});
					const series = await fixture.asAna.recurrences.create({
						spaceId: space.id,
						description: "Aluguel",
						kind: "expense",
						amount: 145_000,
						accountId: account.id,
						frequency: "monthly",
						startsOn: "2026-09-05",
					});
					const broker = await fixture.asAna.accounts.create({
						spaceId: space.id,
						kind: "investment",
						name: "Corretora",
					});
					const holding = await fixture.asAna.investments.create({
						spaceId: space.id,
						accountId: broker.id,
						name: "Fundo",
						kind: "fund",
						quantity: 100_000_000,
						unitPrice: 10_000,
					});
					const holdingMove = await fixture.asAna.investments.move({
						holdingId: holding.id,
						kind: "in",
						onDay: "2026-09-10",
						amount: 5_000,
					});
					const where = {
						spaceId: space.id,
						accountId: account.id,
						transactionId: record?.id ?? "",
						guestId: fixture.carla.id,
						cardId: card.id,
						cardAccountId: cardAccount.id,
						categoryId: category.id,
						groupId: part?.installmentGroup ?? "",
						recurrenceId: series.id,
						holdingId: holding.id,
						holdingMoveId: holdingMove.id,
					};

					for (const probe of PROBES) {
						// Restoring is the one that answers, and it answers without saying
						// anything: a file naming a space this person is not in never reaches
						// that space, it becomes a copy of its own with new identifiers. There
						// is nothing for it to reveal, and refusing would take away the case
						// registry 0015 exists for, a backup restored beside its original.
						if (probe.permission === "backup.restore") continue;

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
