// The categories a space starts with.
//
// A list of nothing means nobody categorises anything, and a list of eighty means
// nobody finishes the first week. This is the short list somebody can live with on day
// one, with the subcategories that people actually look for. All of it can be renamed,
// added to, archived or thrown away.
//
// The priority of each one is a starting point, not a verdict. A gym is desirable for
// most people and essential for somebody recovering from an injury, so the screen
// makes it easy to change and the record can disagree with its category.

export type SpendingPriority = "essential" | "important" | "desirable" | "superfluous";
export type CategoryKind = "expense" | "income";

export type DefaultCategory = {
	/** Stable across languages, so a rule or an import can point at one of these. */
	key: string;
	pt: string;
	en: string;
	kind: CategoryKind;
	priority: SpendingPriority;
	children?: DefaultCategory[];
};

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
	{
		key: "housing",
		pt: "Moradia",
		en: "Housing",
		kind: "expense",
		priority: "essential",
		children: [
			{
				key: "rent",
				pt: "Aluguel ou financiamento",
				en: "Rent or mortgage",
				kind: "expense",
				priority: "essential",
			},
			{
				key: "utilities",
				pt: "Água, luz e gás",
				en: "Water, power and gas",
				kind: "expense",
				priority: "essential",
			},
			{
				key: "internet",
				pt: "Internet e telefone",
				en: "Internet and phone",
				kind: "expense",
				priority: "important",
			},
			{
				key: "homeCare",
				pt: "Manutenção da casa",
				en: "Home upkeep",
				kind: "expense",
				priority: "important",
			},
		],
	},
	{
		key: "food",
		pt: "Alimentação",
		en: "Food",
		kind: "expense",
		priority: "essential",
		children: [
			{ key: "groceries", pt: "Mercado", en: "Groceries", kind: "expense", priority: "essential" },
			{
				key: "restaurant",
				pt: "Restaurante",
				en: "Restaurant",
				kind: "expense",
				priority: "desirable",
			},
			{ key: "delivery", pt: "Delivery", en: "Delivery", kind: "expense", priority: "superfluous" },
		],
	},
	{
		key: "transport",
		pt: "Transporte",
		en: "Transport",
		kind: "expense",
		priority: "important",
		children: [
			{
				key: "publicTransport",
				pt: "Transporte público",
				en: "Public transport",
				kind: "expense",
				priority: "essential",
			},
			{
				key: "rides",
				pt: "Aplicativo e táxi",
				en: "Rides and taxi",
				kind: "expense",
				priority: "desirable",
			},
			{ key: "fuel", pt: "Combustível", en: "Fuel", kind: "expense", priority: "important" },
			{
				key: "vehicle",
				pt: "Carro e manutenção",
				en: "Car and upkeep",
				kind: "expense",
				priority: "important",
			},
		],
	},
	{
		key: "health",
		pt: "Saúde",
		en: "Health",
		kind: "expense",
		priority: "essential",
		children: [
			{
				key: "healthPlan",
				pt: "Plano de saúde",
				en: "Health plan",
				kind: "expense",
				priority: "essential",
			},
			{ key: "pharmacy", pt: "Farmácia", en: "Pharmacy", kind: "expense", priority: "essential" },
			{
				key: "therapy",
				pt: "Terapia e consultas",
				en: "Therapy and appointments",
				kind: "expense",
				priority: "essential",
			},
			{
				key: "fitness",
				pt: "Academia e esporte",
				en: "Gym and sport",
				kind: "expense",
				priority: "desirable",
			},
		],
	},
	{
		key: "education",
		pt: "Educação",
		en: "Education",
		kind: "expense",
		priority: "important",
		children: [
			{
				key: "tuition",
				pt: "Escola e faculdade",
				en: "School and university",
				kind: "expense",
				priority: "important",
			},
			{
				key: "courses",
				pt: "Cursos e livros",
				en: "Courses and books",
				kind: "expense",
				priority: "desirable",
			},
		],
	},
	{
		key: "family",
		pt: "Família",
		en: "Family",
		kind: "expense",
		priority: "important",
		children: [
			{ key: "children", pt: "Filhos", en: "Children", kind: "expense", priority: "essential" },
			{ key: "pets", pt: "Animais", en: "Pets", kind: "expense", priority: "important" },
			{
				key: "help",
				pt: "Ajuda a familiares",
				en: "Helping relatives",
				kind: "expense",
				priority: "important",
			},
		],
	},
	{
		key: "personal",
		pt: "Cuidados pessoais",
		en: "Personal care",
		kind: "expense",
		priority: "important",
		children: [
			{
				key: "haircut",
				pt: "Cabelo e estética",
				en: "Hair and beauty",
				kind: "expense",
				priority: "desirable",
			},
			{
				key: "clothes",
				pt: "Roupas e calçados",
				en: "Clothes and shoes",
				kind: "expense",
				priority: "desirable",
			},
		],
	},
	{
		key: "leisure",
		pt: "Lazer",
		en: "Leisure",
		kind: "expense",
		priority: "desirable",
		children: [
			{
				key: "goingOut",
				pt: "Bar e balada",
				en: "Bars and nights out",
				kind: "expense",
				priority: "superfluous",
			},
			{
				key: "culture",
				pt: "Cinema, show e teatro",
				en: "Cinema, gigs and theatre",
				kind: "expense",
				priority: "desirable",
			},
			{ key: "travel", pt: "Viagem", en: "Travel", kind: "expense", priority: "desirable" },
			{ key: "hobby", pt: "Hobby", en: "Hobby", kind: "expense", priority: "desirable" },
		],
	},
	{
		key: "subscriptions",
		pt: "Assinaturas",
		en: "Subscriptions",
		kind: "expense",
		priority: "desirable",
		children: [
			{
				key: "streaming",
				pt: "Streaming",
				en: "Streaming",
				kind: "expense",
				priority: "superfluous",
			},
			{
				key: "software",
				pt: "Aplicativos e serviços",
				en: "Apps and services",
				kind: "expense",
				priority: "desirable",
			},
		],
	},
	{
		key: "financial",
		pt: "Finanças",
		en: "Money",
		kind: "expense",
		priority: "important",
		children: [
			{ key: "taxes", pt: "Impostos", en: "Taxes", kind: "expense", priority: "essential" },
			{
				key: "fees",
				pt: "Tarifas e juros",
				en: "Fees and interest",
				kind: "expense",
				priority: "important",
			},
			{ key: "insurance", pt: "Seguros", en: "Insurance", kind: "expense", priority: "important" },
		],
	},
	{
		key: "gifts",
		pt: "Presentes e doações",
		en: "Gifts and giving",
		kind: "expense",
		priority: "desirable",
	},
	{
		key: "otherExpense",
		pt: "Outros gastos",
		en: "Other spending",
		kind: "expense",
		priority: "important",
	},

	{
		key: "salary",
		pt: "Salário",
		en: "Salary",
		kind: "income",
		priority: "essential",
	},
	{
		key: "freelance",
		pt: "Trabalho extra",
		en: "Extra work",
		kind: "income",
		priority: "essential",
	},
	{
		key: "investments",
		pt: "Rendimentos",
		en: "Investment income",
		kind: "income",
		priority: "essential",
	},
	{ key: "refunds", pt: "Reembolsos", en: "Refunds", kind: "income", priority: "essential" },
	{
		key: "otherIncome",
		pt: "Outras entradas",
		en: "Other income",
		kind: "income",
		priority: "essential",
	},
];

/**
 * The priority that counts for one record: what it says about itself, and otherwise
 * what its category says. A record with no category has none, which the screens read
 * as "not sorted yet" rather than as any level.
 */
export function effectivePriority(
	record: { priority?: SpendingPriority | null },
	category?: { priority: SpendingPriority } | null,
): SpendingPriority | null {
	return record.priority ?? category?.priority ?? null;
}
