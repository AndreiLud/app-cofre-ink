// What is put aside, and whether it is keeping up.
//
// A caixinha, a poupança, a CDB, an LCI, an LCA and the Tesouro Selic grow by what the Banco
// Central publishes, from the last value somebody typed; a share, a fund or crypto by the price
// somebody types, because a quote service means a key, a bill and a dependency on somebody else
// staying in business. A value typed from the statement always wins.
//
// The holdings are listed by class, each with the day its value is from, and each row has what
// can be done to it, every item there for whoever may make the call behind it. What this screen
// is for is the question a broker never answers, which is whether the money put aside is doing
// better than leaving it at the CDI: each holding against the same deposits at the CDI, each
// from its own day, and the ones whose days are not known listed apart rather than guessed.

import {
	addMonthsToMonth,
	grow,
	independence,
	monthOf,
	PRODUCT_GROUPS,
	type ProductGroup,
	todayIn,
} from "@cofre/core";
import type { HoldingMoveKind, HoldingValue } from "@cofre/storage";
import {
	BarList,
	Button,
	Callout,
	EmptyState,
	Field,
	Icon,
	InsightTitle,
	LineChart,
	Menu,
	MenuItem,
	MenuSeparator,
	Panel,
	SectionTitle,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
	HoldingHistoryDialog,
	HoldingPriceDialog,
	HoldingRemoveDialog,
} from "../components/HoldingDialogs.tsx";
import { HoldingForm } from "../components/HoldingForm.tsx";
import { HoldingMoveDialog } from "../components/HoldingMoveDialog.tsx";
import { Value } from "../components/Value.tsx";
import { readAmountOrZero, readPercentOrZero } from "../lib/amounts.ts";
import {
	afterHoldingsChange,
	HOLDINGS,
	inUnits,
	paysIncome,
	productOf,
	shortDay,
} from "../lib/holdings.ts";
import { sayWhy } from "../lib/sayWhy.ts";
import { useCofre } from "../storage/CofreProvider.tsx";
import { useWhatIMayDo } from "../storage/roles.ts";

