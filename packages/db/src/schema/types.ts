// The schema is described once, in this vocabulary, and turned into SQL for SQLite
// and for PostgreSQL. One description means the two dialects cannot drift apart, and
// it is the place where the rule "every data row belongs to a space" is enforced by
// construction instead of by review.

export type ColumnType = "text" | "integer" | "bigint" | "real" | "blob" | "json";

export type ReferenceAction = "cascade" | "restrict" | "setNull";

export type Reference = {
	table: string;
	column: string;
	onDelete?: ReferenceAction;
};

export type Column = {
	name: string;
	type: ColumnType;
	notNull?: boolean;
	primaryKey?: boolean;
	unique?: boolean;
	/** Written into the SQL as given, so it has to be valid in both dialects. */
	defaultTo?: string | number;
	references?: Reference;
	/** A portable condition, for example "kind in ('personal', 'shared')". */
	check?: string;
};

export type Index = {
	name: string;
	columns: string[];
	unique?: boolean;
};

/**
 * global: rows that exist above any space, such as a person.
 * membership: rows that decide who may see a space.
 * space: everything else, which always carries space_id.
 */
export type TableScope = "global" | "membership" | "space";

export type Table = {
	name: string;
	scope: TableScope;
	/** Replicated tables carry the sync columns and are written through the change log. */
	replicated: boolean;
	columns: Column[];
	indexes: Index[];
	uniqueTogether: string[][];
};

export type TableInput = {
	name: string;
	scope: TableScope;
	replicated?: boolean;
	columns: Column[];
	indexes?: Index[];
	uniqueTogether?: string[][];
};

const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

export class SchemaError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SchemaError";
	}
}

/** Columns every replicated row carries, whatever the table. */
function syncColumns(): Column[] {
	return [
		{ name: "created_at", type: "bigint", notNull: true },
		{ name: "updated_at", type: "bigint", notNull: true },
		{ name: "updated_by", type: "text" },
		// A tombstone, so a deletion can travel to another device.
		{ name: "deleted_at", type: "bigint" },
		// The hybrid stamp of the last write, used to resolve a conflict.
		{ name: "hlc", type: "text", notNull: true },
	];
}

/**
 * Builds a table, adding the identifier, the sync columns and, for a table in the
 * space scope, the space it belongs to. A table in the space scope cannot be declared
 * without that column, because this function is the only way to declare one.
 */
export function defineTable(input: TableInput): Table {
	if (!IDENTIFIER.test(input.name)) {
		throw new SchemaError(`"${input.name}" is not a valid table name`);
	}

	const replicated = input.replicated ?? true;
	const declared = input.columns;

	for (const column of declared) {
		if (!IDENTIFIER.test(column.name)) {
			throw new SchemaError(`"${input.name}.${column.name}" is not a valid column name`);
		}
	}

	const reserved = new Set(["id", "space_id"]);
	if (replicated) {
		for (const column of syncColumns()) reserved.add(column.name);
	}
	for (const column of declared) {
		if (reserved.has(column.name)) {
			throw new SchemaError(
				`"${input.name}.${column.name}" is added automatically, declare only the columns of the domain`,
			);
		}
	}

	const columns: Column[] = [{ name: "id", type: "text", primaryKey: true, notNull: true }];

	if (input.scope === "space" || input.scope === "membership") {
		columns.push({
			name: "space_id",
			type: "text",
			notNull: true,
			references: { table: "spaces", column: "id", onDelete: "cascade" },
		});
	}

	columns.push(...declared);
	if (replicated) columns.push(...syncColumns());

	const indexes = [...(input.indexes ?? [])];
	if (input.scope === "space" || input.scope === "membership") {
		indexes.unshift({ name: `${input.name}_by_space`, columns: ["space_id"] });
	}

	return {
		name: input.name,
		scope: input.scope,
		replicated,
		columns,
		indexes,
		uniqueTogether: input.uniqueTogether ?? [],
	};
}
