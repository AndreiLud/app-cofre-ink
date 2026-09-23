// Categories, on every adapter.
//
// The rules worth checking are the ones that keep the list usable a year from now: two
// levels and no more, a name that means something, and a category that can be taken
// away without taking the history with it.

import { describe, expect, it } from "vitest";
import { NotFoundError, RuleError } from "../errors.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

export function runCategoryConformance(adapter: AdapterUnderTest): void {
	describe("categories", () => {
		it("writes the starting set once, and refuses to write it twice", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const written = await fixture.asAna.categories.installDefaults({ spaceId: space.id });

				expect(written.length).toBeGreaterThan(20);
				expect(written.some((category) => category.name === "Mercado")).toBe(true);
				expect(written.some((category) => category.kind === "income")).toBe(true);
				// Everything under something else points at a category that stands alone.
				const parents = new Set(
					written.filter((category) => category.parentId === null).map((category) => category.id),
				);
				expect(
					written
						.filter((category) => category.parentId !== null)
						.every((category) => parents.has(category.parentId ?? "")),
				).toBe(true);

				await expect(
					fixture.asAna.categories.installDefaults({ spaceId: space.id }),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await fixture.close();
			}
		});

		it("writes the starting set in the language that was asked for", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Personal", kind: "personal" });
				const written = await fixture.asAna.categories.installDefaults({
					spaceId: space.id,
					language: "en",
				});
				expect(written.some((category) => category.name === "Groceries")).toBe(true);
				expect(written.some((category) => category.name === "Mercado")).toBe(false);
			} finally {
				await fixture.close();
			}
		});

		it("goes one level deep and stops there", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const food = await fixture.asAna.categories.create({
					spaceId: space.id,
					name: "Alimentacao",
					kind: "expense",
					priority: "essential",
				});
				const market = await fixture.asAna.categories.create({
					spaceId: space.id,
					name: "Mercado",
					kind: "expense",
					parentId: food.id,
				});

				await expect(
					fixture.asAna.categories.create({
						spaceId: space.id,
						name: "Hortifruti",
						kind: "expense",
						parentId: market.id,
					}),
				).rejects.toBeInstanceOf(RuleError);

				// And a category with children cannot become a child itself.
				const other = await fixture.asAna.categories.create({
					spaceId: space.id,
					name: "Casa",
					kind: "expense",
				});
				await expect(
					fixture.asAna.categories.update(food.id, { parentId: other.id }),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await fixture.close();
			}
		});

		it("refuses a category with no name and one that hangs under itself", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				await expect(
					fixture.asAna.categories.create({ spaceId: space.id, name: "  ", kind: "expense" }),
				).rejects.toBeInstanceOf(RuleError);

				const one = await fixture.asAna.categories.create({
					spaceId: space.id,
					name: "Lazer",
					kind: "expense",
				});
				await expect(
					fixture.asAna.categories.update(one.id, { parentId: one.id }),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await fixture.close();
			}
		});

		it("keeps the record when the category goes away", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});
				const category = await fixture.asAna.categories.create({
					spaceId: space.id,
					name: "Delivery",
					kind: "expense",
					priority: "superfluous",
				});
				const [record] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 4290,
					happenedOn: "2026-09-10",
					description: "Ifood",
					accountId: account.id,
					categoryId: category.id,
				});
				expect(record?.categoryId).toBe(category.id);

				await fixture.asAna.categories.remove(category.id);

				const after = await fixture.asAna.transactions.get(record?.id ?? "");
				expect(after.categoryId).toBe(null);
				expect(after.amount).toBe(-4290);
			} finally {
				await fixture.close();
			}
		});

		it("refuses to remove a category that still has categories under it", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const parent = await fixture.asAna.categories.create({
					spaceId: space.id,
					name: "Transporte",
					kind: "expense",
				});
				await fixture.asAna.categories.create({
					spaceId: space.id,
					name: "Onibus",
					kind: "expense",
					parentId: parent.id,
				});

				await expect(fixture.asAna.categories.remove(parent.id)).rejects.toBeInstanceOf(RuleError);
			} finally {
				await fixture.close();
			}
		});

		it("hides an archived category until it is asked for", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const category = await fixture.asAna.categories.create({
					spaceId: space.id,
					name: "Cigarro",
					kind: "expense",
				});
				await fixture.asAna.categories.archive(category.id);

				expect(await fixture.asAna.categories.list(space.id)).toEqual([]);
				expect(
					(await fixture.asAna.categories.list(space.id, { includeArchived: true })).length,
				).toBe(1);
			} finally {
				await fixture.close();
			}
		});

		it("never ties a record to a category from another space", async () => {
			const fixture = await prepare(adapter);
			try {
				const mine = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const house = await fixture.asAna.spaces.create({ name: "Casa" });
				const account = await fixture.asAna.accounts.create({
					spaceId: house.id,
					kind: "checking",
					name: "Conta da casa",
				});
				const mineOnly = await fixture.asAna.categories.create({
					spaceId: mine.id,
					name: "Terapia",
					kind: "expense",
				});

				await expect(
					fixture.asAna.transactions.create({
						spaceId: house.id,
						kind: "expense",
						amount: 1000,
						happenedOn: "2026-09-10",
						description: "Consulta",
						accountId: account.id,
						categoryId: mineOnly.id,
					}),
				).rejects.toBeInstanceOf(NotFoundError);
			} finally {
				await fixture.close();
			}
		});

		it("lets one record disagree with the priority of its category", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});
				const pharmacy = await fixture.asAna.categories.create({
					spaceId: space.id,
					name: "Farmacia",
					kind: "expense",
					priority: "essential",
				});

				const [usual] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 5000,
					happenedOn: "2026-09-10",
					description: "Remedio",
					accountId: account.id,
					categoryId: pharmacy.id,
				});
				const [treat] = await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 9000,
					happenedOn: "2026-09-11",
					description: "Perfume",
					accountId: account.id,
					categoryId: pharmacy.id,
					priority: "superfluous",
				});

				expect(usual?.priority).toBe(null);
				expect(treat?.priority).toBe("superfluous");
			} finally {
				await fixture.close();
			}
		});

		it("finds records by category, and the ones with no category at all", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const account = await fixture.asAna.accounts.create({
					spaceId: space.id,
					kind: "checking",
					name: "Conta",
				});
				const market = await fixture.asAna.categories.create({
					spaceId: space.id,
					name: "Mercado",
					kind: "expense",
				});

				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 10_000,
					happenedOn: "2026-09-10",
					description: "Feira",
					accountId: account.id,
					categoryId: market.id,
				});
				await fixture.asAna.transactions.create({
					spaceId: space.id,
					kind: "expense",
					amount: 2000,
					happenedOn: "2026-09-11",
					description: "Sem categoria",
					accountId: account.id,
				});

				const sorted = await fixture.asAna.transactions.list({
					spaceId: space.id,
					categoryIds: [market.id],
				});
				expect(sorted.map((row) => row.description)).toEqual(["Feira"]);

				const loose = await fixture.asAna.transactions.list({
					spaceId: space.id,
					withoutCategory: true,
				});
				expect(loose.map((row) => row.description)).toEqual(["Sem categoria"]);
			} finally {
				await fixture.close();
			}
		});
	});
}
