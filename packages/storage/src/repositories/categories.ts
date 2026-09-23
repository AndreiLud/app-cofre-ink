// Categories, two levels deep and no deeper.
//
// The depth limit is enforced here rather than left to the screens, because the screens
// are not the only thing that writes: an import, a rule or another client would all
// find the same wall. A category that already has children cannot become a child, and a
// child cannot take children of its own.

import { DEFAULT_CATEGORIES, type DefaultCategory, type SpendingPriority } from "@cofre/core";
import { categories, transactions } from "@cofre/db";
import { assertCan, readableSpaceIds } from "../actor.ts";
import type { SqlValue } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { type Category, type CategoryKind, toCategory } from "../models.ts";
import { marks } from "../sql.ts";
import { insertRow, softDeleteRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

export type CreateCategoryInput = {
	spaceId: string;
	name: string;
	kind: CategoryKind;
	priority?: SpendingPriority;
	/** Given to hang this one under a category that stands on its own. */
	parentId?: string | null;
	colour?: string | null;
	icon?: string | null;
	position?: number;
};

export type UpdateCategoryInput = {
	name?: string;
	priority?: SpendingPriority;
	parentId?: string | null;
	colour?: string | null;
	icon?: string | null;
	position?: number;
};

const SELECT = `SELECT "id", "space_id", "name", "kind", "priority", "parent_id", "colour",
	"icon", "position", "archived_at", "created_by", "created_at", "updated_at"
	FROM "categories"`;

export function createCategoriesRepository(context: RepositoryContext) {
	async function inSpace(spaceId: string, id: string): Promise<Category> {
		const rows = await context.driver.all(
			`${SELECT} WHERE "id" = ? AND "space_id" = ? AND "deleted_at" IS NULL`,
			[id, spaceId],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("category", id);
		return toCategory(first);
	}

	/** A category in somebody else's space is not refused, it simply is not there. */
	async function reachable(id: string): Promise<Category> {
		const spaceIds = readableSpaceIds(context.actor());
		if (spaceIds.length === 0) throw new NotFoundError("category", id);
		const rows = await context.driver.all(
			`${SELECT} WHERE "id" = ? AND "space_id" IN (${marks(spaceIds.length)}) AND "deleted_at" IS NULL`,
			[id, ...spaceIds],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("category", id);
		return toCategory(first);
	}

	async function listIn(spaceId: string, includeArchived = false): Promise<Category[]> {
		assertCan(context.actor(), spaceId, "category.read");
		const archived = includeArchived ? "" : ` AND "archived_at" IS NULL`;
		const rows = await context.driver.all(
			`${SELECT} WHERE "space_id" = ? AND "deleted_at" IS NULL${archived}
			 ORDER BY "kind" DESC, "position", "name"`,
			[spaceId],
		);
		return rows.map(toCategory);
	}

	async function childCount(id: string): Promise<number> {
		const rows = await context.driver.all(
			`SELECT COUNT(*) AS total FROM "categories" WHERE "parent_id" = ? AND "deleted_at" IS NULL`,
			[id],
		);
		return Number(rows[0]?.total ?? 0);
	}

	/** The parent a category may hang under, or nothing when it stands on its own. */
	async function parentFor(
		spaceId: string,
		parentId: string | null | undefined,
		self?: Category,
	): Promise<string | null> {
		if (!parentId) return null;
		if (self && parentId === self.id) {
			throw new RuleError("categoryIsNotItsOwnParent", "a category cannot hang under itself");
		}

		const parent = await inSpace(spaceId, parentId);
		if (parent.parentId !== null) {
			throw new RuleError(
				"categoryDepthIsTwo",
				"a category goes one level under another one and no deeper",
			);
		}
		if (self && (await childCount(self.id)) > 0) {
			throw new RuleError(
				"categoryHasChildren",
				"this category has categories under it, so it cannot become one of them",
			);
		}
		return parent.id;
	}

	function checkName(name: string): string {
		const trimmed = name.trim();
		if (trimmed === "") {
			throw new RuleError("nameIsRequired", "a category needs a name to be picked later");
		}
		return trimmed;
	}

	return {
		list: (spaceId: string, options: { includeArchived?: boolean } = {}) =>
			listIn(spaceId, options.includeArchived === true),

		async get(id: string): Promise<Category> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "category.read");
			return found;
		},

		async create(input: CreateCategoryInput): Promise<Category> {
			assertCan(context.actor(), input.spaceId, "category.write");
			const name = checkName(input.name);
			const parentId = await parentFor(input.spaceId, input.parentId);

			const id = await insertRow(context.write(), {
				table: categories,
				spaceId: input.spaceId,
				values: {
					name,
					kind: input.kind,
					priority: input.priority ?? "important",
					parent_id: parentId,
					colour: input.colour ?? null,
					icon: input.icon ?? null,
					position: input.position ?? 0,
					archived_at: null,
					created_by: context.actor().userId,
				},
			});
			return inSpace(input.spaceId, id);
		},

		async update(id: string, input: UpdateCategoryInput): Promise<Category> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "category.write");

			const values: Record<string, SqlValue> = {};
			if (input.name !== undefined) values.name = checkName(input.name);
			if (input.priority !== undefined) values.priority = input.priority;
			if (input.parentId !== undefined) {
				values.parent_id = await parentFor(found.spaceId, input.parentId, found);
			}
			if (input.colour !== undefined) values.colour = input.colour;
			if (input.icon !== undefined) values.icon = input.icon;
			if (input.position !== undefined) values.position = input.position;

			await updateRow(context.write(), {
				table: categories,
				spaceId: found.spaceId,
				id,
				values,
			});
			return inSpace(found.spaceId, id);
		},

		/** Out of the way, and still readable on the records that already point at it. */
		async archive(id: string): Promise<Category> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "category.write");
			await updateRow(context.write(), {
				table: categories,
				spaceId: found.spaceId,
				id,
				values: { archived_at: context.now() },
			});
			return inSpace(found.spaceId, id);
		},

		async unarchive(id: string): Promise<Category> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "category.write");
			await updateRow(context.write(), {
				table: categories,
				spaceId: found.spaceId,
				id,
				values: { archived_at: null },
			});
			return inSpace(found.spaceId, id);
		},

		/**
		 * Removes a category and lets go of the records that used it, which then show as
		 * not sorted. The alternative, refusing while anything points at it, turns a
		 * mistake made on day one into something that can never be cleaned up.
		 */
		async remove(id: string): Promise<void> {
			const found = await reachable(id);
			assertCan(context.actor(), found.spaceId, "category.write");

			if ((await childCount(id)) > 0) {
				throw new RuleError(
					"categoryHasChildren",
					"this category has categories under it, remove or move them first",
				);
			}

			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				const using = await tx.all(
					`SELECT "id" FROM "transactions" WHERE "category_id" = ? AND "deleted_at" IS NULL`,
					[id],
				);
				for (const row of using) {
					await updateRow(write, {
						table: transactions,
						spaceId: found.spaceId,
						id: String(row.id),
						values: { category_id: null },
					});
				}
				await softDeleteRow(write, { table: categories, spaceId: found.spaceId, id });
			});
		},

		/**
		 * Writes the starting set. It refuses to run twice, because the point is to give
		 * a new space something to work with, not to duplicate what somebody has already
		 * made their own.
		 */
		async installDefaults(input: { spaceId: string; language?: "pt" | "en" }): Promise<Category[]> {
			assertCan(context.actor(), input.spaceId, "category.write");

			const existing = await context.driver.all(
				`SELECT "id" FROM "categories" WHERE "space_id" = ? AND "deleted_at" IS NULL LIMIT 1`,
				[input.spaceId],
			);
			if (existing.length > 0) {
				throw new RuleError(
					"categoriesAlreadyThere",
					"this space already has categories, so the starting set was not written again",
				);
			}

			const language = input.language ?? "pt";
			const nameOf = (category: DefaultCategory) => (language === "en" ? category.en : category.pt);

			await context.driver.transaction(async (tx) => {
				const write = { ...context.write(), driver: tx };
				let position = 0;

				for (const parent of DEFAULT_CATEGORIES) {
					const parentId = await insertRow(write, {
						table: categories,
						spaceId: input.spaceId,
						values: {
							name: nameOf(parent),
							kind: parent.kind,
							priority: parent.priority,
							parent_id: null,
							colour: null,
							icon: null,
							position: position++,
							archived_at: null,
							created_by: context.actor().userId,
						},
					});

					let childPosition = 0;
					for (const child of parent.children ?? []) {
						await insertRow(write, {
							table: categories,
							spaceId: input.spaceId,
							values: {
								name: nameOf(child),
								kind: child.kind,
								priority: child.priority,
								parent_id: parentId,
								colour: null,
								icon: null,
								position: childPosition++,
								archived_at: null,
								created_by: context.actor().userId,
							},
						});
					}
				}
			});

			return listIn(input.spaceId);
		},
	};
}

export type CategoriesRepository = ReturnType<typeof createCategoriesRepository>;
