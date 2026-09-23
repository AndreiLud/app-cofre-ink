// Categories, and the priority that turns a list of expenses into a decision.
//
// Two levels and no more. One level forces a choice between detail and overview, and
// three becomes a taxonomy project that nobody keeps up to date. So a category either
// stands on its own or hangs under one that does, which the repository enforces.
//
// The priority is the part most apps leave out. Knowing that food cost two thousand
// says little. Knowing that four hundred of it was food nobody needed is the number
// somebody can act on.

import { defineTable } from "./types.ts";

export const CATEGORY_KINDS = ["expense", "income"] as const;

/** From what keeps the lights on to what was bought because it was there. */
export const PRIORITIES = ["essential", "important", "desirable", "superfluous"] as const;

function inList(column: string, values: readonly string[]): string {
	return `${column} in (${values.map((value) => `'${value}'`).join(", ")})`;
}

export const categories = defineTable({
	name: "categories",
	scope: "space",
	columns: [
		{ name: "name", type: "text", notNull: true },
		{ name: "kind", type: "text", notNull: true, check: inList("kind", CATEGORY_KINDS) },
		{
			name: "priority",
			type: "text",
			notNull: true,
			defaultTo: "'important'",
			check: inList("priority", PRIORITIES),
		},
		/** Empty for a category that stands on its own. Never points at a child. */
		{
			name: "parent_id",
			type: "text",
			references: { table: "categories", column: "id", onDelete: "restrict" },
		},
		{ name: "colour", type: "text" },
		{ name: "icon", type: "text" },
		{ name: "position", type: "integer", notNull: true, defaultTo: 0 },
		/** Kept instead of deleted, so old records still say where the money went. */
		{ name: "archived_at", type: "bigint" },
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "restrict" },
		},
	],
	indexes: [
		{ name: "categories_by_space_and_kind", columns: ["space_id", "kind"] },
		{ name: "categories_by_parent", columns: ["parent_id"] },
	],
});

export const CATEGORY_TABLES = [categories] as const;
