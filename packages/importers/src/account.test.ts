import { describe, expect, it } from "vitest";
import { guessAccount, type KnownAccount, shapeOf } from "./account.ts";

const accounts: KnownAccount[] = [
	{ id: "corrente", name: "Conta corrente 12345-6", kind: "checking", institution: "Banco Inter" },
	{ id: "cartao", name: "Cartão roxinho", kind: "credit", institution: "Nubank" },
	{ id: "carteira", name: "Carteira", kind: "cash", institution: null },
];

describe("which account a file belongs to", () => {
	it("follows the digits when the file names them", () => {
		expect(guessAccount({ accountHint: "Agencia 0001 conta 123456" }, accounts)).toEqual({
			id: "corrente",
			why: "digits",
		});
	});

	it("follows the name of the bank", () => {
		expect(guessAccount({ institution: "Nubank" }, accounts)).toEqual({
			id: "cartao",
			why: "institution",
		});
	});

	it("takes the card when the document is an invoice and there is one card", () => {
		expect(guessAccount({ kind: "invoice" }, accounts)).toEqual({ id: "cartao", why: "onlyCard" });
	});

	it("tells two accounts of the same bank apart by what the document is", () => {
		const both: KnownAccount[] = [
			{ id: "conta", name: "Conta", kind: "checking", institution: "Inter" },
			{ id: "cartao", name: "Cartão", kind: "credit", institution: "Inter" },
		];

		expect(guessAccount({ institution: "Inter", kind: "invoice" }, both)?.id).toBe("cartao");
		expect(guessAccount({ institution: "Inter", kind: "statement" }, both)?.id).toBe("conta");
	});

	it("says nothing when the file says nothing", () => {
		expect(guessAccount({}, accounts)).toBe(null);
		expect(guessAccount({ institution: "Banco que nao existe" }, accounts)).toBe(null);
		expect(guessAccount({ kind: "invoice" }, [])).toBe(null);
	});

	it("says nothing rather than choose between two that fit", () => {
		const twoCards: KnownAccount[] = [
			{ id: "um", name: "Cartão um", kind: "credit", institution: null },
			{ id: "dois", name: "Cartão dois", kind: "credit", institution: null },
		];
		expect(guessAccount({ kind: "invoice" }, twoCards)).toBe(null);
	});
});

describe("the shape of a file", () => {
	it("is the same for two exports of the same bank", () => {
		expect(shapeOf(["Data", "Histórico", "Valor"])).toBe(shapeOf(["data", "historico", " valor "]));
	});

	it("is different for another bank", () => {
		expect(shapeOf(["Data", "Histórico", "Valor"])).not.toBe(
			shapeOf(["Date", "Description", "Amount"]),
		);
	});

	it("is nothing for a file with no header", () => {
		expect(shapeOf([])).toBe("");
	});
});
