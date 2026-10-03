// One name for each way to pay, and for each account, on every list that offers them.
//
// The lists wrote only the name, and the form that writes a card down gives the plastic the
// name of its account, so the current account "Nubank" and the card "Nubank" were two lines
// that read the same. A list now puts cards under "Cartões" and accounts under "Contas", says
// credit or debit only on a card that does both, and adds the last four digits only where two
// lines would otherwise read the same. No "Conta" in front of a name: the heading says it.

import type { Account, Card } from "@cofre/storage";
import type { SelectOption } from "@cofre/ui";
import type { Translate } from "./sayWhy.ts";

/** One way to pay: the plastic, when there is one, and the account it reaches. */
export type Way = SelectOption & {
	cardId: string | null;
	accountId: string;
};

/** Which heading an account goes under: a credit account is a card, everything else an account. */
function groupOf(account: Account, t: Translate): string {
	return account.kind === "credit" ? t("ways.cards") : t("ways.accounts");
}

/**
 * The last four digits on the lines that would otherwise read the same, and nothing on the
 * others. Two plastics called "Nubank" are told apart by what is printed on them.
 */
function distinguished<T extends { label: string; lastFour: string | null }>(
	lines: readonly T[],
	t: Translate,
): T[] {
	const count = new Map<string, number>();
	for (const line of lines) count.set(line.label, (count.get(line.label) ?? 0) + 1);
	return lines.map((line) =>
		(count.get(line.label) ?? 0) > 1 && line.lastFour
			? { ...line, label: t("ways.withEnding", { name: line.label, ending: line.lastFour }) }
			: line,
	);
}

/**
 * Every way to pay a spend, as the till sees it: each plastic, twice for one that does credit
 * and debit, a credit account no plastic reaches by its own name, and every account that holds
 * money on its own, because a Pix leaves it with no card involved.
 *
 * A credit account and a benefit card are reached through their plastic; a credit account
 * with none, after its card was removed or written by the server, is still a card somebody
 * pays with, and it was missing from the list altogether.
 */
export function waysToPay(
	cards: readonly Card[],
	accounts: readonly Account[],
	t: Translate,
	/**
	 * The way of the record being corrected, which is offered whatever has happened to it
	 * since: a card put away, an account archived, a benefit card written with no plastic. Left
	 * out, the list opened on whichever way came first, and saving took the card off.
	 */
	keep?: { cardId: string | null; accountId: string },
): Way[] {
	const ways = everyWay(cards, accounts, t);
	if (!keep) return ways;
	const value = `${keep.cardId ?? ""}:${keep.accountId}`;
	if (ways.some((way) => way.value === value)) return ways;

	const account = accounts.find((one) => one.id === keep.accountId);
	if (!account) return ways;
	const plastic = keep.cardId === null ? null : cards.find((one) => one.id === keep.cardId);
	const name = plastic ? plastic.name : account.name;
	const putAway = plastic ? plastic.archivedAt !== null : account.archivedAt !== null;
	return [
		...ways,
		{
			value,
			label: putAway ? t("ways.archived", { name }) : name,
			group: plastic ? t("ways.cards") : groupOf(account, t),
			cardId: plastic ? plastic.id : null,
			accountId: account.id,
		},
	];
}

function everyWay(cards: readonly Card[], accounts: readonly Account[], t: Translate): Way[] {
	const usable = accounts.filter((account) => account.archivedAt === null);
	const reachable = new Set(usable.map((account) => account.id));

	const byPlastic = cards
		.filter((card) => card.archivedAt === null)
		.flatMap((card) => {
			const both = card.creditAccountId !== null && card.debitAccountId !== null;
			const sides = [
				{ side: "credit" as const, accountId: card.creditAccountId },
				{ side: "debit" as const, accountId: card.debitAccountId },
			];
			return sides
				.filter((one): one is { side: "credit" | "debit"; accountId: string } =>
					Boolean(one.accountId && reachable.has(one.accountId)),
				)
				.map((one) => ({
					value: `${card.id}:${one.accountId}`,
					label: both
						? t("ways.side", { name: card.name, side: t(`cardKind.${one.side}`) })
						: card.name,
					group: t("ways.cards"),
					cardId: card.id,
					accountId: one.accountId,
					lastFour: card.lastFour,
				}));
		});

	const reachedByPlastic = new Set(byPlastic.map((way) => way.accountId));
	const bareCards = usable
		.filter((account) => account.kind === "credit" && !reachedByPlastic.has(account.id))
		.map((account) => ({
			value: `:${account.id}`,
			label: account.name,
			group: t("ways.cards"),
			cardId: null,
			accountId: account.id,
			lastFour: null,
		}));

	// Never an investment account: money reaches one only through a holding, on Investments.
	const money = usable
		.filter(
			(account) =>
				account.kind !== "credit" && account.kind !== "voucher" && account.kind !== "investment",
		)
		.map((account) => ({
			value: `:${account.id}`,
			label: account.name,
			group: t("ways.accounts"),
			cardId: null,
			accountId: account.id,
			lastFour: null,
		}));

	return distinguished([...byPlastic, ...bareCards], t)
		.concat(money)
		.map(({ lastFour: _ending, ...way }) => way);
}

/**
 * Accounts as options of a list, cards first under their heading and accounts under theirs,
 * in the order they were given within each. For every list of accounts that is not a way to
 * pay: where money lands, where a move starts, which account a filter or a file is about.
 */
export function accountOptions(accounts: readonly Account[], t: Translate): SelectOption[] {
	const cards = accounts.filter((account) => account.kind === "credit");
	const others = accounts.filter((account) => account.kind !== "credit");
	return [...cards, ...others].map((account) => ({
		value: account.id,
		label: account.name,
		group: groupOf(account, t),
	}));
}

/** The plastics as options of a list, with the last four digits where two share a name. */
export function cardOptions(cards: readonly Card[], t: Translate): SelectOption[] {
	return distinguished(
		cards.map((card) => ({ value: card.id, label: card.name, lastFour: card.lastFour })),
		t,
	).map(({ value, label }) => ({ value, label }));
}

/**
 * The name a record's way to pay is shown by in a list: the plastic when the record says which
 * one, beside the account, because "Nubank" the card and "Nubank" the current account are two
 * different places for money to leave.
 */
export function paidWithLabel(
	accountName: string,
	card: Pick<Card, "name"> | null | undefined,
): string {
	if (!card || card.name === accountName) return accountName;
	return `${card.name}, ${accountName}`;
}
