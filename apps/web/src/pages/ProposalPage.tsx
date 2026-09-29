// Three layouts for the overview, drawn so the owner can choose one.
//
// This screen is a proposal and not a product screen. It is built out of the real
// components and the real tokens, so what it shows is what can actually be built, and
// the numbers are the ones the sample data holds, so the picture is the one somebody
// would see. It is thrown away once a layout is chosen.
//
// The three differ in arrangement and never in content: every block below appears in
// all three, so the choice is about order and shape and not about what the screen says.

import { Button, Callout, InsightTitle, Panel } from "@cofre/ui";
import { Value } from "../components/Value.tsx";

const TODAY = "29 de setembro de 2026";

/** What the sample data holds, in minor units, as everything in this project. */
const DATA = {
	space: "Pessoal",
	money: [
		{ name: "Conta corrente", where: "Banco fictício", amount: 481_230, kind: "Conta corrente" },
		{ name: "Carteira", where: "", amount: 12_000, kind: "Dinheiro" },
	],
	investments: [{ name: "Corretora", where: "", amount: 843_000, kind: "Investimento" }],
	cards: [
		{
			name: "Cartão do banco",
			lastFour: "4417",
			open: 128_450,
			closesOn: "03/10",
			dueOn: "10/10",
			daysToClose: 4,
			later: 59_800,
			laterParts: "duas parcelas",
			limit: 500_000,
			used: 188_250,
			lastClosed: null as null | { month: string; amount: number; state: string },
		},
	],
	vouchers: [
		{ name: "Vale refeição", left: 64_500, quota: 90_000, renewsOn: 5, benefit: "VA e VR" },
	],
	late: [{ description: "Academia", amount: 14_900, on: "25/09", days: 4 }],
	out: [
		{ description: "Aluguel", account: "Conta corrente", amount: 185_000, on: "30/09" },
		{ description: "Internet", account: "Conta corrente", amount: 12_990, on: "30/09" },
		{
			description: "Fatura do Cartão do banco",
			account: "Conta corrente",
			amount: 128_450,
			on: "10/10",
			invoice: true,
		},
	],
	in: [{ description: "Salário", account: "Conta corrente", amount: 620_000, on: "05/10" }],
	month: { in: 620_000, out: 341_260, left: 278_740, usual: 218_000 },
	heaviest: [
		{ name: "Mercado", amount: 128_430 },
		{ name: "Restaurante", amount: 61_200 },
		{ name: "Transporte", amount: 38_840 },
	],
	limits: [{ name: "Mercado", spent: 128_430, limit: 140_000 }],
	saving: { asked: 124_000, done: 44_000 },
	goals: [{ name: "Viagem", done: 320_000, target: 800_000 }],
	findings: [
		{
			text: "A fatura do Cartão do banco subiu 18 por cento contra a média de três meses.",
			weight: "attention",
		},
		{
			text: "Mercado está em 92 por cento do limite com dois dias de mês pela frente.",
			weight: "attention",
		},
	],
};

const HAVE = 481_230 + 12_000 + 843_000;
const SPENDABLE = 481_230 + 12_000;
const DUE_THIS_MONTH = 185_000 + 12_990;
const STILL_TO_SAVE = 124_000 - 44_000;
const CAN_SPEND = SPENDABLE - DUE_THIS_MONTH - STILL_TO_SAVE;

/* ------------------------------------------------------------------ the blocks */

/**
 * A figure with the question it answers above it. The whole screen is made of these.
 *
 * The size is passed in rather than chosen here, because the same figure is the headline
 * of one proposal and one of four in a band in another, and a serif number at the
 * headline size is wider than a quarter of the screen.
 */
function Figure({
	label,
	amount,
	detail,
	size = "medium",
	tone = "neutral",
}: {
	label: string;
	amount: number;
	detail?: string;
	size?: "big" | "medium" | "small";
	tone?: "neutral" | "auto";
}) {
	const face =
		size === "big" ? "text-4xl sm:text-[2.75rem]" : size === "medium" ? "text-2xl" : "text-xl";
	return (
		<div className="min-w-0">
			<p className="text-sm text-quiet">{label}</p>
			<p className={`mt-1 ${face}`}>
				<Value amount={amount} tone={tone} face="serif" />
			</p>
			{detail ? <p className="mt-1 text-sm text-quiet">{detail}</p> : null}
		</div>
	);
}

