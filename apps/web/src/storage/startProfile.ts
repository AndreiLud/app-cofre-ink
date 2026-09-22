// Everything that has to exist before somebody can write down what they spent: a
// person, a personal space, and the categories that space starts with.
//
// It lives on its own because two screens do it now. The onboarding form asks first
// and then calls this. The front door asks nothing and calls this with the defaults,
// which is the whole difference between them.

import { createUser, type Driver, openSession, type User } from "@cofre/storage";
import { seedDemo } from "../demo/seed.ts";
import { deviceId } from "./localProfile.ts";

export type NewProfile = {
	name: string;
	/** Optional: what links this profile to a server of theirs, if they ever want one. */
	email?: string;
	currency?: string;
	spaceName: string;
	language: "pt" | "en";
	/** Accounts and records that are not theirs, to see the thing working. */
	demo?: boolean;
};

/**
 * The address a profile gets when nobody types one. It carries a few random letters
 * because a browser can keep the database and lose the profile identifier, and then a
 * second profile with the same name would collide with the first.
 */
export function localAddress(name: string): string {
	const slug = name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "")
		.slice(0, 20);
	const tail = Math.random().toString(36).slice(2, 7);
	return `${slug === "" ? "eu" : slug}.${tail}@dispositivo.local`;
}

export async function startLocalProfile(driver: Driver, input: NewProfile): Promise<User> {
	const name = input.name.trim();
	const typed = input.email?.trim() ?? "";
	const person = await createUser(driver, {
		name,
		email: typed === "" ? localAddress(name) : typed,
	});

	const session = await openSession({ driver, userId: person.id, deviceId: deviceId() });
	const personal = await session.spaces.create({
		name: input.spaceName,
		kind: "personal",
		baseCurrency: input.currency,
	});

	// The starting set of categories, in the language the screen is in. Anybody who
	// wants none of it can throw it away in one screen.
	await session.categories.installDefaults({ spaceId: personal.id, language: input.language });

	if (input.demo) await seedDemo(driver, session, personal.id);

	return person;
}
