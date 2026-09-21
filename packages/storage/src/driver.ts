// The narrow door to a database.
//
// Everything above this file writes SQL with question marks as placeholders and
// nothing else that is dialect specific. Each adapter below turns that into whatever
// its engine expects. Keeping the port this small is what lets the same repositories,
// and the same tests, run against a database in a browser tab, a file on a server and
// a managed PostgreSQL.

import type { Dialect } from "@cofre/db";

export type SqlValue = string | number | null;
export type Row = Record<string, unknown>;

export type Driver = {
	readonly dialect: Dialect;
	/** Runs a query and gives back every row. */
	all(sql: string, params?: readonly SqlValue[]): Promise<Row[]>;
	/** Runs a statement that returns nothing. */
	run(sql: string, params?: readonly SqlValue[]): Promise<void>;
	/**
	 * Runs the work inside a transaction. Calling it again inside the work joins the
	 * transaction already open instead of opening another one, because none of the
	 * engines here supports a real nested transaction in the same way.
	 */
	transaction<T>(work: (tx: Driver) => Promise<T>): Promise<T>;
	close(): Promise<void>;
};

/** PostgreSQL numbers its placeholders, SQLite does not. */
export function numberPlaceholders(sql: string): string {
	let index = 0;
	return sql.replace(/\?/g, () => {
		index += 1;
		return `$${index}`;
	});
}

export class StorageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StorageError";
	}
}

/** Reads a value that PostgreSQL may hand back as text while SQLite hands a number. */
export function asNumber(value: unknown): number {
	if (typeof value === "number") return value;
	if (typeof value === "bigint") return Number(value);
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	throw new StorageError(`expected a number, received ${JSON.stringify(value)}`);
}

export function asOptionalNumber(value: unknown): number | null {
	return value === null || value === undefined ? null : asNumber(value);
}

export function asText(value: unknown): string {
	if (typeof value === "string") return value;
	throw new StorageError(`expected text, received ${JSON.stringify(value)}`);
}

export function asOptionalText(value: unknown): string | null {
	return value === null || value === undefined ? null : asText(value);
}

/** PostgreSQL gives back parsed json, SQLite gives back the text it stored. */
export function asJson<T>(value: unknown): T {
	if (typeof value === "string") return JSON.parse(value) as T;
	if (value !== null && typeof value === "object") return value as T;
	throw new StorageError(`expected json, received ${JSON.stringify(value)}`);
}