function CardLine({ card }: { card: (typeof DATA.cards)[number] }) {
	return (
		<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
			<div className="min-w-0">
				<p className="truncate">
					{card.name} <span className="text-quiet">{card.lastFour}</span>
				</p>
				<p className="text-sm text-quiet">
					<Value amount={card.open} /> na fatura que vence {card.dueOn}
					{card.later > 0 ? (
						<>
							{", "}
							<Value amount={card.later} /> em parcelas depois
						</>
					) : null}
				</p>
			</div>
			<Button size="small" variant="secondary">
				Pagar fatura
			</Button>
		</div>
	);
}

function VoucherLine({ voucher }: { voucher: (typeof DATA.vouchers)[number] }) {
	return (
		<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
			<div className="min-w-0">
				<p className="truncate">{voucher.name}</p>
				<p className="text-sm text-quiet">
					<Value amount={voucher.left} /> de <Value amount={voucher.quota} /> neste mês, renova dia{" "}
					{voucher.renewsOn}
				</p>
			</div>
		</div>
	);
}

function Late() {
	if (DATA.late.length === 0) return null;
	return (
		<Callout tone="problem" title="Atrasado">
			<ul className="mt-1 space-y-2">
				{DATA.late.map((row) => (
					<li key={row.description} className="flex flex-wrap items-baseline justify-between gap-2">
						<span className="min-w-0">
							<span className="font-mono text-xs text-quiet">{row.on}</span> {row.description}{" "}
							<span className="text-quiet">venceu há {row.days} dias</span>
						</span>
						<span className="flex items-center gap-2">
							<Value amount={-row.amount} tone="auto" />
							<Button size="small" variant="secondary">
								Aconteceu
							</Button>
							<Button size="small" variant="quiet">
								Não aconteceu
							</Button>
						</span>
					</li>
				))}
			</ul>
		</Callout>
	);
}

function Due() {
	return (
		<Panel
			title="Vence nos próximos dias"
			action={
				<Button size="small" variant="quiet">
					Ver lançamentos
				</Button>
			}
		>
			<p className="text-sm text-quiet">Sai</p>
			<ul className="mt-1 divide-y divide-line border-line border-t">
				{DATA.out.map((row) => (
					<li
						key={row.description}
						className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
					>
						<span className="flex min-w-0 items-baseline gap-2">
							<span className="font-mono text-xs text-quiet">{row.on}</span>
							<span className="truncate">{row.description}</span>
							{row.invoice ? <span className="text-quiet text-xs">uma conta só</span> : null}
						</span>
						<span className="flex items-center gap-2">
							<Value amount={-row.amount} tone="auto" />
							<Button size="small" variant="secondary">
								Aconteceu
							</Button>
						</span>
					</li>
				))}
			</ul>

			<p className="mt-4 text-sm text-quiet">Entra</p>
			<ul className="mt-1 divide-y divide-line border-line border-t">
				{DATA.in.map((row) => (
					<li
						key={row.description}
						className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
					>
						<span className="flex min-w-0 items-baseline gap-2">
							<span className="font-mono text-xs text-quiet">{row.on}</span>
							<span className="truncate">{row.description}</span>
						</span>
						<span className="flex items-center gap-2">
							<Value amount={row.amount} tone="auto" />
							<Button size="small" variant="secondary">
								Recebido
							</Button>
						</span>
					</li>
				))}
			</ul>
		</Panel>
	);
}

