// What every repository is handed: the database, who is asking, the clock that stamps
// the writes, and a way to reload the membership list after it changes.

import type { HybridClock } from "@cofre/core";
import type { Actor, Permission } from "../actor.ts";
import type { Driver } from "../driver.ts";
import type { WriteContext } from "../writer.ts";

export type RepositoryContext = {
	driver: Driver;
	/** Read through a function, because membership changes while the session is open. */
	actor: () => Actor;
	clock: HybridClock;
	now: () => number;
	write: () => WriteContext;
	refreshActor: () => Promise<void>;
	/** Asks without throwing, for the places that filter instead of refusing. */
	can: (spaceId: string, permission: Permission) => boolean;
};