export function InvestmentsPage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const currency = currentSpace?.baseCurrency ?? "BRL";
	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");
	const locale = i18n.resolvedLanguage === "en" ? "en" : "pt-BR";
	const money = (cents: number) =>
		new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
	const day = (value: string) => shortDay(value, i18n.resolvedLanguage);
	/** A number of months as years and months, each with its own plural, and none of nought. */
	const durationWords = (months: number) => {
		const years = Math.floor(months / 12);
		const rest = months % 12;
		const yearsSaid = t("investments.yearsPart", { count: years });
		const monthsSaid = t("investments.monthsPart", { count: rest });
		if (years > 0 && rest > 0) {
			return t("investments.yearsAndMonths", { years: yearsSaid, months: monthsSaid });
		}
		return years > 0 ? yearsSaid : monthsSaid;
	};

	/** The form: open for a new holding, or with the holding being corrected. */
	const [form, setForm] = useState<{ editing: HoldingValue | null } | null>(null);
	const [moving, setMoving] = useState<{ holding: HoldingValue; kind: HoldingMoveKind } | null>(
		null,
	);
	const [pricing, setPricing] = useState<HoldingValue | null>(null);
	const [history, setHistory] = useState<HoldingValue | null>(null);
	const [removing, setRemoving] = useState<HoldingValue | null>(null);
	const [problem, setProblem] = useState<string | null>(null);

	// The simulator, which is its own little thing and writes nothing.
	const [monthly, setMonthly] = useState("500");
	const [rate, setRate] = useState("10");
	const [years, setYears] = useState("10");

	const accounts = useQuery({
		queryKey: ["accounts", spaceId, "open"],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.accounts.list(spaceId) ?? [],
	});

	const holdings = useQuery({
		queryKey: [HOLDINGS, spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.investments.list(spaceId) ?? [],
	});

	const balances = useQuery({
		queryKey: ["balances", spaceId, today],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.transactions.balances(spaceId, today) ?? [],
	});

	// The month after this one, because the question below is what a whole month costs and
	// the month somebody is standing in is already part way gone. The projection counts only
	// the days still to come of it, which is right there and wrong here.
	const whole = addMonthsToMonth(monthOf(today), 1);
	const ahead = useQuery({
		queryKey: ["projection", spaceId, whole, 1, today],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () =>
			session?.projections.monthsAhead({ spaceId, from: whole, months: 1, today }) ?? null,
	});

	/**
	 * What somebody owns is part of what the space is worth, so everybody in it sees it. Each
	 * thing done to a holding is offered to whoever may make its call. Fetching the indices is
	 * for everybody: CDI, Selic, IPCA and the poupança are public figures in a table with no
	 * space of its own.
	 */
	const mine = useWhatIMayDo(spaceId);
	const may = {
		create: mine.mayCall("investments.create"),
		move: mine.mayCall("investments.move"),
		price: mine.mayCall("investments.price"),
		update: mine.mayCall("investments.update"),
		history: mine.mayCall("investments.moves"),
		remove: mine.mayCall("investments.remove"),
	};

	// Whether the indices were ever fetched here, which they are all at once.
	const latest = useQuery({
		queryKey: ["indices", "latest"],
		enabled: Boolean(session),
		queryFn: async () => (await session?.indices.latest()) ?? {},
	});
	const fetched = Boolean(latest.data?.cdi);

	const refresh = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			return session.indices.refresh({ today });
		},
		onSuccess: async () => {
			setProblem(null);
			await queries.invalidateQueries({ queryKey: ["indices"] });
			// An estimate grows with every day fetched.
			afterHoldingsChange(queries);
		},
		onError: (error: unknown) => setProblem(sayWhy(error, t)),
	});

	if (!currentSpace) return null;

	const list = holdings.data ?? [];
	const everyAccount = accounts.data ?? [];
	const accountOf = (id: string) => everyAccount.find((account) => account.id === id);
	const value = list.reduce((sum, holding) => sum + holding.value, 0);
	const invested = list.reduce((sum, holding) => sum + holding.invested, 0);
	const gain = value - invested;
	const percent = invested <= 0 ? 0 : Math.round((Math.abs(gain) / invested) * 100);

	/** Holdings from before 2.0.0 left in an account that is not an investment account. */
	const outside = list.filter((holding) => accountOf(holding.accountId)?.kind !== "investment");

	const groupOf = (holding: HoldingValue): ProductGroup => productOf(holding).group;
	const groups = PRODUCT_GROUPS.map((group) => ({
		group,
		rows: list.filter((holding) => groupOf(holding) === group),
	})).filter((one) => one.rows.length > 0);

	// Against the CDI: each holding whose deposits have days, at the CDI from those days.
	const dated = list.filter((holding) => holding.atTheCdi !== null);
	const undated = list.filter((holding) => holding.atTheCdi === null);
	const cdiThrough = dated
		.map((holding) => holding.atTheCdiThrough)
		.filter((one): one is string => one !== null)
		.sort()
		.at(-1);
	const datedValue = dated.reduce((sum, holding) => sum + holding.value, 0);
	const atTheCdi = dated.reduce((sum, holding) => sum + (holding.atTheCdi ?? 0), 0);
	const beyond = datedValue - atTheCdi;

	// Read while it is being typed, so half of what is there is half a number. The two
	// simulators below redraw on every keystroke, which is not the place for a sentence
	// about an amount that cannot be read.
	const simulated = grow({
		initial: value,
		monthly: readAmountOrZero(monthly, currency),
		yearly: readPercentOrZero(rate),
		months: Math.max(1, Math.min(Number(years) || 1, 50)) * 12,
	});

	// What a month costs, taken from the same arithmetic the projection uses, so the
	// two screens never disagree about it. A whole month, which is the month after this one.
	const monthlyExpense = ahead.data?.months[0]?.expense ?? 0;

	const independent = independence({
		monthlyExpense,
		// Four per cent a year is the number most of the literature argues about, and
		// the argument is not one this application is going to settle.
		withdrawalRate: 400,
		saved: value,
		monthly: readAmountOrZero(monthly, currency),
		yearly: readPercentOrZero(rate),
	});

	/** What a holding is, as the statement calls it, and where it is. */
	function whatItIs(holding: HoldingValue): string {
		const product = holding.product
			? t(`investments.products.${holding.product}`)
			: t(`investments.kinds.${holding.kind}`);
		const where = accountOf(holding.accountId)?.name;
		return where ? `${product} · ${where}` : product;
	}

	/** The day the value is from: calculated through a day, or typed on one. */
	function dayOfValue(holding: HoldingValue): string | null {
		if (holding.estimated && holding.estimatedThrough) {
			return t("investments.estimatedThrough", { day: day(holding.estimatedThrough) });
		}
		if (holding.pricedOn) return t("investments.valueOn", { day: day(holding.pricedOn) });
		return null;
	}

	/** What would be left after tax if it were all taken out today, or why that is not said. */
	function net(holding: HoldingValue): string | null {
		if (holding.exempt) return t("investments.exempt");
		if (holding.net) return t("investments.netToday", { amount: money(holding.net.net) });
		if (productOf(holding).tax === "regressive") return t("investments.noNet");
		return null;
	}

	function menu(holding: HoldingValue) {
		const units = inUnits(holding);
		const items = [
			may.move ? (
				<MenuItem key="in" onSelect={() => setMoving({ holding, kind: "in" })}>
					{units ? t("investments.menu.buy") : t("investments.menu.in")}
				</MenuItem>
			) : null,
			may.move ? (
				<MenuItem key="out" onSelect={() => setMoving({ holding, kind: "out" })}>
					{units ? t("investments.menu.sell") : t("investments.menu.out")}
				</MenuItem>
			) : null,
			may.move && paysIncome(holding) ? (
				<MenuItem key="income" onSelect={() => setMoving({ holding, kind: "income" })}>
					{t("investments.menu.income")}
				</MenuItem>
			) : null,
			may.price ? (
				<MenuItem key="price" onSelect={() => setPricing(holding)}>
					{t("investments.menu.price")}
				</MenuItem>
			) : null,
			may.update ? (
				<MenuItem key="edit" onSelect={() => setForm({ editing: holding })}>
					{t("investments.menu.edit")}
				</MenuItem>
			) : null,
			may.update && outside.includes(holding) ? (
				<MenuItem key="account" onSelect={() => setForm({ editing: holding })}>
					{t("investments.menu.toInvestmentAccount")}
				</MenuItem>
			) : null,
			may.history ? (
				<MenuItem key="history" onSelect={() => setHistory(holding)}>
					{t("investments.menu.history")}
				</MenuItem>
			) : null,
		].filter(Boolean);
		if (items.length === 0 && !may.remove) return null;
		return (
			<Menu
				align="end"
				trigger={
					<Button
						size="small"
						variant="quiet"
						aria-label={t("investments.actionsOf", { name: holding.name })}
					>
						<Icon name="settings" />
					</Button>
				}
			>
				{items}
				{may.remove ? (
					<>
						{items.length > 0 ? <MenuSeparator /> : null}
						<MenuItem onSelect={() => setRemoving(holding)} className="text-seal">
							{t("investments.menu.remove")}
						</MenuItem>
					</>
				) : null}
			</Menu>
		);
	}

	return (
		<div className="space-y-8">
			<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
				<InsightTitle
					level="h1"
					detail={
						list.length === 0
							? t("investments.nothingDetail")
							: gain > 0
								? t("investments.detailAbove", { invested: money(invested), percent })
								: gain < 0
									? t("investments.detailBelow", { invested: money(invested), percent })
									: t("investments.detailEven", { invested: money(invested) })
					}
				>
					{list.length === 0
						? t("investments.nothingHeadline")
						: t("investments.headline", { amount: money(value) })}
				</InsightTitle>

				{may.create ? (
					<Button
						variant="primary"
						onClick={() => {
							setProblem(null);
							setForm({ editing: null });
						}}
					>
						{t("investments.add")}
					</Button>
				) : null}
			</div>

			{problem ? <Callout tone="problem">{problem}</Callout> : null}
			{holdings.isPending ? <Skeleton lines={3} /> : null}

			{outside.length > 0 ? (
				<Callout tone="attention" title={t("investments.outsideTitle", { count: outside.length })}>
					{t("investments.outsideBody")}
				</Callout>
			) : null}

			{!holdings.isPending && list.length === 0 ? (
				<EmptyState
					icon="wallet"
					title={t("investments.emptyTitle")}
					description={t("investments.emptyBody")}
				/>
			) : null}

			{/* One table, a heading row for each class, so the amounts of every class stand in the
			    same column: a table for each class drew each column at its own width. */}
			{groups.length === 0 ? null : (
				<Table caption={t("investments.caption")}>
					<TableHead>
						<TableRow>
							<TableHeader>{t("investments.name")}</TableHeader>
							<TableHeader numeric={true}>{t("investments.value")}</TableHeader>
							<TableHeader numeric={true} className="hidden sm:table-cell">
								{t("investments.gain")}
							</TableHeader>
							<TableHeader className="w-12 print:hidden">
								<span className="sr-only">{t("investments.actions")}</span>
							</TableHeader>
						</TableRow>
					</TableHead>
					{groups.map(({ group, rows }) => (
						<TableBody key={group}>
							<tr>
								<th
									scope="rowgroup"
									colSpan={4}
									className="px-3 pt-6 pb-2 text-left font-normal sm:px-5"
								>
									<span className="font-serif text-ink text-lg">
										{t(`investments.groups.${group}`)}
									</span>
									<span className="ml-2 text-quiet text-sm">
										{money(rows.reduce((sum, holding) => sum + holding.value, 0))}
									</span>
								</th>
							</tr>
							{rows.map((holding) => {
								const said = dayOfValue(holding);
								const after = net(holding);
								return (
									<TableRow key={holding.id}>
										<TableCell>
											<span className="font-medium">{holding.name}</span>
											<span className="block text-quiet text-xs">{whatItIs(holding)}</span>
											{said ? <span className="block text-quiet text-xs">{said}</span> : null}
											{outside.includes(holding) ? (
												<span className="block text-seal text-xs">
													{t("investments.outsideMark")}
												</span>
											) : null}
										</TableCell>
										<TableCell numeric={true}>
											<Value amount={holding.value} currency={holding.currency} tone="neutral" />
											{after ? <span className="block text-quiet text-xs">{after}</span> : null}
										</TableCell>
										<TableCell numeric={true} className="hidden sm:table-cell">
											<Value amount={holding.gain} currency={holding.currency} tone="auto" />
											{holding.invested > 0 ? (
												<span className="block text-quiet text-xs">
													{t("investments.gainPercent", {
														percent: (holding.gainPercent / 100).toLocaleString(locale, {
															maximumFractionDigits: 2,
														}),
													})}
												</span>
											) : null}
										</TableCell>
										<TableCell className="print:hidden">{menu(holding)}</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					))}
				</Table>
			)}

			{list.length === 0 ? null : (
				<>
					<Panel title={t("investments.byClass")}>
						<BarList
							items={groups.map(({ group, rows }) => {
								const amount = rows.reduce((sum, holding) => sum + holding.value, 0);
								return {
									key: group,
									label: t(`investments.groups.${group}`),
									amount,
									value: money(amount),
									tone: "cedar" as const,
								};
							})}
						/>
					</Panel>

					<Panel
						title={t("investments.againstTheIndex")}
						action={
							<Button
								size="small"
								variant="secondary"
								disabled={refresh.isPending}
								onClick={() => refresh.mutate()}
							>
								{t("investments.refreshIndices")}
							</Button>
						}
					>
						<p className="max-w-[60ch] text-quiet text-sm">{t("investments.againstBody")}</p>

						{!fetched && cdiThrough === undefined ? (
							<Callout tone="attention" title={t("investments.noIndicesTitle")}>
								{t("investments.noIndicesBody")}
							</Callout>
						) : dated.length === 0 ? null : (
							<>
								<p className="text-ink text-sm">
									{beyond >= 0
										? t("investments.beatTheCdi", { amount: money(beyond) })
										: t("investments.behindTheCdi", { amount: money(-beyond) })}
								</p>
								<Table caption={t("investments.againstCaption")}>
									<TableHead>
										<TableRow>
											<TableHeader>{t("investments.name")}</TableHeader>
											<TableHeader numeric={true}>{t("investments.value")}</TableHeader>
											<TableHeader numeric={true}>{t("investments.atTheCdi")}</TableHeader>
											<TableHeader numeric={true} className="hidden sm:table-cell">
												{t("investments.difference")}
											</TableHeader>
										</TableRow>
									</TableHead>
									<TableBody>
										{dated.map((holding) => (
											<TableRow key={holding.id}>
												<TableCell>{holding.name}</TableCell>
												<TableCell numeric={true}>
													<Value amount={holding.value} currency={holding.currency} />
												</TableCell>
												<TableCell numeric={true}>
													<Value amount={holding.atTheCdi ?? 0} currency={holding.currency} />
												</TableCell>
												<TableCell numeric={true} className="hidden sm:table-cell">
													<Value
														amount={holding.value - (holding.atTheCdi ?? 0)}
														currency={holding.currency}
														tone="auto"
													/>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
								{cdiThrough ? (
									<p className="text-quiet text-xs">
										{t("investments.cdiThrough", { day: day(cdiThrough) })}
									</p>
								) : null}
							</>
						)}

						{undated.length > 0 ? (
							<p className="text-quiet text-sm">
								{t("investments.leftOutOfComparison", {
									names: undated.map((holding) => holding.name).join(", "),
								})}
							</p>
						) : null}
					</Panel>
				</>
			)}

			<section className="space-y-3 border-line border-t pt-5">
				<SectionTitle>{t("investments.simulator")}</SectionTitle>
				<p className="max-w-[60ch] text-quiet text-sm">{t("investments.simulatorBody")}</p>

				<div className="grid gap-3 sm:grid-cols-3">
					<Field
						label={t("investments.everyMonth")}
						value={monthly}
						onChange={(event) => setMonthly(event.target.value)}
						numeric={true}
					/>
					<Field
						label={t("investments.aYear")}
						value={rate}
						onChange={(event) => setRate(event.target.value)}
						hint={t("investments.aYearHint")}
						numeric={true}
					/>
					<Field
						label={t("investments.forYears")}
						value={years}
						onChange={(event) => setYears(event.target.value)}
						numeric={true}
					/>
				</div>

				<LineChart
					labels={simulated
						.filter((_month, index) => index % 12 === 11)
						.map((month) => String(month.month / 12))}
					series={[
						{
							key: "total",
							label: t("investments.total"),
							tone: "cedar",
							points: simulated
								.filter((_month, index) => index % 12 === 11)
								.map((month) => month.total),
						},
						{
							key: "contributed",
							label: t("investments.putIn"),
							tone: "graphite",
							dotted: true,
							points: simulated
								.filter((_month, index) => index % 12 === 11)
								.map((month) => month.contributed),
						},
					]}
					description={t("investments.simulatorChart")}
					format={(amount) =>
						new Intl.NumberFormat(locale, {
							style: "currency",
							currency,
							maximumFractionDigits: 0,
						}).format(amount / 100)
					}
				/>

				<p className="text-quiet text-sm">
					{t("investments.simulatorResult", {
						years,
						total: money(simulated[simulated.length - 1]?.total ?? 0),
						earned: money(simulated[simulated.length - 1]?.earned ?? 0),
					})}
				</p>

				{/* Not for somebody who reads only what they wrote. This divides what the
				    whole household owns, which everybody in a space sees, by the spending of
				    one person, which is all they see, and hands back a number made of two
				    different questions: five hundred months of cover and financial
				    independence reached. */}
				{value > 0 && monthlyExpense > 0 && !mine.seesOwnRowsOnly ? (
					<div className="space-y-1 border-line border-t pt-4">
						<p className="text-ink text-sm">
							{t("investments.covers", { count: independent.monthsCovered })}
						</p>
						<p className="text-quiet text-sm">
							{t("investments.independence", {
								target: money(independent.target),
								percent: independent.percent,
							})}
						</p>
						{independent.months === null ? (
							<p className="text-quiet text-sm">{t("investments.independenceNever")}</p>
						) : (
							<p className="text-quiet text-sm">
								{/* Each part with its own plural, and a part of nought left out: it said
								    "24 anos e 1 meses". */}
								{t("investments.independenceWhen", {
									when: durationWords(independent.months),
								})}
							</p>
						)}
					</div>
				) : null}
			</section>

			<HoldingForm
				open={form !== null}
				onOpenChange={(open) => {
					if (!open) setForm(null);
				}}
				spaceId={spaceId}
				editing={form?.editing ?? null}
				accounts={everyAccount}
				holdings={list}
				balances={balances.data ?? []}
				today={today}
			/>
			<HoldingMoveDialog
				open={moving !== null}
				onOpenChange={(open) => {
					if (!open) setMoving(null);
				}}
				spaceId={spaceId}
				holding={moving?.holding ?? null}
				kind={moving?.kind ?? "in"}
				accounts={everyAccount}
				today={today}
			/>
			<HoldingPriceDialog holding={pricing} onClose={() => setPricing(null)} today={today} />
			<HoldingHistoryDialog
				holding={history}
				onClose={() => setHistory(null)}
				accounts={everyAccount}
				spaceId={spaceId}
			/>
			<HoldingRemoveDialog
				holding={removing}
				onClose={() => setRemoving(null)}
				accounts={everyAccount}
				spaceId={spaceId}
			/>
		</div>
	);
}
