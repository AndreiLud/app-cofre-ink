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

/** Where a file went: the account, and the plastic when it was a card's. */
export type RememberedWay = { accountId: string; cardId: string | null };

/**
 * Where a file of this shape, or a document of this bank, kind and card, went last time.
 *
 * Kept by the bank alone it sent the invoice of a second card of the same bank to the first,
 * and it kept only the account, so the plastic was lost. Written by 1.x as the account alone,
 * which is still read.
 */
export function recallWay(spaceId: string, key: string): RememberedWay | null {
	if (key === "") return null;
	const found = read<string | RememberedWay>(ACCOUNTS)[`${spaceId}:${key}`];
	if (found === undefined || found === null) return null;
	return typeof found === "string" ? { accountId: found, cardId: null } : found;
}

export function rememberWay(spaceId: string, key: string, way: RememberedWay): void {
	if (key === "" || way.accountId === "") return;
	const all = read<string | RememberedWay>(ACCOUNTS);
	all[`${spaceId}:${key}`] = way;
	write(ACCOUNTS, all);
}

/** The key a document is remembered by: its bank, its kind and the digits of its card. */
export function documentKey(
	bank: string | null,
	kind: string | null,
	digits: readonly string[],
): string {
	if (!bank && digits.length === 0) return "";
	return [bank ?? "", kind ?? "", digits.join(" ")].join("|");
}
