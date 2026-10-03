// Writing a statement down.
//
// A file arrives, somebody looks at it, and then a few hundred records are written at
// once. Doing that through the ordinary create path would mean a few hundred database
// transactions, so this repository writes the lot inside one, and refuses the lot if
// any line is wrong. Half an imported statement is worse than none: nobody can tell
// which half is missing.
//
// The rules of the space still get their say, so an imported statement arrives sorted
// the way a typed record would be. What this path does not do is guess about
// duplicates. The reading side marks what looks familiar, the person decides, and only
// what they kept reaches here.

import {
	addMonths,
	addMonthsToMonth,
	type CalendarDate,
	type CalendarMonth,
	type CardCycle,
	installmentRefusal,
	invoiceMonthOf,
	invoicePeriod,
	money,
	parseCalendarDate,
	parseCalendarMonth,
	pickRule,
	purchaseDayOf,
	statementParts,
	uuidV7,
} from "@cofre/core";
import { transactions } from "@cofre/db";
import { assertCan, seesOwnRowsOnly } from "../actor.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { type Account, type SpendingPriority, toAccount, toCategorizationRule } from "../models.ts";
import { marks } from "../sql.ts";
import { insertRow, softDeleteRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";
import { planRefused } from "./transactions.ts";

/**
 * What a line of a file is, apart from its sign, as the reading side worked it out and the
 * person left it. Only an invoice uses it to decide what is written.
 */
export type ImportNature =
	| "purchase"
	| "fee"
	| "credit"
	| "installment"
	| "payment"
	| "cardPayment";

/** One line of a statement, the way a file gives it: a signed amount and a day. */
export type ImportedRecord = {
	happenedOn: CalendarDate;
	/** Signed minor units. Negative is money leaving, which is what a statement says. */
	amount: number;
	description: string;
	notes?: string | null;
	/** What the bank called it, kept so the same file read twice does not double. */
	externalId?: string | null;
	categoryId?: string | null;
	priority?: SpendingPriority | null;
	/**
	 * The plastic of this line, when the file says it: an invoice lists the holder's purchases
	 * and each additional card's under headings of their own. Left out, the one of the file.
	 */
	cardId?: string | null;
	nature?: ImportNature | null;
	/**
	 * Where the money of a payment on an invoice came from: a current account, a savings
	 * account or cash. A payment is the invoice before being paid, a transfer from there, and
	 * never income on the card.
	 */
	paymentFrom?: string | null;
	/**
	 * A purchase already written that this refund takes back. The purchase is removed in the
	 * same write and the refund is not written: the two cancel, and the month did not keep it.
	 */
	reverses?: string | null;
	/**
	 * The part of a plan the line is: the parts from it to the last are written, each on the
	 * invoice after the one before, counted by number and never by the day.
	 */
	installment?: { number: number; count: number } | null;
	/**
	 * On a statement of an account: the card a line paid, and the invoice of it. The line is the
	 * transfer an invoice is paid with, from this account into the card, and not money spent.
	 */
	paysCard?: string | null;
	paysInvoice?: CalendarMonth | null;
};

export type ImportInput = {
	spaceId: string;
	/** Every line of one file belongs to one account, which the person picks. */
	accountId: string;
	/**
	 * And to one piece of plastic, when the file says which. A statement names a card by
	 * its four digits, so this is usually worked out rather than chosen.
	 */
	cardId?: string | null;
	/**
	 * The invoice the file is, when it is a card's invoice. Every line goes on it, chosen by
	 * hand, whatever its day: an invoice is what the bank says is on it, and working each line
	 * out again from its day put the purchases of the closing day on the next invoice.
	 */
	invoiceMonth?: CalendarMonth | null;
	/**
	 * Records the file replaces, removed in the same write: the one line a card was written
	 * down with for its open invoice, which the invoice now details.
	 */
	removes?: string[];
	records: ImportedRecord[];
};

export type ImportResult = {
	written: number;
	ids: string[];
};

/** What the reading side compares a file against, to say what is already here. */
export type KnownRecord = {
	id: string;
	happenedOn: string;
	/** As the account the file is read into sees it: a move out of it is money out. */
	amount: number;
	description: string;
	externalId: string | null;
	/**
	 * A move between two accounts that touches this one, either end. The line a statement
	 * has for it is the same money, whatever the bank called it, and joining the two halves
	 * of a move deleted the record that carried this statement's mark.
	 */
	moved: boolean;
	/** What kind of record it is, so a refund in the file finds the purchase it takes back. */
	kind: "expense" | "income" | "transfer";
	/** The other end of a move. */
	counterAccountId: string | null;
	cardId: string | null;
	/** The invoice it is on, so a part printed on an invoice finds the part already written. */
	invoiceMonth: string | null;
	/**
	 * The invoice of the card a transfer leaves that it is a purchase on: a part of a split invoice
	 * or of a payment with another card, which the bank's invoice prints as a charge.
	 */
	originInvoiceMonth: string | null;
	/** The series that wrote it, which a statement line of the same amount is. */
	recurrenceId: string | null;
	/** The plan it is a part of, and which part. */
	installment: { group: string; number: number; count: number } | null;
};

function cycleOf(account: Account): CardCycle | undefined {
	if (account.kind !== "credit") return undefined;
	if (account.closingDay === null || account.dueDay === null) return undefined;
	return { closingDay: account.closingDay, dueDay: account.dueDay };
}

export function createImportsRepository(context: RepositoryContext) {
	async function accountIn(spaceId: string, accountId: string): Promise<Account> {
		const rows = await context.driver.all(
			`SELECT "id", "space_id", "kind", "name", "currency", "initial_balance", "institution",
			        "archived_at", "closing_day", "due_day", "credit_limit", "benefit", "created_by",
			        "created_at", "updated_at"
			 FROM "accounts" WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL`,
			[accountId, spaceId],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("account", accountId);
		return toAccount(first);
	}

	return {
		/**
		 * What the space already has around the days a file covers, so the reading side
		 * can mark what looks familiar. Only the four fields that decide it, because this
		 * runs over a window that can be a whole year.
		 */
		async existing(
			spaceId: string,
			range: {
				from?: CalendarDate;
				to?: CalendarDate;
				accountId?: string;
				/**
				 * The invoice a file is, so the plans of the account around it come back whatever
				 * the day of their purchase: a part bought a year ago is on this invoice.
				 */
				invoiceMonth?: CalendarMonth;
			} = {},
		): Promise<KnownRecord[]> {
			const actor = context.actor();
			assertCan(actor, spaceId, "transaction.read");

			const where = [`"space_id" = ?`, `"deleted_at" IS NULL`];
			const params: (string | number)[] = [spaceId];

			// A logger reads their own rows, here as everywhere else. This query missed
			// that rule, so the screen that marks what looks familiar read back every
			// record of the space, up to five thousand of them with their descriptions and
			// their amounts, for somebody who is meant to see only what they wrote.
			if (seesOwnRowsOnly(actor, spaceId)) {
				where.push(`"created_by" = ?`);
				params.push(actor.userId);
			}

			// The records of the account, and the moves that reach it from another one.
			if (range.accountId) {
				where.push(`("account_id" = ? OR ("counter_account_id" = ? AND "kind" = 'transfer'))`);
				params.push(range.accountId, range.accountId);
			}
			if (range.from) {
				where.push(`"happened_on" >= ?`);
				params.push(range.from);
			}
			if (range.to) {
				where.push(`"happened_on" <= ?`);
				params.push(range.to);
			}

			// The newest first. Oldest first, an old purchase stretched the window until the limit
			// cut off the records of the days the file is about.
			const columns = `"id", "happened_on", "amount", "description", "external_id", "kind",
			        "account_id", "counter_account_id", "card_id", "invoice_month", "recurrence_id",
			        "installment_group", "installment_number", "installment_count", "origin_invoice_month"`;
			const rows = await context.driver.all(
				`SELECT ${columns} FROM "transactions" WHERE ${where.join(" AND ")}
				 ORDER BY "happened_on" DESC LIMIT 5000`,
				params,
			);
			if (range.invoiceMonth && range.accountId) {
				parseCalendarMonth(range.invoiceMonth);
				const plans = await context.driver.all(
					`SELECT ${columns} FROM "transactions"
					 WHERE "space_id" = ? AND "deleted_at" IS NULL AND "account_id" = ?
					   AND "installment_group" IS NOT NULL
					   AND (("invoice_month" >= ? AND "invoice_month" <= ?)
					     OR ("origin_invoice_month" >= ? AND "origin_invoice_month" <= ?))
					   ${seesOwnRowsOnly(actor, spaceId) ? `AND "created_by" = ?` : ""}`,
					[
						spaceId,
						range.accountId,
						addMonthsToMonth(range.invoiceMonth, -3),
						addMonthsToMonth(range.invoiceMonth, 3),
						addMonthsToMonth(range.invoiceMonth, -3),
						addMonthsToMonth(range.invoiceMonth, 3),
						...(seesOwnRowsOnly(actor, spaceId) ? [actor.userId] : []),
					],
				);
				const known = new Set(rows.map((row) => String(row.id)));
				rows.push(...plans.filter((row) => !known.has(String(row.id))));
			}

			return rows.map((row) => {
				const moved = row.kind === "transfer";
				// A move is written positive, leaving its first account: from that side it is
				// money out, which is the sign the line of that account's statement carries.
				const leaves = moved && row.account_id === range.accountId;
				return {
					id: String(row.id),
					happenedOn: String(row.happened_on),
					amount: leaves ? -Number(row.amount) : Number(row.amount),
					description: String(row.description),
					externalId: row.external_id === null ? null : String(row.external_id),
					moved,
					kind: String(row.kind) as KnownRecord["kind"],
					counterAccountId: row.counter_account_id === null ? null : String(row.counter_account_id),
					cardId: row.card_id === null ? null : String(row.card_id),
					invoiceMonth: row.invoice_month === null ? null : String(row.invoice_month),
					originInvoiceMonth:
						row.origin_invoice_month === null ? null : String(row.origin_invoice_month),
					recurrenceId: row.recurrence_id === null ? null : String(row.recurrence_id),
					installment:
						row.installment_group === null || row.installment_number === null
							? null
							: {
									group: String(row.installment_group),
									number: Number(row.installment_number),
									count: Number(row.installment_count),
								},
				};
			});
		},

		/** Every line of the file, in one database transaction, or nothing at all. */
		async create(input: ImportInput): Promise<ImportResult> {
			assertCan(context.actor(), input.spaceId, "transaction.create");
			if (input.records.length === 0) return { written: 0, ids: [] };

			const account = await accountIn(input.spaceId, input.accountId);
			// An invoice is the whole of what a card will charge, whoever made the purchases, and so
			// is paying one: somebody who sees only their own records writes neither. The same
			// reason the invoices themselves give.
			const narrowed = seesOwnRowsOnly(context.actor(), input.spaceId);
			if (
				narrowed &&
				(account.kind === "credit" || input.records.some((record) => record.paysCard))
			) {
				throw new RuleError(
					"invoiceBelongsToTheCard",
					"an invoice is the whole of what the card will charge, so it is not read one person at a time",
				);
			}
			const invoiceMonth = input.invoiceMonth ?? null;
			if (invoiceMonth !== null) {
				// "2026-13" was written as it came, and every reading of an invoice failed after it.
				parseCalendarMonth(invoiceMonth);
				if (account.kind !== "credit") {
					throw new RuleError(
						"invoiceIsOfACard",
						"an invoice is read into a credit card, and this account is not one",
					);
				}
			}
			// A card put away still owes what it owes, and the invoice that says so is read into it.
			if (account.archivedAt !== null && invoiceMonth === null) {
				throw new RuleError(
					"accountIsArchived",
					"this account is archived, bring it back before writing to it",
				);
			}
			// A card written down without its two days has no invoice to work a line out to, so a
			// file read into it has to say which invoice it is.
			if (account.kind === "credit" && cycleOf(account) === undefined && invoiceMonth === null) {
				throw new RuleError(
					"invoiceNeedsItsMonth",
					"this card has no closing day, so say which invoice the file is",
				);
			}

			const spaceRows = await context.driver.all(
				`SELECT "base_currency" FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
				[input.spaceId],
			);
			const spaceCurrency = String(spaceRows[0]?.base_currency ?? "BRL");
			if (account.currency !== spaceCurrency) {
				throw new RuleError(
					"importNeedsTheSameCurrency",
					"this account keeps another currency, so a file cannot be read into it yet",
				);
			}

			// Checked before a single row is written, because the point of one database
			// transaction is that a bad line stops the whole file rather than half of it.
			const chosen = [...new Set(input.records.map((record) => record.categoryId ?? ""))].filter(
				(id) => id !== "",
			);
			if (chosen.length > 0) {
				const found = await context.driver.all(
					`SELECT "id" FROM "categories"
					 WHERE "id" IN (${marks(chosen.length)}) AND "space_id" = ? AND "deleted_at" IS NULL`,
					[...chosen, input.spaceId],
				);
				const known = new Set(found.map((row) => String(row.id)));
				const missing = chosen.find((id) => !known.has(id));
				if (missing !== undefined) throw new NotFoundError("category", missing);
			}

			for (const record of input.records) {
				parseCalendarDate(record.happenedOn);
				if (!Number.isSafeInteger(record.amount) || record.amount === 0) {
					throw new RuleError(
						"amountIsPositiveInteger",
						"every line of the file needs an amount in minor units that is not zero",
					);
				}
				if (record.description.trim() === "") {
					throw new RuleError(
						"descriptionIsRequired",
						"every line of the file needs a description to be found later",
					);
				}
			}

			const ruleRows = await context.driver.all(
				`SELECT "id", "space_id", "match_text", "account_id", "kind", "category_id", "priority",
				 "position", "disabled_at", "created_by", "created_at", "updated_at"
				 FROM "categorization_rules"
				 WHERE "space_id" = ? AND "deleted_at" IS NULL AND "disabled_at" IS NULL
				 ORDER BY "position", "created_at"`,
				[input.spaceId],
			);
			const rules = ruleRows.map(toCategorizationRule);
			const cycle = cycleOf(account);

			// Checked once for the whole file, for the same reason every other check here
			// is: a card that does not reach this account has to stop the import before a
			// single row is written, not halfway through.
			const cardId: string | null = input.cardId ?? null;
			const plastics = [
				...new Set(
					[cardId, ...input.records.map((record) => record.cardId ?? null)].filter(
						(id): id is string => id !== null && id !== "",
					),
				),
			];
			if (plastics.length > 0) {
				const rows = await context.driver.all(
					`SELECT "id" FROM "cards"
					 WHERE "id" IN (${marks(plastics.length)}) AND "space_id" = ? AND "deleted_at" IS NULL
					   AND ("credit_account_id" = ? OR "debit_account_id" = ?)`,
					[...plastics, input.spaceId, input.accountId, input.accountId],
				);
				if (rows.length !== plastics.length) {
					throw new RuleError(
						"cardDoesNotReachAccount",
						"this card does not spend from the account the file is being read into",
					);
				}
			}

			// The accounts the payments of an invoice came from, each one money of this space.
			const payers = [
				...new Set(
					input.records
						.filter((record) => invoiceMonth !== null && record.nature === "payment")
						.map((record) => record.paymentFrom ?? ""),
				),
			];
			if (payers.includes("")) {
				throw new RuleError(
					"paymentNeedsItsAccount",
					"a payment on an invoice needs the account the money came from",
				);
			}
			if (payers.length > 0) {
				const rows = await context.driver.all(
					`SELECT "id" FROM "accounts"
					 WHERE "id" IN (${marks(payers.length)}) AND "space_id" = ? AND "deleted_at" IS NULL
					   AND "archived_at" IS NULL AND "currency" = ?
					   AND "kind" IN ('checking', 'savings', 'cash')`,
					[...payers, input.spaceId, account.currency],
				);
				if (rows.length !== payers.length) {
					throw new RuleError(
						"paymentFromMoney",
						"an invoice is paid from a current account, a savings account or cash",
					);
				}
			}

			// The cards the statement's payments paid: each a credit card of this space, each payment
			// leaving an account of money, on an invoice that is a month.
			const paidCards = [
				...new Set(
					input.records.filter((record) => record.paysCard).map((record) => record.paysCard ?? ""),
				),
			];
			if (paidCards.length > 0) {
				if (!["checking", "savings", "cash"].includes(account.kind)) {
					throw new RuleError(
						"paymentFromMoney",
						"an invoice is paid from a current account, a savings account or cash",
					);
				}
				for (const record of input.records) {
					if (record.paysCard && record.paysInvoice) parseCalendarMonth(record.paysInvoice);
				}
				const rows = await context.driver.all(
					`SELECT "id" FROM "accounts"
					 WHERE "id" IN (${marks(paidCards.length)}) AND "space_id" = ? AND "deleted_at" IS NULL
					   AND "kind" = 'credit' AND "currency" = ?`,
					[...paidCards, input.spaceId, account.currency],
				);
				if (rows.length !== paidCards.length) {
					throw new RuleError(
						"invoiceIsOfACard",
						"an invoice is read into a credit card, and this account is not one",
					);
				}
			}

			// What the file replaces, each one on this account and removable by this person, checked
			// before anything is written.
			const removes = [...new Set(input.removes ?? [])];
			if (removes.length > 0) {
				assertCan(context.actor(), input.spaceId, "transaction.delete");
				const rows = await context.driver.all(
					`SELECT "id", "created_by", "installment_group" FROM "transactions"
					 WHERE "id" IN (${marks(removes.length)}) AND "space_id" = ? AND "account_id" = ?
					   AND "deleted_at" IS NULL`,
					[...removes, input.spaceId, input.accountId],
				);
				const own = seesOwnRowsOnly(context.actor(), input.spaceId);
				const fit = rows.filter(
					(row) =>
						row.installment_group === null &&
						(!own || String(row.created_by) === context.actor().userId),
				);
				if (fit.length !== removes.length) {
					throw new RuleError(
						"replacedRecordIsNotHere",
						"a record the file was to replace is not one of this account that can be removed",
					);
				}
			}

			// The purchases the refunds of the file take back: each one an expense of this account,
			// of the whole amount of its refund, on the same day or before, removable by this person.
			const reversed = input.records.filter((record) => record.reverses);
			if (reversed.length > 0) {
				assertCan(context.actor(), input.spaceId, "transaction.delete");
				const own = seesOwnRowsOnly(context.actor(), input.spaceId);
				const asked = [...new Set(reversed.map((record) => record.reverses ?? ""))];
				if (asked.length !== reversed.length) {
					throw new RuleError(
						"refundedPurchaseIsNotHere",
						"each refund takes back one purchase of this account, of its whole amount",
					);
				}
				const rows = await context.driver.all(
					`SELECT "id", "kind", "amount", "happened_on", "created_by", "installment_group"
					 FROM "transactions"
					 WHERE "id" IN (${marks(asked.length)}) AND "space_id" = ? AND "account_id" = ?
					   AND "deleted_at" IS NULL`,
					[...asked, input.spaceId, input.accountId],
				);
				const byId = new Map(rows.map((row) => [String(row.id), row]));
				for (const record of reversed) {
					const row = byId.get(record.reverses ?? "");
					if (
						row?.kind !== "expense" ||
						Number(row.amount) !== -Math.abs(record.amount) ||
						String(row.happened_on) > record.happenedOn ||
						row.installment_group !== null ||
						(own && String(row.created_by) !== context.actor().userId)
					) {
						throw new RuleError(
							"refundedPurchaseIsNotHere",
							"each refund takes back one purchase of this account, of its whole amount",
						);
					}
				}
			}

			// A plan read off a statement is refused before anything is written, as one typed is.
			for (const record of input.records) {
				const part = record.installment;
				if (!part || part.count < 2) continue;
				const refusal = installmentRefusal({
					kind: "expense",
					accountKind: account.kind,
					count: part.count,
					total: Math.abs(record.amount) * part.count,
					firstNumber: part.number,
				});
				if (refusal) throw planRefused(refusal);
			}
			const period = invoiceMonth !== null && cycle ? invoicePeriod(invoiceMonth, cycle) : null;

			const ids = await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				const written: string[] = [];

				for (const id of removes) {
					await softDeleteRow(write, { table: transactions, spaceId: input.spaceId, id });
				}

				for (const record of input.records) {
					// The payment of a card on a statement: the transfer that pays its invoice.
					if (record.paysCard) {
						const amount = Math.abs(record.amount);
						written.push(
							await insertRow(write, {
								table: transactions,
								spaceId: input.spaceId,
								values: {
									kind: "transfer",
									status: "settled",
									amount,
									currency: account.currency,
									fx_rate: null,
									amount_in_base: amount,
									happened_on: record.happenedOn,
									description: record.description.trim(),
									account_id: input.accountId,
									counter_account_id: record.paysCard,
									notes: record.notes ?? null,
									reconciled_at: null,
									installment_group: null,
									installment_number: null,
									installment_count: null,
									invoice_month: record.paysInvoice ?? null,
									invoice_month_by_hand: record.paysInvoice ? 1 : null,
									category_id: null,
									priority: null,
									external_id: record.externalId ?? null,
									card_id: null,
									created_by: context.actor().userId,
								},
							}),
						);
						continue;
					}
					// A part of a plan: the parts from it to the last, a group of their own.
					const part = record.installment;
					if (part && part.count >= 2) {
						const purchasedOn = purchaseDayOf({
							printedOn: record.happenedOn,
							number: part.number,
							period,
						});
						const firstDay = addMonths(purchasedOn, part.number - 1);
						const invoice = invoiceMonth ?? (cycle ? invoiceMonthOf(firstDay, cycle) : undefined);
						const parts = statementParts({
							eachPart: money(Math.abs(record.amount), account.currency),
							number: part.number,
							count: part.count,
							purchasedOn,
							...(invoice ? { invoice } : {}),
						});
						const group = uuidV7();
						const sorted = record.categoryId
							? null
							: pickRule(rules, {
									description: record.description,
									accountId: input.accountId,
									kind: "expense",
								});
						for (const one of parts) {
							written.push(
								await insertRow(write, {
									table: transactions,
									spaceId: input.spaceId,
									values: {
										kind: "expense",
										status: "settled",
										amount: -one.amount.amount,
										currency: account.currency,
										fx_rate: null,
										amount_in_base: -one.amount.amount,
										happened_on: one.happenedOn,
										description: `${record.description.trim()} ${one.number}/${one.count}`,
										account_id: input.accountId,
										counter_account_id: null,
										notes: record.notes ?? null,
										reconciled_at: null,
										installment_group: group,
										installment_number: one.number,
										installment_count: one.count,
										invoice_month: one.invoiceMonth ?? null,
										invoice_month_by_hand: one.invoiceMonth ? 1 : null,
										category_id: record.categoryId ?? sorted?.categoryId ?? null,
										priority: record.priority ?? sorted?.priority ?? null,
										external_id: null,
										card_id: record.cardId || cardId,
										created_by: context.actor().userId,
									},
								}),
							);
						}
						continue;
					}
					// A refund of a purchase already written takes it out, and is not written itself.
					if (record.reverses) {
						await softDeleteRow(write, {
							table: transactions,
							spaceId: input.spaceId,
							id: record.reverses,
						});
						continue;
					}
					// A payment on an invoice pays the invoice before it: the transfer an invoice is
					// paid with, from the account the money came from, marked with that invoice. It
					// was income on the card, and September earned the thousand it paid.
					if (invoiceMonth !== null && record.nature === "payment") {
						const amount = Math.abs(record.amount);
						written.push(
							await insertRow(write, {
								table: transactions,
								spaceId: input.spaceId,
								values: {
									kind: "transfer",
									status: "settled",
									amount,
									currency: account.currency,
									fx_rate: null,
									amount_in_base: amount,
									happened_on: record.happenedOn,
									description: record.description.trim(),
									account_id: record.paymentFrom ?? "",
									counter_account_id: input.accountId,
									notes: record.notes ?? null,
									reconciled_at: null,
									installment_group: null,
									installment_number: null,
									installment_count: null,
									invoice_month: addMonthsToMonth(invoiceMonth, -1),
									invoice_month_by_hand: 1,
									category_id: null,
									priority: null,
									external_id: record.externalId ?? null,
									card_id: null,
									created_by: context.actor().userId,
								},
							}),
						);
						continue;
					}

					// On a benefit card a line that adds is a refund, which is a purchase taken
					// back (registry 0055), because a benefit card takes no income. Written as
					// income it was the one path that put income on a voucher. On an invoice a
					// purchase and a fee are money out, whatever sign the bank printed.
					const spent =
						invoiceMonth !== null &&
						(record.nature === "purchase" ||
							record.nature === "fee" ||
							record.nature === "installment");
					const kind =
						spent || record.amount < 0 || account.kind === "voucher" ? "expense" : "income";
					const amount = spent ? -Math.abs(record.amount) : record.amount;
					const sorted = record.categoryId
						? null
						: pickRule(rules, {
								description: record.description,
								accountId: input.accountId,
								kind,
							});

					const id = await insertRow(write, {
						table: transactions,
						spaceId: input.spaceId,
						values: {
							kind,
							status: "settled",
							amount,
							currency: account.currency,
							fx_rate: null,
							amount_in_base: amount,
							happened_on: record.happenedOn,
							description: record.description.trim(),
							account_id: input.accountId,
							counter_account_id: null,
							notes: record.notes ?? null,
							reconciled_at: null,
							installment_group: null,
							installment_number: null,
							installment_count: null,
							// The invoice the file is, chosen by hand, or worked out from the day.
							invoice_month:
								invoiceMonth ?? (cycle ? invoiceMonthOf(record.happenedOn, cycle) : null),
							invoice_month_by_hand: invoiceMonth === null ? null : 1,
							category_id: record.categoryId ?? sorted?.categoryId ?? null,
							priority: record.priority ?? sorted?.priority ?? null,
							external_id: record.externalId ?? null,
							card_id: record.cardId || cardId,
							created_by: context.actor().userId,
						},
					});
					written.push(id);
				}
				return written;
			});

			return { written: ids.length, ids };
		},
	};
}

export type ImportsRepository = ReturnType<typeof createImportsRepository>;
