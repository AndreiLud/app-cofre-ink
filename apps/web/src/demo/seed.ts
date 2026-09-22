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

	// The records are sorted into the starting set, so the categories screen and the
	// reports have something true to show from the first minute.
	const sorted = await session.categories.list(spaceId);
	const find = (name: string) => sorted.find((category) => category.name === name)?.id ?? null;

	const written: Array<Parameters<typeof session.transactions.create>[0]> = [
		{
			spaceId,
			kind: "income",
			amount: 612_000,
			happenedOn: day(16),
			description: "Salário",
			accountId: checking.id,
			categoryId: find("Salário"),
		},
		{
			spaceId,
			kind: "expense",
			amount: 21_800,
			happenedOn: day(14),
			description: "Feira da semana",
			accountId: checking.id,
			categoryId: find("Mercado"),
		},
		{
			spaceId,
			kind: "expense",
			amount: 7_450,
			happenedOn: day(12),
			description: "Livraria",
			accountId: card.id,
			categoryId: find("Cursos e livros"),
		},
		{
			spaceId,
			kind: "expense",
			amount: 3_200,
			happenedOn: day(9),
			description: "Cinema",
			accountId: card.id,
			categoryId: find("Cinema, show e teatro"),
		},
		{
			spaceId,
			kind: "expense",
			amount: 2_790,
			happenedOn: day(6),
			description: "Streaming",
			accountId: card.id,
			categoryId: find("Streaming"),
		},
		{
			spaceId,
			kind: "expense",
			amount: 5_600,
			happenedOn: day(4),
			description: "Almoço perto do trabalho",
			accountId: voucher.id,
			categoryId: find("Restaurante"),
		},
		{
			spaceId,
			kind: "expense",
			amount: 1_900,
			happenedOn: day(2),
			description: "Café da esquina",
			accountId: wallet.id,
			categoryId: find("Restaurante"),
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
		categoryId: find("Hobby"),
		accountId: card.id,
		installments: 3,
	});

	// Three months behind, so that the screens that look backwards have something to
	// look at: the twelve months of the reports, and the usual month a projection is
	// built on. The amounts wobble, because a month that is identical to the last one
	// is not a month anybody has ever had.
	const wobble = [0, -1800, 2400];
	for (let back = 1; back <= 3; back += 1) {
		const shift = 30 * back;
		const change = wobble[back - 1] ?? 0;

		await session.transactions.create({
			spaceId,
			kind: "income",
			amount: 612_000,
			happenedOn: day(shift + 16),
			description: "Salário",
			accountId: checking.id,
			categoryId: find("Salário"),
		});
		await session.transactions.create({
			spaceId,
			kind: "expense",
			amount: 148_000 + change,
			happenedOn: day(shift + 14),
			description: "Aluguel",
			accountId: checking.id,
			categoryId: find("Aluguel"),
		});
		await session.transactions.create({
			spaceId,
			kind: "expense",
			amount: 89_400 + change,
			happenedOn: day(shift + 11),
			description: "Mercado do mês",
			accountId: checking.id,
			categoryId: find("Mercado"),
		});
		await session.transactions.create({
			spaceId,
			kind: "expense",
			amount: 21_300 - change,
			happenedOn: day(shift + 6),
			description: "Contas de casa",
			accountId: checking.id,
			categoryId: find("Luz"),
		});
	}

	// And something put aside, so the investments screen is not an empty page either.
	const broker = await session.accounts.create({
		spaceId,
		kind: "investment",
		name: "Corretora",
		institution: "Banco fictício",
		initialBalance: 0,
	});

	await session.investments.create({
		spaceId,
		accountId: broker.id,
		name: "Tesouro Selic 2029",
		kind: "fixedIncome",
		quantity: 3 * 100_000_000,
		unitPrice: 152_340,
		cost: 450_000,
	});
	await session.investments.create({
		spaceId,
		accountId: broker.id,
		name: "Fundo de índice",
		kind: "fund",
		quantity: 12 * 100_000_000,
		unitPrice: 9_870,
		cost: 110_000,
	});

	// A second person, so the shared space is a real shared space. The same browser can
	// go through the onboarding more than once, keeping the database, so this reuses
	// the example person instead of failing on an address that is already taken.
	const address = "joao@exemplo.invalido";
	const partner =
		(await findUserByEmail(driver, address)) ??
		(await createUser(driver, { email: address, name: "João (exemplo)" }));

	const house = await session.spaces.create({ name: "Casa", colour: "clay", icon: "wallet" });
	await session.categories.installDefaults({ spaceId: house.id });
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
