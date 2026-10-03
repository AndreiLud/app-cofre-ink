import { describe, expect, it } from "vitest";
import { genericProductOf, PRODUCTS, productOf, productOfHolding } from "./products.ts";

describe("the catalog of products", () => {
	it("names each product once, and asks only for fields it shows", () => {
		expect(new Set(PRODUCTS.map((product) => product.id)).size).toBe(PRODUCTS.length);
		for (const product of PRODUCTS) {
			for (const field of product.required) expect(product.fields).toContain(field);
		}
	});

	it("estimates by an index what follows the CDI, a fixed rate, the Selic or the savings rate", () => {
		expect(productOf("box")?.valuation("cdi")).toBe("index");
		expect(productOf("cdb")?.valuation("cdi")).toBe("index");
		expect(productOf("lca")?.valuation("prefixed")).toBe("index");
		expect(productOf("treasurySelic")?.valuation("selic")).toBe("index");
		expect(productOf("savingsAccount")?.valuation("savings")).toBe("index");
		// Typed from the statement: what follows the IPCA, and the treasury bonds priced by hand.
		expect(productOf("cdb")?.valuation("ipca")).toBe("typed");
		expect(productOf("treasuryIpca")?.valuation(null)).toBe("price");
		expect(productOf("stock")?.valuation(null)).toBe("price");
	});

	it("taxes what the law taxes, and says the exempt ones are exempt", () => {
		expect(productOf("cdb")?.tax).toBe("regressive");
		expect(productOf("box")?.tax).toBe("regressive");
		expect(productOf("treasurySelic")?.tax).toBe("regressive");
		expect(productOf("lci")?.tax).toBe("exempt");
		expect(productOf("lca")?.tax).toBe("exempt");
		expect(productOf("savingsAccount")?.tax).toBe("exempt");
		expect(productOf("stock")?.tax).toBe("notComputed");
	});

	it("counts shares whole, treasury bonds to two places and crypto to eight", () => {
		expect(productOf("stock")?.quantityPlaces).toBe(0);
		expect(productOf("treasurySelic")?.quantityPlaces).toBe(2);
		expect(productOf("crypto")?.quantityPlaces).toBe(8);
	});

	it("reads a holding from before 2.0.0 as the generic product of its kind, priced as it was", () => {
		const old = productOfHolding({ product: null, kind: "realEstate" });
		expect(old.kind).toBe("realEstate");
		expect(old.valuation(null)).toBe("price");
		expect(genericProductOf("fixedIncome").valuation("cdi")).toBe("price");
		expect(productOfHolding({ product: "lci", kind: "fixedIncome" }).id).toBe("lci");
	});

	it("leaves a house out of the menu", () => {
		expect(PRODUCTS.some((product) => product.kind === "realEstate")).toBe(false);
	});
});
