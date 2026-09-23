// What is put aside, and whether it is keeping up.
//
// Prices are typed in by hand, which sounds like a limitation and is mostly a decision:
// a quote service means a key, a bill and a dependency on somebody else staying in
// business, and the person who wants live prices already has them at their broker. What
// this screen is for is the question a broker never answers, which is whether the money
// put aside is doing better than leaving it in the bank.
//
// That is what the comparison is. The same money, put in on the same day, growing at
// what the CDI actually did. The numbers come from the Banco Central and are asked for
// when somebody presses the button, never on a schedule.

import { grow, growAtRates, independence, monthOf, todayIn } from "@cofre/core";
import type { HoldingKind, HoldingValue, IndexRate } from "@cofre/storage";
import {
	BarList,
	Button,
	Callout,
	Dialog,
	EmptyState,
	Field,
	InsightTitle,
	LineChart,
	Panel,
	SectionTitle,
	Select,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@cofre/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Value } from "../components/Value.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

const KINDS: HoldingKind[] = [
	"fixedIncome",
	"fund",
	"stock",
	"realEstate",
	"crypto",
	"pension",
	"other",
];

/** Quantities are scaled by ten to the eighth, so a fund can have fractions of a unit. */
const QUANTITY_SCALE = 100_000_000;

function parseAmount(value: string): number {
	const cleaned = value.replace(/\./g, "").replace(",", ".");
	const parsed = Number.parseFloat(cleaned);
	return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function parseQuantity(value: string): number {
	const cleaned = value.replace(/\./g, "").replace(",", ".");
	const parsed = Number.parseFloat(cleaned);
	return Number.isFinite(parsed) ? Math.round(parsed * QUANTITY_SCALE) : 0;
}

export function InvestmentsPage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const currency = currentSpace?.baseCurrency ?? "BRL";
	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");
	const locale = i18n.resolvedLanguage === "en" ? "en" : "pt-BR";

	const [isOpen, setOpen] = useState(false);
	const [pricing, setPricing] = useState<HoldingValue | null>(null);
	const [problem, setProblem] = useState<string | null>(null);

	const [name, setName] = useState("");
	const [kind, setKind] = useState<HoldingKind>("fixedIncome");
	const [accountId, setAccountId] = useState("");
	const [quantity, setQuantity] = useState("1");
	const [unitPrice, setUnitPrice] = useState("");
	const [cost, setCost] = useState("");
	const [newPrice, setNewPrice] = useState("");

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
		queryKey: ["holdings", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.investments.list(spaceId) ?? [],
	});

	const ahead = useQuery({
		queryKey: ["projection", spaceId, monthOf(today), 1],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () =>
			session?.projections.monthsAhead({ spaceId, from: monthOf(today), months: 1 }) ?? null,
	});

	const indices = useQuery({
		queryKey: ["indices", "cdi"],
		enabled: Boolean(session),
		queryFn: () => session?.indices.list("cdi", { from: "2024-01" }) ?? [],
	});

	const latest = useQuery({
		queryKey: ["indices", "latest"],
		enabled: Boolean(session),
		queryFn: async () =>
			(await session?.indices.latest()) ?? ({} as Record<string, IndexRate | null>),
	});

	const refresh = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			return session.indices.refresh({
				series: ["cdi", "selic", "ipca"],
				from: monthOf(today).slice(0, 4).concat("-01"),
			});
		},
		onSuccess: async () => {
			setProblem(null);
			await queries.invalidateQueries({ queryKey: ["indices"] });
		},
		onError: (error: unknown) => setProblem(error instanceof Error ? error.message : String(error)),
	});

	const create = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");
			const usable = (accounts.data ?? []).filter((account) => account.archivedAt === null);
			const account = usable.find((one) => one.id === accountId) ?? usable[0];
			if (!account) throw new Error(t("investments.noAccountBody"));

			return session.investments.create({
				spaceId,
				accountId: account.id,
				name: name.trim(),
				kind,
				quantity: parseQuantity(quantity),
				unitPrice: parseAmount(unitPrice),
				cost: cost.trim() === "" ? undefined : parseAmount(cost),
			});
		},
		onSuccess: async () => {
			setOpen(false);
			setName("");
			setUnitPrice("");
			setCost("");
			setProblem(null);
			await queries.invalidateQueries({ queryKey: ["holdings", spaceId] });
		},
		onError: (error: unknown) => setProblem(error instanceof Error ? error.message : String(error)),
	});

	const price = useMutation({
		mutationFn: async () => {
			if (!session || !pricing) throw new Error("no session");
			return session.investments.price({
				id: pricing.id,
				unitPrice: parseAmount(newPrice),
				onDay: today,
			});
		},
		onSuccess: async () => {
			setPricing(null);
			setNewPrice("");
			setProblem(null);
			await queries.invalidateQueries({ queryKey: ["holdings", spaceId] });
		},
		onError: (error: unknown) => setProblem(error instanceof Error ? error.message : String(error)),
	});

	if (!currentSpace) return null;

	const list = holdings.data ?? [];
	const value = list.reduce((sum, holding) => sum + holding.value, 0);
	const invested = list.reduce((sum, holding) => sum + holding.cost, 0);
	const gain = value - invested;

	// The same money, at what the CDI actually did, for the months that are held.
	const rates = (indices.data ?? []).slice(-24);
	const againstCdi = growAtRates(
		invested,
		rates.map((month) => month.rate),
	);

	const simulated = grow({
		initial: value,
		monthly: parseAmount(monthly),
		yearly: Math.round(Number(rate.replace(",", ".") || "0") * 100),
		months: Math.max(1, Math.min(Number(years) || 1, 50)) * 12,
	});

	// What a month costs, taken from the same arithmetic the projection uses, so the
	// two screens never disagree about it.
	const monthlyExpense = ahead.data?.months[0]?.expense ?? 0;

	const independent = independence({
		monthlyExpense,
		// Four per cent a year is the number most of the literature argues about, and
		// the argument is not one this application is going to settle.
		withdrawalRate: 400,
		saved: value,
		monthly: parseAmount(monthly),
		yearly: Math.round(Number(rate.replace(",", ".") || "0") * 100),
	});

	return (
		<div className="space-y-8">
			<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
				<InsightTitle
					level="h1"
					detail={
						list.length === 0
							? t("investments.nothingDetail")
							: t("investments.detail", {
									invested: new Intl.NumberFormat(locale, {
										style: "currency",
										currency,
									}).format(invested / 100),
									percent: invested === 0 ? 0 : Math.round((gain / invested) * 100),
								})
					}
				>
					{list.length === 0
						? t("investments.nothingHeadline")
						: t("investments.headline", {
								amount: new Intl.NumberFormat(locale, { style: "currency", currency }).format(
									value / 100,
								),
							})}
				</InsightTitle>

				<Button variant="primary" onClick={() => setOpen(true)}>
					{t("investments.add")}
				</Button>
			</div>

			{problem ? <Callout tone="problem">{problem}</Callout> : null}
			{holdings.isPending ? <Skeleton lines={3} /> : null}

			{!holdings.isPending && list.length === 0 ? (
				<EmptyState
					icon="wallet"
					title={t("investments.emptyTitle")}
					description={t("investments.emptyBody")}
				/>
			) : null}

			{list.length === 0 ? null : (
				<>
					<Panel title={t("investments.whatYouHave")}>
						<Table caption={t("investments.caption")}>
							<TableHead>
								<TableRow>
									<TableHeader>{t("investments.name")}</TableHeader>
									<TableHeader className="hidden sm:table-cell">
										{t("investments.kind")}
									</TableHeader>
									<TableHeader numeric={true}>{t("investments.quantity")}</TableHeader>
									<TableHeader numeric={true}>{t("investments.unitPrice")}</TableHeader>
									<TableHeader numeric={true}>{t("investments.value")}</TableHeader>
									<TableHeader numeric={true}>{t("investments.gain")}</TableHeader>
									<TableHeader className="print:hidden">{t("investments.actions")}</TableHeader>
								</TableRow>
							</TableHead>
							<TableBody>
								{list.map((holding) => (
									<TableRow key={holding.id}>
										<TableCell>
											{holding.name}
											{holding.pricedOn ? (
												<span className="block text-xs text-quiet">
													{t("investments.pricedOn", { day: holding.pricedOn })}
												</span>
											) : null}
										</TableCell>
										<TableCell className="hidden text-quiet sm:table-cell">
											{t(`investments.kinds.${holding.kind}`)}
										</TableCell>
										<TableCell numeric={true} className="font-mono text-xs">
											{(holding.quantity / QUANTITY_SCALE).toLocaleString(locale, {
												maximumFractionDigits: 8,
											})}
										</TableCell>
										<TableCell numeric={true}>
											<Value
												amount={holding.unitPrice}
												currency={holding.currency}
												tone="neutral"
											/>
										</TableCell>
										<TableCell numeric={true}>
											<Value amount={holding.value} currency={holding.currency} tone="neutral" />
										</TableCell>
										<TableCell numeric={true}>
											<Value amount={holding.gain} currency={holding.currency} tone="auto" />
										</TableCell>
										<TableCell className="print:hidden">
											<Button
												size="small"
												variant="quiet"
												onClick={() => {
													setPricing(holding);
													setNewPrice("");
												}}
											>
												{t("investments.newPrice")}
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</Panel>

					<Panel title={t("investments.byKind")}>
						<BarList
							items={KINDS.map((one) => ({
								key: one,
								label: t(`investments.kinds.${one}`),
								amount: list
									.filter((holding) => holding.kind === one)
									.reduce((sum, holding) => sum + holding.value, 0),
								value: new Intl.NumberFormat(locale, { style: "currency", currency }).format(
									list
										.filter((holding) => holding.kind === one)
										.reduce((sum, holding) => sum + holding.value, 0) / 100,
								),
								tone: "cedar" as const,
							})).filter((item) => item.amount > 0)}
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
						<p className="max-w-[60ch] text-sm text-quiet">{t("investments.againstBody")}</p>

						{rates.length === 0 ? (
							<Callout tone="attention" title={t("investments.noIndicesTitle")}>
								{t("investments.noIndicesBody")}
							</Callout>
						) : (
							<>
								<LineChart
									labels={rates.map((month) => month.month)}
									series={[
										{
											key: "cdi",
											label: "CDI",
											tone: "graphite",
											dotted: true,
											points: againstCdi,
										},
										{
											key: "mine",
											label: t("investments.yours"),
											tone: gain >= 0 ? "cedar" : "seal",
											// A straight line from what was put in to what it is worth, for
											// want of a value on every month: the prices that exist are the
											// ones that were typed in.
											points: rates.map((_month, index) =>
												Math.round(
													invested + ((value - invested) * (index + 1)) / Math.max(1, rates.length),
												),
											),
										},
									]}
									description={t("investments.chartDescription")}
									format={(value) =>
										new Intl.NumberFormat(locale, {
											style: "currency",
											currency,
											maximumFractionDigits: 0,
										}).format(value / 100)
									}
								/>
								<p className="text-xs text-quiet">
									{t("investments.chartLegend", {
										cdi: new Intl.NumberFormat(locale, { style: "currency", currency }).format(
											(againstCdi[againstCdi.length - 1] ?? invested) / 100,
										),
										yours: new Intl.NumberFormat(locale, { style: "currency", currency }).format(
											value / 100,
										),
									})}
								</p>
							</>
						)}

						{latest.data?.cdi ? (
							<p className="text-xs text-quiet">
								{t("investments.indicesAsOf", {
									month: latest.data.cdi.month,
									when: new Date(latest.data.cdi.fetchedAt).toLocaleDateString(locale),
								})}
							</p>
						) : null}
					</Panel>
				</>
			)}

			<section className="space-y-3 border-t border-line pt-5">
				<SectionTitle>{t("investments.simulator")}</SectionTitle>
				<p className="max-w-[60ch] text-sm text-quiet">{t("investments.simulatorBody")}</p>

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
					format={(value) =>
						new Intl.NumberFormat(locale, {
							style: "currency",
							currency,
							maximumFractionDigits: 0,
						}).format(value / 100)
					}
				/>

				<p className="text-sm text-quiet">
					{t("investments.simulatorResult", {
						years,
						total: new Intl.NumberFormat(locale, { style: "currency", currency }).format(
							(simulated[simulated.length - 1]?.total ?? 0) / 100,
						),
						earned: new Intl.NumberFormat(locale, { style: "currency", currency }).format(
							(simulated[simulated.length - 1]?.earned ?? 0) / 100,
						),
					})}
				</p>

				{value > 0 && monthlyExpense > 0 ? (
					<div className="space-y-1 border-t border-line pt-4">
						<p className="text-sm text-ink">
							{t("investments.covers", { count: independent.monthsCovered })}
						</p>
						<p className="text-sm text-quiet">
							{t("investments.independence", {
								target: new Intl.NumberFormat(locale, { style: "currency", currency }).format(
									independent.target / 100,
								),
								percent: independent.percent,
							})}
						</p>
						{independent.months === null ? (
							<p className="text-sm text-quiet">{t("investments.independenceNever")}</p>
						) : (
							<p className="text-sm text-quiet">
								{t("investments.independenceWhen", {
									years: Math.floor(independent.months / 12),
									months: independent.months % 12,
								})}
							</p>
						)}
					</div>
				) : null}
			</section>

			<Dialog
				open={isOpen}
				onOpenChange={setOpen}
				title={t("investments.add")}
				description={t("investments.addDescription")}
				closeLabel={t("actions.cancel")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setOpen(false)}>
							{t("actions.cancel")}
						</Button>
						<Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>
							{t("actions.save")}
						</Button>
					</>
				}
			>
				<form
					className="space-y-4"
					onSubmit={(event: FormEvent) => {
						event.preventDefault();
						create.mutate();
					}}
				>
					<Field
						label={t("investments.name")}
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder={t("investments.namePlaceholder")}
						required={true}
					/>
					<Select
						label={t("investments.kind")}
						value={kind}
						onChange={(event) => setKind(event.target.value as HoldingKind)}
						options={KINDS.map((one) => ({ value: one, label: t(`investments.kinds.${one}`) }))}
					/>
					<Select
						label={t("investments.account")}
						value={accountId}
						onChange={(event) => setAccountId(event.target.value)}
						options={(accounts.data ?? [])
							.filter((account) => account.archivedAt === null)
							.map((account) => ({ value: account.id, label: account.name }))}
						hint={t("investments.accountHint")}
					/>
					<Field
						label={t("investments.quantity")}
						value={quantity}
						onChange={(event) => setQuantity(event.target.value)}
						numeric={true}
					/>
					<Field
						label={t("investments.unitPrice")}
						value={unitPrice}
						onChange={(event) => setUnitPrice(event.target.value)}
						hint={t("fields.amountHint")}
						numeric={true}
					/>
					<Field
						label={t("investments.cost")}
						value={cost}
						onChange={(event) => setCost(event.target.value)}
						hint={t("investments.costHint")}
						numeric={true}
					/>
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</form>
			</Dialog>

			<Dialog
				open={pricing !== null}
				onOpenChange={(open) => {
					if (!open) setPricing(null);
				}}
				title={t("investments.newPriceFor", { name: pricing?.name ?? "" })}
				description={t("investments.newPriceDescription")}
				closeLabel={t("actions.cancel")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setPricing(null)}>
							{t("actions.cancel")}
						</Button>
						<Button variant="primary" onClick={() => price.mutate()} disabled={price.isPending}>
							{t("actions.save")}
						</Button>
					</>
				}
			>
				<form
					className="space-y-4"
					onSubmit={(event: FormEvent) => {
						event.preventDefault();
						price.mutate();
					}}
				>
					<Field
						label={t("investments.unitPrice")}
						value={newPrice}
						onChange={(event) => setNewPrice(event.target.value)}
						hint={t("fields.amountHint")}
						numeric={true}
						required={true}
					/>
				</form>
			</Dialog>
		</div>
	);
}
