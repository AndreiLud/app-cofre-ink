// One name for each way to pay, on the lists that offer them.
//
// Part 2, B.1 of the request for 2.0.0: the form that writes a card down gives the plastic the
// name of its account, so the current account "Nubank" and the card "Nubank" were two lines
// that read the same; a credit account with no plastic was missing from "Pago com"; and two
// plastics of one name could not be told apart.

import type { Account, Card } from "@cofre/storage";
import { describe, expect, it } from "vitest";
import { accountOptions, cardOptions, waysToPay } from "./wayLabel.ts";

/** The key with what was put in it, so a test reads the sentence chosen and its values. */
const t = (key: string, values?: Record<string, unknown>) =>
	values ? `${key}${JSON.stringify(values)}` : key;

function account(id: string, kind: Account["kind"], name: string): Account {
	return { id, kind, name, archivedAt: null } as Account;
}

function card(id: string, name: string, extra: Partial<Card> = {}): Card {
	return {
		id,
		name,
		kind: "credit",
		lastFour: null,
		creditAccountId: null,
		debitAccountId: null,
		archivedAt: null,
		...extra,
	} as Card;
}

describe("the ways to pay", () => {
	it("puts the card and the current account of one bank under two headings", () => {
		const accounts = [
			account("checking", "checking", "Nubank"),
			account("credit", "credit", "Nubank"),
		];
		const ways = waysToPay([card("plastic", "Nubank", { creditAccountId: "credit" })], accounts, t);

		expect(ways.map(({ label, group }) => [label, group])).toEqual([
			["Nubank", "ways.cards"],
			["Nubank", "ways.accounts"],
		]);
		expect(ways[0]).toMatchObject({ cardId: "plastic", accountId: "credit" });
	});

	it("offers a credit account no plastic reaches, by its own name and with no card", () => {
		const ways = waysToPay([], [account("credit", "credit", "Cartão antigo")], t);
		expect(ways).toEqual([
			{
				value: ":credit",
				label: "Cartão antigo",
				group: "ways.cards",
				cardId: null,
				accountId: "credit",
			},
		]);
	});

	it("says credit and debit only on a card that does both", () => {
		const accounts = [
			account("checking", "checking", "Conta"),
			account("credit", "credit", "Fatura"),
		];
		const ways = waysToPay(
			[
				card("both", "Banco", {
					kind: "multiple",
					creditAccountId: "credit",
					debitAccountId: "checking",
				}),
			],
			accounts,
			t,
		);
		expect(ways.map((way) => way.label)).toEqual([
			'ways.side{"name":"Banco","side":"cardKind.credit"}',
			'ways.side{"name":"Banco","side":"cardKind.debit"}',
			"Conta",
		]);
	});

	it("adds the last four digits only where two lines would read the same", () => {
		const accounts = [account("credit", "credit", "Fatura")];
		const plastics = [
			card("one", "Nubank", { lastFour: "1234", creditAccountId: "credit" }),
			card("two", "Nubank", { lastFour: "5678", creditAccountId: "credit" }),
			card("three", "Itaú", { lastFour: "9999", creditAccountId: "credit" }),
		];
		expect(waysToPay(plastics, accounts, t).map((way) => way.label)).toEqual([
			'ways.withEnding{"name":"Nubank","ending":"1234"}',
			'ways.withEnding{"name":"Nubank","ending":"5678"}',
			"Itaú",
		]);
		expect(cardOptions(plastics, t).map((option) => option.label)).toEqual([
			'ways.withEnding{"name":"Nubank","ending":"1234"}',
			'ways.withEnding{"name":"Nubank","ending":"5678"}',
			"Itaú",
		]);
	});

	it("lists accounts with cards first, each under its heading", () => {
		const options = accountOptions(
			[account("checking", "checking", "Nubank"), account("credit", "credit", "Nubank")],
			t,
		);
		expect(options).toEqual([
			{ value: "credit", label: "Nubank", group: "ways.cards" },
			{ value: "checking", label: "Nubank", group: "ways.accounts" },
		]);
	});
});
