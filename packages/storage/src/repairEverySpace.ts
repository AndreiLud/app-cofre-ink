// The repairs, on a server, where nobody opens anything.
//
// In the browser the person who opens the application is the owner of what is in it, and
// the repairs run as them. A server has many people and none of them is sitting in front of
// it, so it runs the repairs of each space as the owner of that space, from a device that
// says it is the server, and the entries in the change log say exactly that.

import type { Driver } from "./driver.ts";
import type { RepairOutcome } from "./repositories/repairs.ts";
import { openSession } from "./session.ts";

export async function repairEverySpace(driver: Driver): Promise<RepairOutcome[]> {
	const owners = await driver.all(
		`SELECT m."space_id", m."user_id" FROM "space_members" m
		 JOIN "spaces" s ON s."id" = m."space_id"
		 WHERE m."role" = 'owner' AND m."state" = 'active' AND m."deleted_at" IS NULL
		   AND s."deleted_at" IS NULL
		 ORDER BY m."space_id"`,
	);

	const done: RepairOutcome[] = [];
	const seen = new Set<string>();
	for (const row of owners) {
		const spaceId = String(row.space_id);
		if (seen.has(spaceId)) continue;
		seen.add(spaceId);
		try {
			const session = await openSession({
				driver,
				userId: String(row.user_id),
				deviceId: "server",
			});
			done.push(await session.repairs.run(spaceId));
		} catch {
			// One space with a problem is not a reason to leave the others unrepaired, and
			// this runs with nobody watching. The next start tries again.
		}
	}
	return done;
}
