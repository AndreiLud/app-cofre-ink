import { describe, expect, it } from "vitest";
import { canSpendThisMonth } from "./canSpend.ts";
import {
	type CountedAccount,
	type CountedBalance,
	countsAsMoney,
	isBenefit,
	isDebt,
	isSpendable,
	leftOnBenefits,
	moneyOnHand,
	owedOnCards,
	spendableNow,
} from "./whatCounts.ts";

const ACCOUNTS: CountedAccount[] = [
	{ id: "corrente", kind: "checking" },
	{ id: "poupanca", kind: "savings" },
	{ id: "carteira", kind: "cash" },
	{ id: "cartao", kind: "credit" },
	{ id: "vale", kind: "voucher" },
	{ id: "corretora", kind: "investment" },
];

const BALANCES: CountedBalance[] = [
	{ accountId: "corrente", settled: 481_230 },
	{ accountId: "poupanca", settled: 200_000 },
	{ accountId: "carteira", settled: 12_000 },
	{ accountId: "cartao", settled: -128_450 },
	{ accountId: "vale", settled: 64_500 },
	{ accountId: "corretora", settled: 500_000 },
];

const ALL = { accounts: ACCOUNTS, balances: BALANCES };

describe("which kind is what", () => {
	it("counts the four kinds that are money", () => {
		expect(countsAsMoney("checking")).toBe(true);
		expect(countsAsMoney("savings")).toBe(true);
		expect(countsAsMoney("cash")).toBe(true);
		expect(countsAsMoney("investment")).toBe(true);
		expect(countsAsMoney("credit")).toBe(false);
		expect(countsAsMoney("voucher")).toBe(false);
	});

	it("leaves an investment out of what can be spent this afternoon", () => {
		expect(isSpendable("investment")).toBe(false);
		expect(countsAsMoney("investment")).toBe(true);
	});

	it("keeps a card and a benefit out of every total of money", () => {
		expect(isDebt("credit")).toBe(true);
		expect(isBenefit("voucher")).toBe(true);
		expect(countsAsMoney("credit")).toBe(false);
		expect(isSpendable("voucher")).toBe(false);
	});
});

describe("what somebody has", () => {
	it("adds the four kinds and nothing else", () => {
		expect(moneyOnHand(ALL)).toBe(481_230 + 200_000 + 12_000 + 500_000);
	});

	it("does not let a card invoice make the number smaller", () => {
		const withoutCard = {
			accounts: ACCOUNTS.filter((account) => account.kind !== "credit"),
			balances: BALANCES,
		};
		expect(moneyOnHand(ALL)).toBe(moneyOnHand(withoutCard));
	});

	it("does not count a meal voucher as money", () => {
		const richerVoucher = {
			accounts: ACCOUNTS,
			balances: BALANCES.map((balance) =>
				balance.accountId === "vale" ? { ...balance, settled: 900_000 } : balance,
			),
		};
		expect(moneyOnHand(richerVoucher)).toBe(moneyOnHand(ALL));
	});

	it("takes the worth of an investment over its balance when the portfolio has one", () => {
		expect(moneyOnHand({ ...ALL, worth: { corretora: 843_000 } })).toBe(
			481_230 + 200_000 + 12_000 + 843_000,
		);
	});

	it("falls back to the balance for an investment account with nothing priced in it", () => {
		expect(moneyOnHand({ ...ALL, worth: {} })).toBe(moneyOnHand(ALL));
	});

	it("counts an account with no balance row as nothing rather than dropping it", () => {
		const extra = {
			accounts: [...ACCOUNTS, { id: "nova", kind: "checking" as const }],
			balances: BALANCES,
		};
		expect(moneyOnHand(extra)).toBe(moneyOnHand(ALL));
	});

	it("ignores a balance whose account is not in the list", () => {
		const stray = {
			accounts: ACCOUNTS,
			balances: [...BALANCES, { accountId: "apagada", settled: 999_999 }],
		};
		expect(moneyOnHand(stray)).toBe(moneyOnHand(ALL));
	});
});

describe("the other three questions", () => {
	it("leaves the investment out of what can be spent now", () => {
		expect(spendableNow(ALL)).toBe(481_230 + 200_000 + 12_000);
	});

	it("says what is owed as a positive number", () => {
		expect(owedOnCards(ALL)).toBe(128_450);
	});

	it("says what is left on the benefit accounts", () => {
		expect(leftOnBenefits(ALL)).toBe(64_500);
	});
});

describe("how much is left to spend this month", () => {
	it("subtracts what falls due and what is still to be put aside", () => {
		const answer = canSpendThisMonth({
			spendable: 493_230,
			comingIn: 0,
			fallingDue: 197_990,
			stillToSave: 80_000,
		});
		expect(answer.amount).toBe(215_240);
	});

	it("counts money that still arrives before the month ends", () => {
		const answer = canSpendThisMonth({
			spendable: 100_000,
			comingIn: 620_000,
			fallingDue: 200_000,
			stillToSave: 0,
		});
		expect(answer.amount).toBe(520_000);
	});

	it("returns a negative answer rather than nothing, because that is the useful one", () => {
		const answer = canSpendThisMonth({
			spendable: 10_000,
			comingIn: 0,
			fallingDue: 90_000,
			stillToSave: 0,
		});
		expect(answer.amount).toBe(-80_000);
	});

	it("hands back the four parts, so a screen can show the subtraction", () => {
		const parts = { spendable: 1, comingIn: 2, fallingDue: 3, stillToSave: 4 };
		expect(canSpendThisMonth(parts).parts).toEqual(parts);
	});
});