function Invoices() {
	return (
		<Panel
			title="As faturas de agora"
			action={
				<Button size="small" variant="quiet">
					Ver faturas
				</Button>
			}
		>
			{/* Rows and not boxes. A bordered box inside a panel is a fourth surface, which
			    registry 0023 spent a release removing, and at a third of a wide screen it
			    wrapped every label onto three lines. */}
			<ul className="divide-y divide-line">
				{DATA.cards.map((card) => (
					<li key={card.name} className="py-3 first:pt-0 last:pb-0">
						<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
							<p className="min-w-0 truncate">
								{card.name} <span className="text-quiet">{card.lastFour}</span>
							</p>
							<p className="text-2xl">
								<Value amount={card.open} face="serif" />
							</p>
						</div>
						<p className="mt-1 text-sm text-quiet">
							Fecha {card.closesOn}, vence {card.dueOn}, faltam {card.daysToClose} dias. Em aberto.
						</p>
						<p className="mt-1 text-sm text-quiet">
							<Value amount={card.later} /> em parcelas depois. Limite disponível{" "}
							<Value amount={card.limit - card.used} />.
						</p>
						<div className="mt-3 flex gap-2">
							<Button size="small">Pagar fatura</Button>
							<Button size="small" variant="quiet">
								Ver fatura
							</Button>
						</div>
					</li>
				))}
			</ul>
		</Panel>
	);
}

function MonthSoFar() {
	return (
		<Panel title="O mês até agora">
			{/* Three across only where three fit. At the width of a telephone a serif number
			    is wider than a third of the screen, so they become rows and the label sits
			    beside the figure instead of above it. */}
			<div className="hidden grid-cols-3 gap-3 sm:grid">
				<Figure label="Entrou" amount={DATA.month.in} size="small" />
				<Figure label="Saiu" amount={-DATA.month.out} size="small" tone="auto" />
				<Figure label="Sobrou" amount={DATA.month.left} size="small" tone="auto" />
			</div>
			<dl className="divide-y divide-line sm:hidden">
				{[
					{ label: "Entrou", amount: DATA.month.in },
					{ label: "Saiu", amount: -DATA.month.out },
					{ label: "Sobrou", amount: DATA.month.left },
				].map((row) => (
					<div key={row.label} className="flex items-baseline justify-between gap-4 py-2">
						<dt className="text-quiet">{row.label}</dt>
						<dd className="text-xl">
							<Value amount={row.amount} tone="auto" face="serif" />
						</dd>
					</div>
				))}
			</dl>
			<p className="mt-3 text-sm text-quiet">
				Num mês comum sobra <Value amount={DATA.month.usual} />, então este mês está melhor.
			</p>

			<p className="mt-5 text-sm text-quiet">O que mais pesou</p>
			<ul className="mt-1 divide-y divide-line border-line border-t">
				{DATA.heaviest.map((row) => (
					<li key={row.name} className="flex items-baseline justify-between gap-4 py-2">
						<span className="truncate">{row.name}</span>
						<Value amount={row.amount} />
					</li>
				))}
			</ul>

			{DATA.limits.map((row) => (
				<p key={row.name} className="mt-4 text-sm">
					<span className="text-quiet">Perto do limite: </span>
					{row.name}, <Value amount={row.spent} /> de <Value amount={row.limit} />
				</p>
			))}
		</Panel>
	);
}

function Saving() {
	return (
		<Panel title="Guardar e metas">
			<p>
				A regra pede <Value amount={DATA.saving.asked} /> neste mês. Guardados{" "}
				<Value amount={DATA.saving.done} />.
			</p>
			<p className="mt-1 text-sm text-quiet">
				Faltam <Value amount={STILL_TO_SAVE} /> até o fim do mês.
			</p>
			<ul className="mt-4 divide-y divide-line border-line border-t">
				{DATA.goals.map((goal) => (
					<li key={goal.name} className="flex items-baseline justify-between gap-4 py-2">
						<span className="truncate">{goal.name}</span>
						<span className="text-sm text-quiet">
							<Value amount={goal.done} /> de <Value amount={goal.target} />
						</span>
					</li>
				))}
			</ul>
		</Panel>
	);
}

