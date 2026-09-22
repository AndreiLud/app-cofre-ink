// What a person keeps looking at.
//
// A saved filter is a question somebody asks often: what went through the card this
// month, what is still to pay, what the market costs. It belongs to the person who
// wrote it and to the space it looks at, which is why it is a row here and not
// something the browser keeps to itself. Written on one device, it is there on the
// next one.

import { defineTable } from "./types.ts";

export const savedFilters = defineTable({
	name: "saved_filters",
	scope: "space",
	columns: [
		{ name: "name", type: "text", notNull: true },
		/** The filter as the screen writes it, so a new field costs no migration. */
		{ name: "query", type: "json", notNull: true },
		/** The order the person dragged them into, lowest first. */
		{ name: "position", type: "integer", notNull: true, defaultTo: 0 },
		{
			name: "created_by",
			type: "text",
			notNull: true,
			references: { table: "users", column: "id", onDelete: "cascade" },
		},
	],
	indexes: [{ name: "saved_filters_by_owner", columns: ["space_id", "created_by"] }],
});

export const VIEW_TABLES = [savedFilters] as const;
