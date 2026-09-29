// Shared scaffolding for the conformance suite.

import type { CalendarDate } from "@cofre/core";
import type { Driver } from "../driver.ts";
import { migrate } from "../migrate.ts";
import type { User } from "../models.ts";
import { createUser } from "../repositories/users.ts";
import { openSession, type Session } from "../session.ts";

/**
 * A day after everything the fixtures write.
 *
 * A balance takes the day it is read on, because a record counts once it is a fact and
 * its day has come. Most of these tests are about the first half of that and not the
 * second, so they read from far enough ahead that the day never decides anything, and
 * the tests that are about the day pass one of their own.
 */
export const LATER = "2026-12-31" as CalendarDate;

export type AdapterUnderTest = {
	name: string;
	/** Opens a database that has nothing in it. */
	open: () => Promise<Driver>;
	/**
	 * Opens a second database that has nothing in it either, and that the first one
	 * keeps living beside. Replication needs two, and an engine that runs as one shared
	 * instance has to say how it gives out a second one.
	 */
	openAnother?: (name: string) => Promise<Driver>;
};

export type Fixture = {
	driver: Driver;
	ana: User;
	joao: User;
	carla: User;
	asAna: Session;
	asJoao: Session;
	asCarla: Session;
	close: () => Promise<void>;
};

/** A database with the schema in place and three people who do not share anything yet. */
export async function prepare(adapter: AdapterUnderTest): Promise<Fixture> {
	const driver = await adapter.open();
	await migrate(driver);

	const ana = await createUser(driver, { email: "ana@exemplo.com", name: "Ana" });
	const joao = await createUser(driver, { email: "joao@exemplo.com", name: "Joao" });
	const carla = await createUser(driver, { email: "carla@exemplo.com", name: "Carla" });

	return {
		driver,
		ana,
		joao,
		carla,
		asAna: await openSession({ driver, userId: ana.id, deviceId: "deviceAna" }),
		asJoao: await openSession({ driver, userId: joao.id, deviceId: "deviceJoao" }),
		asCarla: await openSession({ driver, userId: carla.id, deviceId: "deviceCarla" }),
		close: () => driver.close(),
	};
}
