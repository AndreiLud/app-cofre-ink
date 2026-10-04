// Demonstration data. Everything here is invented, and the interface says so wherever
// it shows up. It exists so that a person can see the product working before typing
// anything, and so that the shared space has more than one member to look at.

import { addDays, DEFAULT_CATEGORIES, type DefaultCategory, todayIn } from "@cofre/core";
import type { Driver, Session, User } from "@cofre/storage";
import { createUser, findUserByEmail, openSession } from "@cofre/storage";

/** One unit, the way a holding counts it: quantities are scaled by ten to the eighth. */
const UNIT = 100_000_000;

/** The names a category of the starting set has, in either language. */
function namesOf(key: string, list: readonly DefaultCategory[] = DEFAULT_CATEGORIES): string[] {
	for (const one of list) {
		if (one.key === key) return [one.pt, one.en];
		const inside = one.children ? namesOf(key, one.children) : [];
		if (inside.length > 0) return inside;
	}
	return [];
}

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
	/**
	 * The meal card, written down the way somebody writes one down now.
	 *
	 * With the allowance and the day it lands, and with nothing on it: a benefit card is not
	 * an account somebody pays into, so what is left on it is worked out from the quota less
	 * what was eaten. It used to be seeded with an opening balance, which is how a card
	 * written down before this release carries what it had, and the model refuses that on a
	 * new one now.
	 */
	const voucher = await session.accounts.create({
		spaceId,
		kind: "voucher",
		name: "Vale refeição",
		benefit: "meal",
		quotaAmount: 90_000,
		quotaDay: 5,
		quotaCarries: true,
	});

	// Two pieces of plastic, which is what this person actually carries: one that works
	// in both functions, so the demonstration shows the same card landing on the invoice
	// and leaving the balance, and one that only spends the meal voucher.
	const multiple = await session.cards.create({
		spaceId,
		kind: "multiple",
		name: "Cartão do banco",
		lastFour: "4417",
		creditAccountId: card.id,
		debitAccountId: checking.id,
	});
	const mealCard = await session.cards.create({
		spaceId,
		kind: "benefit",
		name: "Vale refeição",
		lastFour: "8302",
		debitAccountId: voucher.id,
	});
	// And a second plastic on the same invoice, which is how two people share one card: what
	// either of them buys is one bill, and the list says which plastic bought it.
	await session.cards.create({
		spaceId,
		kind: "credit",
		name: "Cartão adicional",
		lastFour: "2291",
		creditAccountId: card.id,
	});

	// A second card of credit, on a cycle of its own: it closes on the fifteenth and falls due
	// on the twenty second, so what is on it falls due after the first card's, and on the day
	// the browser suite runs, more than fifteen days ahead.
	const second = await session.accounts.create({
		spaceId,
		kind: "credit",
		name: "Horizonte",
		institution: "Banco fictício",
		initialBalance: 0,
		closingDay: 15,
		dueDay: 22,
		creditLimit: 300_000,
	});

	// A few weeks of a person who exists only here. Nothing is dated ahead but what a
	// series writes, which is what a series is for.
	const today = todayIn("America/Sao_Paulo");
	const day = (back: number) => addDays(today, -back);

	// The records are sorted into the starting set, so the categories screen and the
	// reports have something true to show from the first minute. Found by the key of the
	// starting set and not by a name typed here: two names typed here had drifted from the
	// set ("Aluguel" for "Aluguel ou financiamento", "Luz" for "Água, luz e gás"), so the
	// rent and the bills of every month were nobody's, and a space set up in English found
	// none of them.
	const sorted = await session.categories.list(spaceId);
	const find = (key: string) => {
		const names = namesOf(key);
		return sorted.find((category) => names.includes(category.name))?.id ?? null;
	};

	const written: Array<Parameters<typeof session.transactions.create>[0]> = [
		{
			spaceId,
			kind: "income",
			amount: 612_000,
			happenedOn: day(16),
			description: "Salário",
			accountId: checking.id,
			categoryId: find("salary"),
		},
		{
			spaceId,
			kind: "expense",
			amount: 21_800,
			happenedOn: day(14),
			description: "Feira da semana",
			accountId: checking.id,
			categoryId: find("groceries"),
		},
		{
			spaceId,
			kind: "expense",
			amount: 7_450,
			happenedOn: day(12),
			description: "Livraria",
			accountId: card.id,
			cardId: multiple.id,
			categoryId: find("courses"),
		},
		{
			spaceId,
			kind: "expense",
			amount: 3_200,
			happenedOn: day(9),
			description: "Cinema",
			accountId: card.id,
			cardId: multiple.id,
			categoryId: find("culture"),
		},
		{
			spaceId,
			kind: "expense",
			amount: 5_600,
			happenedOn: day(4),
			description: "Almoço perto do trabalho",
			accountId: voucher.id,
			cardId: mealCard.id,
			categoryId: find("restaurant"),
		},
		{
			spaceId,
			kind: "expense",
			amount: 1_900,
			happenedOn: day(2),
			description: "Café da esquina",
			accountId: wallet.id,
			categoryId: find("restaurant"),
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
		// What the second card holds, every one of them on the invoice that closes on the
		// fifteenth of next month.
		{
			spaceId,
			kind: "expense",
			amount: 4_890,
			happenedOn: day(3),
			description: "Farmácia",
			accountId: second.id,
			categoryId: find("pharmacy"),
		},
		{
			spaceId,
			kind: "expense",
			amount: 12_900,
			happenedOn: day(8),
			description: "Presente de aniversário",
			accountId: second.id,
			categoryId: find("gifts"),
		},
	];

	for (const record of written) await session.transactions.create(record);

	// The subscription, as a series: the line of its last charge is the first of the
	// series, and the charges of the next months are written by the series, on the same
	// card, each on its invoice.
	await session.recurrences.startWith({
		spaceId,
		kind: "expense",
		amount: 2_790,
		happenedOn: day(6),
		description: "Streaming",
		accountId: card.id,
		cardId: multiple.id,
		categoryId: find("streaming"),
		frequency: "monthly",
	});

	// Something split into parts, which is what makes the invoice screen worth opening.
	await session.transactions.create({
		spaceId,
		kind: "expense",
		amount: 89_700,
		happenedOn: day(7),
		description: "Fone de ouvido",
		categoryId: find("hobby"),
		accountId: card.id,
		cardId: multiple.id,
		installments: 3,
	});
	// And one on the second card, in six.
	await session.transactions.create({
		spaceId,
		kind: "expense",
		amount: 72_000,
		happenedOn: day(11),
		description: "Cadeira de escritório",
		categoryId: find("homeCare"),
		accountId: second.id,
		installments: 6,
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
			categoryId: find("salary"),
		});
		await session.transactions.create({
			spaceId,
			kind: "expense",
			amount: 148_000 + change,
			happenedOn: day(shift + 14),
			description: "Aluguel",
			accountId: checking.id,
			categoryId: find("rent"),
		});
		await session.transactions.create({
			spaceId,
			kind: "expense",
			amount: 89_400 + change,
			happenedOn: day(shift + 11),
			description: "Mercado do mês",
			accountId: checking.id,
			categoryId: find("groceries"),
		});
		await session.transactions.create({
			spaceId,
			kind: "expense",
			amount: 21_300 - change,
			happenedOn: day(shift + 6),
			description: "Contas de casa",
			accountId: checking.id,
			categoryId: find("utilities"),
		});
	}

	// And something put aside, so the investments screen is not an empty page either: the
	// treasury, a CDB, a fund traded on the exchange written down as what it is, and a real
	// estate fund, at a broker.
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
		product: "treasurySelic",
		indexer: "selic",
		maturesOn: "2029-03-01",
		quantity: 3 * UNIT,
		unitPrice: 152_340,
		cost: 450_000,
	});
	await session.investments.create({
		spaceId,
		accountId: broker.id,
		name: "BOVA11",
		ticker: "BOVA11",
		product: "etf",
		quantity: 12 * UNIT,
		unitPrice: 9_870,
		cost: 110_000,
	});
	await session.investments.create({
		spaceId,
		accountId: broker.id,
		name: "HGLG11",
		ticker: "HGLG11",
		product: "realEstateFund",
		quantity: 10 * UNIT,
		unitPrice: 15_820,
		cost: 160_000,
	});
	// Bought this month, so the months before it are read without it.
	await session.investments.create({
		spaceId,
		accountId: broker.id,
		name: "CDB Banco fictício",
		product: "cdb",
		issuer: "Banco fictício",
		indexer: "cdi",
		rate: 11_000,
		liquidity: "atMaturity",
		maturesOn: "2028-10-02",
		quantity: UNIT,
		unitPrice: 200_000,
		boughtOn: day(20),
	});

	// And a caixinha in the bank, which was already there before anybody wrote anything
	// down, so no account gives money to it: a holding written down with nothing moved.
	const boxes = await session.accounts.create({
		spaceId,
		kind: "investment",
		name: "Caixinhas",
		institution: "Banco fictício",
		initialBalance: 0,
	});
	await session.investments.create({
		spaceId,
		accountId: boxes.id,
		name: "Emergência",
		product: "box",
		indexer: "cdi",
		rate: 10_000,
		quantity: UNIT,
		unitPrice: 300_000,
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
