// Taking everything with you.
//
// A backup is the whole of a space as plain JSON: readable, versioned, and complete
// enough that restoring it somewhere else gives back the same money life. It is the
// only honest answer to "the data stays where you put it", because data you cannot
// carry out is data somebody else is holding.
//
// What travels is the space and its rows. Who belongs to the space does not, for the
// same reason it does not replicate: membership belongs to the installation that holds
// the accounts. A restore makes the person doing it the owner of what they restore.

import { uuidV7 } from "@cofre/core";
import { SCHEMA, spaceMembers, spaces, type Table } from "@cofre/db";
import { assertCan, readableSpaceIds, seesOwnRowsOnly } from "../actor.ts";
import type { Row, SqlValue } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { marks } from "../sql.ts";
import { rowsFromChanges } from "../sync.ts";
import type { SyncBundle } from "../syncStore.ts";
import { insertRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";
import { repairAfterArrival } from "./repairs.ts";

export const BACKUP_FORMAT = "cofre.backup";
/**
 * Raised once for 2.0.0, which added columns a restore copies only when it knows them. A
 * release of 1.x restoring a file of 2.0.0 refuses it as newer instead of quietly losing
 * the history of an allowance and the rest of what 2.0.0 writes. A file of version 1 is
 * still restored, with those columns empty.
 */
export const BACKUP_VERSION = 2;

/** The tables a backup carries, in the order a restore has to write them. */
export const BACKUP_TABLES: readonly Table[] = SCHEMA.filter(
	(table) => table.scope === "space" && table.replicated,
);

/** Columns the restore writes itself, so the file does not carry them. */
const WRITTEN_BY_THE_RESTORE = new Set([
	"id",
	"space_id",
	"created_at",
	"updated_at",
	"updated_by",
	"deleted_at",
	"hlc",
]);

export type BackupSpace = {
	id: string;
	kind: string;
	name: string;
	colour: string;
	icon: string;
	baseCurrency: string;
	timezone: string;
	/** One entry per table, each row keeping its identifier and its own columns. */
	tables: Record<string, Record<string, SqlValue>[]>;
};

export type Backup = {
	format: typeof BACKUP_FORMAT;
	version: number;
	exportedAt: number;
	spaces: BackupSpace[];
	/**
	 * Only the people the rows point at, and only their name, so a restore can say who
	 * a share belongs to. No address and nothing that would let this file sign anybody in.
	 */
	people: { id: string; name: string }[];
};

export type RestoreOutcome = {
	spaceId: string;
	name: string;
	/** False when the rows went into a space this person already had. */
	created: boolean;
	written: number;
	/** Rows that were left out, with the reason, so nothing disappears quietly. */
	skipped: { table: string; reason: "alreadyHere" | "unknownPerson"; count: number }[];
};

export type RestoreResult = {
	spaces: RestoreOutcome[];
};

export type RestoreOptions = {
	/** The spaces of the file to bring back. Leaving it out brings all of them. */
	only?: readonly string[];
};

/** One row of a record, flattened for a spreadsheet. */
export type RecordForExport = {
	happenedOn: string;
	description: string;
	amount: number;
	currency: string;
	kind: string;
	status: string;
	account: string;
	counterAccount: string | null;
	/**
	 * The kind of the account a transfer lands in, which is what says whether it paid an
	 * invoice or moved money between two accounts. A spreadsheet that called both a
	 * transfer named a word the interface no longer uses.
	 */
	counterKind: string | null;
	/** The plastic it was paid with, when the record says. */
	card: string | null;
	category: string | null;
	priority: string | null;
	notes: string | null;
	invoiceMonth: string | null;
	installment: string | null;
	externalId: string | null;
};

function columnsOf(table: Table): string[] {
	return table.columns
		.map((column) => column.name)
		.filter((name) => !WRITTEN_BY_THE_RESTORE.has(name));
}

/** Columns that name a person, which is what a restore has to think about. */
function peopleColumns(table: Table): string[] {
	return table.columns
		.filter((column) => column.references?.table === "users" && column.name !== "created_by")
		.map((column) => column.name);
}

/**
 * Columns that point at another row the backup carries. The tables are written in the
 * order the schema declares them, and a table points only at tables above it, so by the
 * time one of these is read the row it names has already been written.
 */
function pointerColumns(table: Table): string[] {
	const carried = new Set(BACKUP_TABLES.map((one) => one.name));
	return table.columns
		.filter((column) => column.references && carried.has(column.references.table))
		.map((column) => column.name);
}

function isJsonColumn(table: Table, name: string): boolean {
	return table.columns.find((column) => column.name === name)?.type === "json";
}

function requiredColumn(table: Table, name: string): boolean {
	return table.columns.find((column) => column.name === name)?.notNull === true;
}

function plain(value: unknown): SqlValue {
	if (value === null || value === undefined) return null;
	if (typeof value === "number") return value;
	if (typeof value === "bigint") return Number(value);
	if (typeof value === "string") return value;
	// A json column arrives parsed from PostgreSQL and as text from SQLite.
	return JSON.stringify(value);
}

/**
 * The file kept for syncing, read as a backup.
 *
 * Two files leave this application and both hold a whole space: the backup, which is
 * the rows, and the sync file, which is every change ever made to them. Somebody who
 * has only the second one and no longer has the device it came from used to be told to
 * go back to that device and export a backup, which is not advice, it is a wall. The
 * log folds into the rows it describes, so the file that was written to meet another
 * device also comes back through the door that brings a space home.
 *
 * What it gives up, it gives up on purpose. Deleted rows are dropped and the
 * bookkeeping columns are left for the restore to write, so the result is the same
 * shape an export produces and every rule about restoring holds unchanged.
 */
export function backupFromBundle(bundle: SyncBundle): Backup {
	const folded = rowsFromChanges(bundle.changes ?? []);
	const spaceRow = (folded.get("spaces") ?? []).find((row) => String(row.id) === bundle.spaceId);
	if (!spaceRow) {
		throw new RuleError(
			"bundleHasNoSpace",
			"this file carries changes but not the space they belong to, so there is nothing to bring back",
		);
	}

	const tables: Record<string, Record<string, SqlValue>[]> = {};
	for (const table of BACKUP_TABLES) {
		const rows = (folded.get(table.name) ?? []).filter(
			(row) => String(row.space_id) === bundle.spaceId,
		);
		tables[table.name] = rows.map((row) => {
			const kept: Record<string, SqlValue> = { id: String(row.id) };
			for (const name of columnsOf(table)) kept[name] = plain(row[name]);
			return kept;
		});
	}

	return {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		exportedAt: bundle.writtenAt ?? 0,
		spaces: [
			{
				id: bundle.spaceId,
				kind: String(spaceRow.kind),
				name: String(spaceRow.name),
				colour: String(spaceRow.colour),
				icon: String(spaceRow.icon),
				baseCurrency: String(spaceRow.base_currency),
				timezone: String(spaceRow.timezone),
				tables,
			},
		],
		people: (bundle.people ?? []).map((person) => ({ id: person.id, name: person.name })),
	};
}

function chunk<T>(items: readonly T[], size: number): T[][] {
	const parts: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		parts.push(items.slice(index, index + size));
	}
	return parts;
}

