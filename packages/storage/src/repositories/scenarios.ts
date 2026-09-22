// Questions about the future, kept so they can be asked again.
//
// A scenario is a name and a list of adjustments, and the adjustments are whatever the
// screen puts in them, exactly as a saved filter is. The shape of a question belongs to
// the screen that asks it, and a new kind of adjustment should not cost a migration.

import { scenarios } from "@cofre/db";
import { assertCan } from "../actor.ts";
import type { SqlValue } from "../driver.ts";
import { NotFoundError, RuleError } from "../errors.ts";
import { type Scenario, toScenario } from "../models.ts";
import { insertRow, softDeleteRow, updateRow } from "../writer.ts";
import type { RepositoryContext } from "./context.ts";

const SELECT = `SELECT "id", "space_id", "name", "adjustments", "position", "created_by",
	"created_at", "updated_at"
	FROM "scenarios"`;

export type CreateScenarioInput = {
	spaceId: string;
	name: string;
	adjustments: Record<string, unknown>[];
	position?: number;
};

export type UpdateScenarioInput = {
	name?: string;
	adjustments?: Record<string, unknown>[];
	position?: number;
};

export function createScenariosRepository(context: RepositoryContext) {
	async function reachable(id: string): Promise<Scenario> {
		const rows = await context.driver.all(`${SELECT} WHERE "id" = ? AND "deleted_at" IS NULL`, [
			id,
		]);
		const first = rows[0];
		if (!first) throw new NotFoundError("scenario", id);
		return toScenario(first);
	}

	return {
		async list(spaceId: string): Promise<Scenario[]> {
			assertCan(context.actor(), spaceId, "plan.read");
			const rows = await context.driver.all(
				`${SELECT} WHERE "space_id" = ? AND "deleted_at" IS NULL ORDER BY "position", "created_at"`,
				[spaceId],
			);
			return rows.map(toScenario);
		},

		async create(input: CreateScenarioInput): Promise<Scenario> {
			assertCan(context.actor(), input.spaceId, "plan.write");
			if (input.name.trim() === "") {
				throw new RuleError("nameIsRequired", "a scenario needs a name to be found again");
			}
			if (input.adjustments.length > 20) {
				throw new RuleError(
					"tooManyAdjustments",
					"a scenario with more than twenty changes in it is not a question anybody can read",
				);
			}

			const id = await insertRow(context.write(), {
				table: scenarios,
				spaceId: input.spaceId,
				values: {
					name: input.name.trim(),
					adjustments: JSON.stringify(input.adjustments),
					position: input.position ?? 0,
					created_by: context.actor().userId,
				},
			});
			return reachable(id);
		},

		async update(id: string, input: UpdateScenarioInput): Promise<Scenario> {
			const scenario = await reachable(id);
			assertCan(context.actor(), scenario.spaceId, "plan.write");

			const values: Record<string, SqlValue> = {};
			if (input.name !== undefined) values.name = input.name.trim();
			if (input.adjustments !== undefined) values.adjustments = JSON.stringify(input.adjustments);
			if (input.position !== undefined) values.position = input.position;

			await updateRow(context.write(), {
				table: scenarios,
				spaceId: scenario.spaceId,
				id,
				values,
			});
			return reachable(id);
		},

		async remove(id: string): Promise<void> {
			const scenario = await reachable(id);
			assertCan(context.actor(), scenario.spaceId, "plan.write");
			await softDeleteRow(context.write(), {
				table: scenarios,
				spaceId: scenario.spaceId,
				id,
			});
		},
	};
}

export type ScenariosRepository = ReturnType<typeof createScenariosRepository>;
