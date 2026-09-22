// Saved filters, on every adapter.
//
// The point being made here is the one that is easy to get wrong: a saved filter lives
// in a space that other people read, and it still belongs to one person only.

import { describe, expect, it } from "vitest";
import { NotFoundError, RuleError } from "../errors.ts";
import { type AdapterUnderTest, prepare } from "./setup.ts";

export function runSavedFilterConformance(adapter: AdapterUnderTest): void {
	describe("saved filters", () => {
		it("gives back what was saved, in the order it was put in", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				await fixture.asAna.savedFilters.create({
					spaceId: space.id,
					name: "Cartao deste mes",
					query: { month: "2026-09", accountId: "abc" },
					position: 2,
				});
				await fixture.asAna.savedFilters.create({
					spaceId: space.id,
					name: "A pagar",
					query: { status: "planned" },
					position: 1,
				});

				const saved = await fixture.asAna.savedFilters.list(space.id);
				expect(saved.map((filter) => filter.name)).toEqual(["A pagar", "Cartao deste mes"]);
				expect(saved[1]?.query).toEqual({ month: "2026-09", accountId: "abc" });
			} finally {
				await fixture.close();
			}
		});

		it("keeps one person's filters out of another person's screen", async () => {
			const fixture = await prepare(adapter);
			try {
				const house = await fixture.asAna.spaces.create({ name: "Casa" });
				await fixture.asAna.members.invite({
					spaceId: house.id,
					userId: fixture.joao.id,
					role: "editor",
				});
				await fixture.asJoao.members.accept(house.id);

				const filter = await fixture.asAna.savedFilters.create({
					spaceId: house.id,
					name: "Meus cafes",
					query: { search: "cafe" },
				});

				expect(await fixture.asJoao.savedFilters.list(house.id)).toEqual([]);
				await expect(
					fixture.asJoao.savedFilters.update(filter.id, { name: "Outro nome" }),
				).rejects.toBeInstanceOf(NotFoundError);
				await expect(fixture.asJoao.savedFilters.remove(filter.id)).rejects.toBeInstanceOf(
					NotFoundError,
				);
			} finally {
				await fixture.close();
			}
		});

		it("lets somebody who only reads the money keep their own questions", async () => {
			const fixture = await prepare(adapter);
			try {
				const house = await fixture.asAna.spaces.create({ name: "Casa" });
				await fixture.asAna.members.invite({
					spaceId: house.id,
					userId: fixture.joao.id,
					role: "viewer",
				});
				await fixture.asJoao.members.accept(house.id);

				const filter = await fixture.asJoao.savedFilters.create({
					spaceId: house.id,
					name: "Contas da casa",
					query: { kind: "expense" },
				});
				expect((await fixture.asJoao.savedFilters.list(house.id))[0]?.id).toBe(filter.id);
			} finally {
				await fixture.close();
			}
		});

		it("refuses a filter with no name, because a list of blanks helps nobody", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				await expect(
					fixture.asAna.savedFilters.create({ spaceId: space.id, name: "   ", query: {} }),
				).rejects.toBeInstanceOf(RuleError);
			} finally {
				await fixture.close();
			}
		});

		it("renames and forgets", async () => {
			const fixture = await prepare(adapter);
			try {
				const space = await fixture.asAna.spaces.create({ name: "Pessoal", kind: "personal" });
				const filter = await fixture.asAna.savedFilters.create({
					spaceId: space.id,
					name: "Sem nome ainda",
					query: {},
				});

				const renamed = await fixture.asAna.savedFilters.update(filter.id, {
					name: "Mercado",
					query: { search: "mercado" },
				});
				expect(renamed.name).toBe("Mercado");
				expect(renamed.query).toEqual({ search: "mercado" });

				await fixture.asAna.savedFilters.remove(filter.id);
				expect(await fixture.asAna.savedFilters.list(space.id)).toEqual([]);
			} finally {
				await fixture.close();
			}
		});
	});
}
