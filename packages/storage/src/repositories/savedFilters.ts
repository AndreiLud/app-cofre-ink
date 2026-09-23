// Saved filters, which belong to one person inside one space.
//
// Every method here scopes by author as well as by space. Two people sharing a house
// see the same money and their own shortcuts, and nobody has to explain to anybody why
// a filter called "meus cafés" showed up on their screen.

import { savedFilters } from "@cofre/db";
import { assertCan, readableSpaceIds } from "../actor.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { type SavedFilter, toSavedFilter } from "../models.ts";
import { marks } from "../sql.ts";
import { insertRow, softDeleteRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

export type CreateSavedFilterInput = {
	spaceId: string;
	name: string;
	query: Record<string, unknown>;
	position?: number;
};

export type UpdateSavedFilterInput = {
	name?: string;
	query?: Record<string, unknown>;
	position?: number;
};

const SELECT = `SELECT "id", "space_id", "name", "query", "position", "created_by",
	"created_at", "updated_at"
	FROM "saved_filters"`;

export function createSavedFiltersRepository(context: RepositoryContext) {
	/** Somebody else's filter is not refused, it simply is not there. */
	async function mine(id: string): Promise<SavedFilter> {
		const spaceIds = readableSpaceIds(context.actor());
		if (spaceIds.length === 0) throw new NotFoundError("savedFilter", id);
		const rows = await context.driver.all(
			`${SELECT} WHERE "id" = ? AND "created_by" = ? AND "space_id" IN (${marks(spaceIds.length)})
			 AND "deleted_at" IS NULL`,
			[id, context.actor().userId, ...spaceIds],
		);
		const first = rows[0];
		if (!first) throw new NotFoundError("savedFilter", id);
		return toSavedFilter(first);
	}

	function checkName(name: string): string {
		const trimmed = name.trim();
		if (trimmed === "") {
			throw new RuleError("nameIsRequired", "a saved filter needs a name to be picked later");
		}
		return trimmed;
	}

	return {
		async list(spaceId: string): Promise<SavedFilter[]> {
			assertCan(context.actor(), spaceId, "filter.read");
			const rows = await context.driver.all(
				`${SELECT} WHERE "space_id" = ? AND "created_by" = ? AND "deleted_at" IS NULL
				 ORDER BY "position", "created_at"`,
				[spaceId, context.actor().userId],
			);
			return rows.map(toSavedFilter);
		},

		async create(input: CreateSavedFilterInput): Promise<SavedFilter> {
			assertCan(context.actor(), input.spaceId, "filter.write");
			const name = checkName(input.name);

			const id = await insertRow(context.write(), {
				table: savedFilters,
				spaceId: input.spaceId,
				values: {
					name,
					query: JSON.stringify(input.query ?? {}),
					position: input.position ?? 0,
					created_by: context.actor().userId,
				},
			});
			return mine(id);
		},

		async update(id: string, input: UpdateSavedFilterInput): Promise<SavedFilter> {
			const found = await mine(id);
			assertCan(context.actor(), found.spaceId, "filter.write");

			const values: Record<string, string | number> = {};
			if (input.name !== undefined) values.name = checkName(input.name);
			if (input.query !== undefined) values.query = JSON.stringify(input.query);
			if (input.position !== undefined) values.position = input.position;

			await updateRow(context.write(), {
				table: savedFilters,
				spaceId: found.spaceId,
				id,
				values,
			});
			return mine(id);
		},

		async remove(id: string): Promise<void> {
			const found = await mine(id);
			assertCan(context.actor(), found.spaceId, "filter.write");
			await softDeleteRow(context.write(), {
				table: savedFilters,
				spaceId: found.spaceId,
				id,
			});
		},
	};
}

export type SavedFiltersRepository = ReturnType<typeof createSavedFiltersRepository>;