function WhereItIs() {
	const groups = [
		{ name: "Dinheiro", rows: DATA.money },
		{ name: "Investimentos", rows: DATA.investments },
	];
	return (
		<Panel
			title="Onde o dinheiro está"
			action={
				<Button size="small" variant="quiet">
					Ver todas
				</Button>
			}
		>
			{groups.map((group) => (
				<div key={group.name} className="mb-4 last:mb-0">
					<p className="text-sm text-quiet">{group.name}</p>
					<ul className="mt-1 divide-y divide-line border-line border-t">
						{group.rows.map((row) => (
							<li key={row.name} className="flex items-baseline justify-between gap-4 py-2">
								<span className="min-w-0 truncate">
									{row.name}
									{row.where ? <span className="text-quiet"> {row.where}</span> : null}
								</span>
								<Value amount={row.amount} tone="auto" />
							</li>
						))}
					</ul>
				</div>
			))}
			<div className="mb-4">
				<p className="text-sm text-quiet">Cartões</p>
				<ul className="mt-1 divide-y divide-line border-line border-t">
					{DATA.cards.map((card) => (
						<li key={card.name} className="flex items-baseline justify-between gap-4 py-2">
							<span className="min-w-0 truncate">{card.name}</span>
							<Value amount={-card.open} tone="auto" />
						</li>
					))}
				</ul>
			</div>
			<div>
				<p className="text-sm text-quiet">Benefícios</p>
				<ul className="mt-1 divide-y divide-line border-line border-t">
					{DATA.vouchers.map((voucher) => (
						<li key={voucher.name} className="flex items-baseline justify-between gap-4 py-2">
							<span className="min-w-0 truncate">{voucher.name}</span>
							<Value amount={voucher.left} />
						</li>
					))}
				</ul>
			</div>
		</Panel>
	);
}

function Attention() {
	return (
		<Panel
			title="O que precisa de atenção"
			action={
				<Button size="small" variant="quiet">
					Ver o diagnóstico
				</Button>
			}
		>
			<ul className="space-y-2">
				{DATA.findings.map((finding) => (
					<li key={finding.text} className="border-ochre border-l-2 pl-3 text-sm">
						{finding.text}
					</li>
				))}
			</ul>
		</Panel>
	);
}

/* ------------------------------------------------------------------ the three */

function One() {
	return (
		<div className="space-y-4">
			<Panel className="border-accent/30 bg-gradient-to-b from-accentSoft/60 to-panel">
				<InsightTitle level="h1" detail={`Em ${DATA.space}, hoje ${TODAY}.`}>
					Você tem isto em {DATA.space}
				</InsightTitle>
				<p className="mt-3 text-4xl sm:text-[2.75rem]">
					<Value amount={HAVE} face="serif" tone="auto" />
				</p>

				<div className="mt-4 divide-y divide-line border-line border-t">
					{DATA.cards.map((card) => (
						<CardLine key={card.name} card={card} />
					))}
					{DATA.vouchers.map((voucher) => (
						<VoucherLine key={voucher.name} voucher={voucher} />
					))}
				</div>

				<div className="mt-5 border-lineStrong border-t pt-4">
					<Figure
						label="Ainda dá para gastar este mês"
						amount={CAN_SPEND}
						tone="auto"
						detail="O que você tem para gastar, menos o que vence até dia 30 e o que falta guardar."
					/>
				</div>
			</Panel>

			<Late />
			<Due />
			<Invoices />
			<div className="grid gap-4 lg:grid-cols-2">
				<MonthSoFar />
				<Saving />
			</div>
			<WhereItIs />
			<Attention />
		</div>
	);
}

