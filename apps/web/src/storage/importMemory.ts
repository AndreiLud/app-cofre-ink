// What this device learned from the last import.
//
// A person who corrects the same column twice has been let down twice. So the two
// things they can correct, which account the file belongs to and what each column is,
// are remembered against the shape of the file and offered already filled in the next
// time a file of that shape arrives.
//
// It lives in this browser because it is a habit of this device, not a fact about the
// money. Losing it costs one correction.

import type { FieldName, SignMeaning } from "@cofre/importers";

const MAPPINGS = "cofreImportColumns";
const ACCOUNTS = "cofreImportAccounts";
const SIGNS = "cofreImportSigns";

function read<T>(key: string): Record<string, T> {
	try {
		const raw = localStorage.getItem(key);
		return raw === null ? {} : (JSON.parse(raw) as Record<string, T>);
	} catch {
		return {};
	}
}

function write<T>(key: string, value: Record<string, T>): void {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Without storage the person corrects it again, which is the old behaviour.
	}
}

export function recallColumns(spaceId: string, shape: string): FieldName[] | null {
	if (shape === "") return null;
	return read<FieldName[]>(MAPPINGS)[`${spaceId}:${shape}`] ?? null;
}

export function rememberColumns(
	spaceId: string,
	shape: string,
	fields: readonly FieldName[],
): void {
	if (shape === "") return;
	const all = read<FieldName[]>(MAPPINGS);
	all[`${spaceId}:${shape}`] = [...fields];
	write(MAPPINGS, all);
}

/** Whether a file of this shape writes a purchase as a positive number. */
export function recallSign(spaceId: string, shape: string): SignMeaning | null {
	if (shape === "") return null;
	return read<SignMeaning>(SIGNS)[`${spaceId}:${shape}`] ?? null;
}

export function rememberSign(spaceId: string, shape: string, sign: SignMeaning): void {
	if (shape === "") return;
	const all = read<SignMeaning>(SIGNS);
	all[`${spaceId}:${shape}`] = sign;
	write(SIGNS, all);
}

/** The account a file of this shape, or from this bank, went into last time. */
export function recallAccount(spaceId: string, key: string): string | null {
	if (key === "") return null;
	return read<string>(ACCOUNTS)[`${spaceId}:${key}`] ?? null;
}

export function rememberAccount(spaceId: string, key: string, accountId: string): void {
	if (key === "" || accountId === "") return;
	const all = read<string>(ACCOUNTS);
	all[`${spaceId}:${key}`] = accountId;
	write(ACCOUNTS, all);
}