export function createBackupRepository(context: RepositoryContext) {
	async function rowsOf(table: Table, spaceId: string): Promise<Record<string, SqlValue>[]> {
		const columns = columnsOf(table);
		const rows = await context.driver.all(
			`SELECT "id", ${columns.map((name) => `"${name}"`).join(", ")}
			 FROM "${table.name}" WHERE "space_id" = ? AND "deleted_at" IS NULL
			 ORDER BY "created_at", "id"`,
			[spaceId],
		);

		return rows.map((row) => {
			const kept: Record<string, SqlValue> = { id: String(row.id) };
			for (const name of columns) {
				const value = row[name];
				kept[name] =
					isJsonColumn(table, name) && value !== null && value !== undefined
						? plain(typeof value === "string" ? value : JSON.stringify(value))
						: plain(value);
			}
			return kept;
		});
	}

	async function spaceRow(spaceId: string): Promise<Row> {
		const rows = await context.driver.all(
			`SELECT "id", "kind", "name", "colour", "icon", "base_currency", "timezone"
			 FROM "spaces" WHERE "id" = ? AND "deleted_at" IS NULL`,
			[spaceId],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("space", spaceId);
		return first;
	}

	async function gather(spaceId: string): Promise<BackupSpace> {
		const space = await spaceRow(spaceId);
		const tables: Record<string, Record<string, SqlValue>[]> = {};
		for (const table of BACKUP_TABLES) {
			tables[table.name] = await rowsOf(table, spaceId);
		}

		return {
			id: String(space.id),
			kind: String(space.kind),
			name: String(space.name),
			colour: String(space.colour),
			icon: String(space.icon),
			baseCurrency: String(space.base_currency),
			timezone: String(space.timezone),
			tables,
		};
	}

	/** The people the gathered rows point at, so the file can name them. */
	async function peopleIn(gathered: readonly BackupSpace[]): Promise<Backup["people"]> {
		const ids = new Set<string>();
		for (const space of gathered) {
			for (const table of BACKUP_TABLES) {
				const names = peopleColumns(table);
				if (names.length === 0) continue;
				for (const row of space.tables[table.name] ?? []) {
					for (const name of names) {
						const value = row[name];
						if (typeof value === "string" && value !== "") ids.add(value);
					}
				}
			}
		}
		if (ids.size === 0) return [];

		const found: Backup["people"] = [];
		for (const part of chunk([...ids], 200)) {
			const rows = await context.driver.all(
				`SELECT "id", "name" FROM "users" WHERE "id" IN (${marks(part.length)})`,
				part,
			);
			for (const row of rows) found.push({ id: String(row.id), name: String(row.name) });
		}
		return found;
	}

	return {
		/** Everything in one space, as a file somebody can read and keep. */
		async exportSpace(spaceId: string): Promise<Backup> {
			assertCan(context.actor(), spaceId, "backup.export");
			const gathered = [await gather(spaceId)];
			return {
				format: BACKUP_FORMAT,
				version: BACKUP_VERSION,
				exportedAt: context.now(),
				spaces: gathered,
				people: await peopleIn(gathered),
			};
		},

		/**
		 * Which spaces this person may take a copy of.
		 *
		 * The screen offers a list to tick and has to know which lines it may offer, and
		 * the answer is a permission, so it is answered here rather than worked out from
		 * a role the screen would have to fetch and interpret for itself.
		 */
		async copyable(): Promise<string[]> {
			return readableSpaceIds(context.actor()).filter((id) => context.can(id, "backup.export"));
		},

		/**
		 * Which spaces already here this person may write a file back into.
		 *
		 * The same shape as copyable and a different question, asked apart from it on
		 * purpose: the two permissions hold the same roles today, and a screen that asked
		 * one and acted on the other would break the day either list changed, silently.
		 *
		 * A space the file carries that is not here at all is not in this list and does not
		 * need to be: one that arrives with nobody in it is nobody's to refuse, and whoever
		 * brings it in becomes its owner.
		 */
		async restorable(): Promise<string[]> {
			return readableSpaceIds(context.actor()).filter((id) => context.can(id, "backup.restore"));
		},

		/**
		 * The spaces somebody ticked, in one file.
		 *
		 * One file whether it holds one space or nine, because two file shapes meant two
		 * buttons, two names and a person deciding which of the two was their backup.
		 */
		async exportSpaces(spaceIds: readonly string[]): Promise<Backup> {
			for (const spaceId of spaceIds) assertCan(context.actor(), spaceId, "backup.export");

			const gathered: BackupSpace[] = [];
			for (const spaceId of spaceIds) gathered.push(await gather(spaceId));

			return {
				format: BACKUP_FORMAT,
				version: BACKUP_VERSION,
				exportedAt: context.now(),
				spaces: gathered,
				people: await peopleIn(gathered),
			};
		},

		/**
		 * Every space this person may export. This is the file that moves somebody from
		 * the browser to their own server, so it has to be one file and not a folder.
		 */
		async exportEverything(): Promise<Backup> {
			return this.exportSpaces(await this.copyable());
		},

		/**
		 * Records with the names of what they point at, for a spreadsheet. The identifiers
		 * are left out on purpose: this file is for reading, and the backup above is the
		 * one that comes back.
		 */
		async recordsForExport(
			spaceId: string,
			range: { from?: string; to?: string } = {},
		): Promise<RecordForExport[]> {
			assertCan(context.actor(), spaceId, "transaction.read");

			const where = [`t."space_id" = ?`, `t."deleted_at" IS NULL`];
			const params: SqlValue[] = [spaceId];
			// The same narrowing the list itself carries. A logger sees the records they
			// wrote and no others, and this door handed them the whole space in a
			// spreadsheet, which is the one place the role was not being kept.
			if (seesOwnRowsOnly(context.actor(), spaceId)) {
				where.push(`t."created_by" = ?`);
				params.push(context.actor().userId);
			}
			if (range.from) {
				where.push(`t."happened_on" >= ?`);
				params.push(range.from);
			}
			if (range.to) {
				where.push(`t."happened_on" <= ?`);
				params.push(range.to);
			}

			const rows = await context.driver.all(
				`SELECT t."happened_on", t."description", t."amount", t."currency", t."kind",
				        t."status", t."notes", t."invoice_month", t."priority", t."external_id",
				        t."installment_number", t."installment_count",
				        a."name" AS account_name, b."name" AS counter_name, b."kind" AS counter_kind,
				        c."name" AS category_name,
				        d."name" AS card_name
				 FROM "transactions" t
				 JOIN "accounts" a ON a."id" = t."account_id"
				 LEFT JOIN "accounts" b ON b."id" = t."counter_account_id"
				 LEFT JOIN "categories" c ON c."id" = t."category_id"
				 LEFT JOIN "cards" d ON d."id" = t."card_id" AND d."deleted_at" IS NULL
				 WHERE ${where.join(" AND ")}
				 ORDER BY t."happened_on", t."created_at"`,
				params,
			);

			return rows.map((row) => ({
				happenedOn: String(row.happened_on),
				description: String(row.description),
				amount: Number(row.amount),
				currency: String(row.currency),
				kind: String(row.kind),
				status: String(row.status),
				account: String(row.account_name),
				counterAccount: row.counter_name === null ? null : String(row.counter_name),
				counterKind: row.counter_kind === null ? null : String(row.counter_kind),
				card: row.card_name === null ? null : String(row.card_name),
				category: row.category_name === null ? null : String(row.category_name),
				priority: row.priority === null ? null : String(row.priority),
				notes: row.notes === null ? null : String(row.notes),
				invoiceMonth: row.invoice_month === null ? null : String(row.invoice_month),
				installment:
					row.installment_number === null
						? null
						: `${Number(row.installment_number)}/${Number(row.installment_count)}`,
				externalId: row.external_id === null ? null : String(row.external_id),
			}));
		},

		/**
		 * Puts a backup into this database.
		 *
		 * Rows keep their identifiers, which is what lets a device that still holds the
		 * original meet this one later and agree instead of duplicating. A row that is
		 * already in the space it belongs to is left alone, so running the same file
		 * twice changes nothing the second time.
		 *
		 * A row whose identifier is taken by something in another space is a different
		 * situation: the file is being restored beside the original, on a server where
		 * somebody else already has it. That row gets a new identifier, and everything
		 * pointing at it follows, so the copy is whole and the original is untouched.
		 */
		async restore(backup: Backup, options: RestoreOptions = {}): Promise<RestoreResult> {
			if (backup?.format !== BACKUP_FORMAT) {
				throw new RuleError("notABackup", "this file is not a backup written by this application");
			}
			if (backup.version > BACKUP_VERSION) {
				throw new RuleError(
					"backupIsNewer",
					"this backup was written by a newer version, update before restoring it",
				);
			}

			const actor = context.actor();
			const outcomes: RestoreOutcome[] = [];

			// Which of the people named in the file this database actually knows.
			const named = backup.people?.map((person) => person.id) ?? [];
			const known = new Set<string>([actor.userId]);
			for (const part of chunk(named, 200)) {
				const rows = await context.driver.all(
					`SELECT "id" FROM "users" WHERE "id" IN (${marks(part.length)})`,
					part,
				);
				for (const row of rows) known.add(String(row.id));
			}

			// A file can hold more than one space and somebody may want only some of them
			// back. Which ones is decided here rather than by trimming the file on the way
			// in, so that both modes cut it the same way and the file itself is untouched.
			const only = options.only ? new Set(options.only) : null;
			const chosen = (backup.spaces ?? []).filter((space) => !only || only.has(space.id));

			/**
			 * Where one space of the file lands, and whether that is a space that already
			 * exists here. Read only, so it can be asked before anything is written.
			 */
			async function landingFor(
				space: BackupSpace,
			): Promise<{ spaceId: string; intoExisting: boolean }> {
				// A personal space goes back into the personal space this person already
				// has, because nobody has two.
				const mine = await context.driver.all(
					`SELECT s."id" FROM "spaces" s
					 JOIN "space_members" m ON m."space_id" = s."id"
					 WHERE s."kind" = 'personal' AND m."user_id" = ? AND s."deleted_at" IS NULL
					   AND m."deleted_at" IS NULL`,
					[actor.userId],
				);

				// The same space, already here and already theirs, means the file is being
				// put back rather than copied, so it goes into the space it came from.
				const already = await context.driver.all(
					`SELECT s."id", m."user_id" FROM "spaces" s
					 LEFT JOIN "space_members" m ON m."space_id" = s."id" AND m."user_id" = ?
					   AND m."state" = 'active' AND m."deleted_at" IS NULL
					 WHERE s."id" = ?`,
					[actor.userId, space.id],
				);

				const theirsAlready = already.length > 0 && already[0]?.user_id !== null;
				return {
					intoExisting: (space.kind === "personal" && mine.length > 0) || theirsAlready,
					spaceId:
						space.kind === "personal" && mine.length > 0
							? String(mine[0]?.id)
							: theirsAlready
								? space.id
								: // Somebody else's copy of the same space: a copy from here on.
									already.length > 0
									? uuidV7()
									: space.id,
				};
			}

			// Every refusal, before the first write.
			//
			// Pouring a whole space into one that is already here is the decision that
			// exporting one is, in the other direction, so it asks for the same role. A
			// space this restore creates is not checked, because until a moment ago it did
			// not exist and nobody had a role in it.
			//
			// This used to be asked inside the loop, one space at a time, and each space is
			// its own transaction. A file of five spaces whose fourth was refused left three
			// of them written, and the screen showed the refusal and nothing else.
			for (const space of chosen) {
				const { spaceId, intoExisting } = await landingFor(space);
				if (intoExisting) assertCan(actor, spaceId, "backup.restore");
			}

			for (const space of chosen) {
				const { spaceId, intoExisting } = await landingFor(space);

				const skipped = new Map<string, number>();
				// Old identifier to new one, for the rows that had to be given another.
				const renamed = new Map<string, string>();
				let written = 0;

				await context.driver.transaction(async (tx) => {
					const write = { ...context.write(), driver: tx };

					if (!intoExisting) {
						await insertRow(write, {
							table: spaces,
							spaceId,
							id: spaceId,
							values: {
								kind: space.kind,
								name: space.name,
								colour: space.colour,
								icon: space.icon,
								base_currency: space.baseCurrency,
								timezone: space.timezone,
								created_by: actor.userId,
							},
						});
						await insertRow(write, {
							table: spaceMembers,
							spaceId,
							values: {
								user_id: actor.userId,
								role: "owner",
								state: "active",
								invited_by: null,
								accepted_at: context.now(),
							},
						});
					}

					for (const table of BACKUP_TABLES) {
						const rows = space.tables?.[table.name] ?? [];
						if (rows.length === 0) continue;

						// An identifier already in this space means the row is back where it
						// came from. The same identifier in another space means something
						// else entirely, so the two are counted apart.
						const inThisSpace = new Set<string>();
						const elsewhere = new Set<string>();
						for (const part of chunk(
							rows.map((row) => String(row.id)),
							400,
						)) {
							const found = await tx.all(
								`SELECT "id", "space_id" FROM "${table.name}" WHERE "id" IN (${marks(part.length)})`,
								part,
							);
							for (const row of found) {
								if (String(row.space_id) === spaceId) inThisSpace.add(String(row.id));
								else elsewhere.add(String(row.id));
							}
						}

						const names = peopleColumns(table);
						const pointers = pointerColumns(table);

						for (const row of rows) {
							const id = String(row.id);
							if (inThisSpace.has(id)) {
								skipped.set(
									`${table.name}|alreadyHere`,
									(skipped.get(`${table.name}|alreadyHere`) ?? 0) + 1,
								);
								continue;
							}

							if (elsewhere.has(id)) renamed.set(id, uuidV7());
							const writtenId = renamed.get(id) ?? id;

							const values: Record<string, SqlValue> = {};
							let lost = false;

							for (const name of columnsOf(table)) {
								const value = row[name] ?? null;
								if (name === "created_by") {
									values[name] = actor.userId;
									continue;
								}
								if (names.includes(name)) {
									// A share that belongs to somebody this database has never
									// heard of cannot be written as belonging to anybody else.
									if (typeof value === "string" && !known.has(value)) {
										if (requiredColumn(table, name)) {
											lost = true;
											break;
										}
										values[name] = null;
										continue;
									}
								}
								// A row that points at another row of the backup follows it
								// when that row had to be given a new identifier.
								values[name] =
									pointers.includes(name) && typeof value === "string"
										? (renamed.get(value) ?? value)
										: value;
							}

							if (lost) {
								skipped.set(
									`${table.name}|unknownPerson`,
									(skipped.get(`${table.name}|unknownPerson`) ?? 0) + 1,
								);
								continue;
							}

							await insertRow(write, { table, spaceId, id: writtenId, values });
							written += 1;
						}
					}
				});

				if (!intoExisting) await context.refreshActor();

				outcomes.push({
					spaceId,
					name: space.name,
					created: !intoExisting,
					written,
					skipped: [...skipped.entries()].map(([key, count]) => {
						const [table, reason] = key.split("|");
						return {
							table: table ?? "",
							reason: (reason ?? "alreadyHere") as "alreadyHere" | "unknownPerson",
							count,
						};
					}),
				});
			}

			// The file holds the rows as the release that wrote it left them, and they were
			// just written now, so they are newer than any repair made here before.
			await repairAfterArrival(
				context,
				outcomes.map((outcome) => outcome.spaceId),
			);

			return { spaces: outcomes };
		},
	};
}

export type BackupRepository = ReturnType<typeof createBackupRepository>;
