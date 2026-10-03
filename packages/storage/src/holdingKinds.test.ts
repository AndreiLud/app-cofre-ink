// Every product of the catalog falls into one of the seven kinds the table keeps (part 2, H.1.2
// of the request for 2.0.0). The kinds stay in the table, which depends on nothing, and widening
// its check in SQLite rebuilds the table, so a product that needs an eighth is refused here.

import { PRODUCTS } from "@cofre/core";
import { HOLDING_KINDS } from "@cofre/db";
import { describe, expect, it } from "vitest";

describe("the kinds of holding", () => {
	it("hold every product of the catalog", () => {
		for (const product of PRODUCTS) {
			expect(HOLDING_KINDS, product.id).toContain(product.kind);
		}
	});
});
