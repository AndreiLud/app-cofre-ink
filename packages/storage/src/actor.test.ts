// The matrix, asked the two ways it is asked.
//
// A repository asks it with an actor, because it knows who is calling and in which space.
// A screen asks it with a role, because it has read the member list of the space it is
// drawing. The two have to give the same answer for every role and every permission, or a
// button and the refusal behind it disagree, which is the whole reason the interface stops
// writing its own lists of roles.

import { ROLES } from "@cofre/db";
import { describe, expect, it } from "vitest";
import {
	ALL_PERMISSIONS,
	can,
	createActor,
	PERMISSIONS,
	type Permission,
	type Role,
	roleCan,
} from "./actor.ts";

const SPACE = "space_1";

function memberOf(role: Role) {
	return createActor("person_1", "device_1", [{ spaceId: SPACE, role, state: "active" }]);
}

describe("what a role may do", () => {
	it("answers the same as an actor would, for every role and every permission", () => {
		for (const role of ROLES) {
			const actor = memberOf(role);
			for (const permission of ALL_PERMISSIONS) {
				expect(roleCan(role, permission)).toBe(can(actor, SPACE, permission));
			}
		}
	});

	it("says no to nothing, which is a member list that has not arrived", () => {
		for (const permission of ALL_PERMISSIONS) {
			expect(roleCan(null, permission)).toBe(false);
			expect(roleCan(undefined, permission)).toBe(false);
		}
	});

	it("reads the matrix and not a list of its own", () => {
		for (const permission of ALL_PERMISSIONS) {
			const allowed = ROLES.filter((role) => roleCan(role, permission));
			expect([...allowed].sort()).toEqual([...(PERMISSIONS[permission] as readonly Role[])].sort());
		}
	});

	it("keeps the two roles that write records apart from the two that do not", () => {
		// The four sentences the interface used to write by hand, now read from the matrix.
		expect(roleCan("logger", "transaction.create")).toBe(true);
		expect(roleCan("logger", "transaction.reconcile")).toBe(false);
		expect(roleCan("viewer", "transaction.create")).toBe(false);
		expect(roleCan("viewer", "filter.write")).toBe(true);
	});

	it("knows a permission that does not exist is not a permission", () => {
		expect(roleCan("owner", "nothing.atAll" as Permission)).toBe(false);
	});
});