function Two() {
	return (
		<div className="space-y-4">
			<Panel className="border-accent/30 bg-gradient-to-b from-accentSoft/60 to-panel">
				<div className="grid gap-4 sm:grid-cols-2">
					<InsightTitle level="h1" detail={`Em ${DATA.space}, hoje ${TODAY}.`}>
						Você tem isto em {DATA.space}
					</InsightTitle>
					<div className="sm:text-right">
						<p className="text-4xl sm:text-[2.75rem]">
							<Value amount={HAVE} face="serif" tone="auto" />
						</p>
					</div>
				</div>
			</Panel>

			<Late />

			<div className="grid gap-4 lg:grid-cols-12">
				<div className="space-y-4 lg:col-span-7">
					<Panel title="Ainda dá para gastar este mês">
						<p className="text-4xl">
							<Value amount={CAN_SPEND} face="serif" tone="auto" />
						</p>
						<p className="mt-2 text-sm text-quiet">
							O que você tem para gastar, menos o que vence até dia 30 e o que falta guardar.
						</p>
						<dl className="mt-4 space-y-1 text-sm">
							<div className="flex justify-between gap-4">
								<dt className="text-quiet">Dinheiro para gastar</dt>
								<dd>
									<Value amount={SPENDABLE} />
								</dd>
							</div>
							<div className="flex justify-between gap-4">
								<dt className="text-quiet">Vence até o fim do mês</dt>
								<dd>
									<Value amount={-DUE_THIS_MONTH} tone="auto" />
								</dd>
							</div>
							<div className="flex justify-between gap-4">
								<dt className="text-quiet">Falta guardar</dt>
								<dd>
									<Value amount={-STILL_TO_SAVE} tone="auto" />
								</dd>
							</div>
						</dl>
					</Panel>
					<WhereItIs />
					<MonthSoFar />
					<Saving />
				</div>

				{/* The right column is time and nothing else: what is late, what falls due,
				    and the invoices that are open. The left is the state of the money. */}
				<div className="space-y-4 lg:col-span-5">
					<Due />
					<Invoices />
					<Attention />
				</div>
			</div>
		</div>
	);
}

function Three() {
	return (
		<div className="space-y-4">
			<Panel className="border-accent/30 bg-gradient-to-b from-accentSoft/60 to-panel">
				<InsightTitle level="h1" detail={`Em ${DATA.space}, hoje ${TODAY}.`}>
					Você tem isto em {DATA.space}
				</InsightTitle>
				{/* Two across on a telephone, four on a wide screen, and the first figure only
				    one size larger than its neighbours: at a quarter of the screen a serif
				    number at the headline size is wider than the column it sits in. */}
				<div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
					<Figure label="Você tem" amount={HAVE} size="medium" tone="auto" />
					<div className="border-line lg:border-l lg:pl-6">
						<Figure label="Ainda dá para gastar" amount={CAN_SPEND} size="small" tone="auto" />
					</div>
					<div className="border-line lg:border-l lg:pl-6">
						<Figure
							label="Vence até o fim do mês"
							amount={-DUE_THIS_MONTH}
							size="small"
							tone="auto"
						/>
					</div>
					<div className="border-line lg:border-l lg:pl-6">
						<Figure label="Falta guardar" amount={STILL_TO_SAVE} size="small" />
					</div>
				</div>
				<div className="mt-4 divide-y divide-line border-line border-t">
					{DATA.cards.map((card) => (
						<CardLine key={card.name} card={card} />
					))}
					{DATA.vouchers.map((voucher) => (
						<VoucherLine key={voucher.name} voucher={voucher} />
					))}
				</div>
			</Panel>

			<Late />
			<Invoices />
			<Due />
			<div className="grid gap-4 lg:grid-cols-2">
				<MonthSoFar />
				<Saving />
			</div>
			<WhereItIs />
			<Attention />
		</div>
	);
}

export function ProposalPage() {
	const which = new URLSearchParams(window.location.search).get("v") ?? "1";
	const names: Record<string, string> = {
		"1": "Proposta 1: uma coluna, a resposta no alto",
		"2": "Proposta 2: duas colunas, o dinheiro e o calendário",
		"3": "Proposta 3: a faixa de números",
	};

	// A label and not a heading: the screen keeps the one level one heading the product
	// gives every screen, which is the sentence inside the first panel.
	return (
		<div className="space-y-4">
			<p className="border-line border-b pb-2 font-mono text-quiet text-xs uppercase tracking-wide">
				{names[which] ?? names["1"]}
			</p>
			{which === "2" ? <Two /> : which === "3" ? <Three /> : <One />}
		</div>
	);
}
