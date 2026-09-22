// Demonstration data. Everything here is invented, and the interface says so wherever
// it shows up. It exists so that a person can see the product working before typing
// anything, and so that the shared space has more than one member to look at.

import { addDays, todayIn } from "@cofre/core";
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
	const checking = await session.accounts.create({
		spaceId,
		kind: "checking",
		name: "Conta corrente",
		institution: "Banco fictício",
		initialBalance: 481_230,
	});
	const card = await session.accounts.create({
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
	const wallet = await session.accounts.create({
		spaceId,
		kind: "cash",
		name: "Carteira",
		initialBalance: 12_000,
	});
	const voucher = await session.accounts.create({
		spaceId,
		kind: "voucher",
		name: "Vale refeição",
		initialBalance: 64_500,
	});

	// A few weeks of a person who exists only here. Everything is settled on purpose:
	// what is planned belongs to the person using the app, not to the example.
	const today = todayIn("America/Sao_Paulo");
	const day = (back: number) => addDays(today, -back);

	const written: Array<Parameters<typeof session.transactions.create>[0]> = [
		{
			spaceId,
			kind: "income",
			amount: 612_000,
			happenedOn: day(16),
			description: "Salário",
			accountId: checking.id,
		},
		{
			spaceId,
			kind: "expense",
			amount: 21_800,
			happenedOn: day(14),
			description: "Feira da semana",
			accountId: checking.id,
		},
		{
			spaceId,
			kind: "expense",
			amount: 7_450,
			happenedOn: day(12),
			description: "Livraria",
			accountId: card.id,
		},
		{
			spaceId,
			kind: "expense",
			amount: 3_200,
			happenedOn: day(9),
			description: "Cinema",
			accountId: card.id,
		},
		{
			spaceId,
			kind: "expense",
			amount: 2_790,
			happenedOn: day(6),
			description: "Streaming",
			accountId: card.id,
		},
		{
			spaceId,
			kind: "expense",
			amount: 5_600,
			happenedOn: day(4),
			description: "Almoço perto do trabalho",
			accountId: voucher.id,
		},
		{
			spaceId,
			kind: "expense",
			amount: 1_900,
			happenedOn: day(2),
			description: "Café da esquina",
			accountId: wallet.id,
		},
		{
			spaceId,
			kind: "transfer",
			amount: 100_000,
			happenedOn: day(10),
			description: "Guardar um pouco",
			accountId: checking.id,
			counterAccountId: wallet.id,
		},
	];

	for (const record of written) await session.transactions.create(record);

	// Something split into parts, which is what makes the invoice screen worth opening.
	await session.transactions.create({
		spaceId,
		kind: "expense",
		amount: 89_700,
		happenedOn: day(7),
		description: "Fone de ouvido",
		accountId: card.id,
		installments: 3,
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
