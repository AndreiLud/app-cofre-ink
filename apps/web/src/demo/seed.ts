// Demonstration data. Everything here is invented, and the interface says so wherever
// it shows up. It exists so that a person can see the product working before typing
// anything, and so that the shared space has more than one member to look at.

import type { Driver, Session, User } from "@cofre/storage";
import { createUser, findUserByEmail, openSession } from "@cofre/storage";

export type SeedResult = {
	sharedSpaceId: string;
	partner: User;
};

export async function seedDemo(
	driver: Driver,
	session: Session,
	spaceId: string,
): Promise<SeedResult> {
	await session.accounts.create({
		spaceId,
		kind: "checking",
		name: "Conta corrente",
		institution: "Banco fictício",
		initialBalance: 481_230,
	});
	await session.accounts.create({
		spaceId,
		kind: "credit",
		name: "Cartão de crédito",
		institution: "Banco fictício",
		initialBalance: 0,
		// Closes on the third and falls due on the tenth, which is a common cycle and
		// makes the invoice of a purchase obvious to look at.
		closingDay: 3,
		dueDay: 10,
		creditLimit: 500_000,
	});
	await session.accounts.create({
		spaceId,
		kind: "cash",
		name: "Carteira",
		initialBalance: 12_000,
	});
	await session.accounts.create({
		spaceId,
		kind: "voucher",
		name: "Vale refeição",
		initialBalance: 64_500,
	});

	// A second person, so the shared space is a real shared space. The same browser can
	// go through the onboarding more than once, keeping the database, so this reuses
	// the example person instead of failing on an address that is already taken.
	const address = "joao@exemplo.invalido";
	const partner =
		(await findUserByEmail(driver, address)) ??
		(await createUser(driver, { email: address, name: "João (exemplo)" }));

	const house = await session.spaces.create({ name: "Casa", colour: "clay", icon: "wallet" });
	await session.members.invite({ spaceId: house.id, userId: partner.id, role: "editor" });

	const asPartner = await openSession({
		driver,
		userId: partner.id,
		deviceId: "exemplo",
	});
	await asPartner.members.accept(house.id);

	await session.accounts.create({
		spaceId: house.id,
		kind: "checking",
		name: "Conta conjunta",
		institution: "Banco fictício",
		initialBalance: 215_000,
	});

	return { sharedSpaceId: house.id, partner };
}
