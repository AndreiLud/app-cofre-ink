// The months ahead.
//
// The headline is the only thing most people come here for: does the money last. So it
// is the first line, in words, and the drawing under it is the same sentence as a
// shape. Everything below that is the arithmetic, laid out so that any month can be
// taken to pieces: what is already written, what repeats, and what is the habit.
//
// Trying something out happens here in the browser, with the same function the months
// were built with. Nothing is written, so a question costs nothing to ask.

import {
	type Adjustment,
	addMonthsToMonth,
	applyScenario,
	firstShortfall,
	monthOf,
	type ProjectedMonth,
	todayIn,
} from "@cofre/core";
import {
	Button,
	Callout,
	Dialog,
	EmptyState,
	Field,
	InsightTitle,
	LineChart,
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

const HORIZONS = [3, 6, 12, 24, 36];

/** The shape of an adjustment as the screen stores it, which is what the table takes. */
type SavedAdjustment = Adjustment & Record<string, unknown>;

export function ProjectionPage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace } = useCofre();
	const queries = useQueryClient();

	const spaceId = currentSpace?.id ?? "";
	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");
	const thisMonth = monthOf(today);

	const [months, setMonths] = useState(12);
	const [applied, setApplied] = useState<string | null>(null);
	const [isOpen, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [kind, setKind] = useState<"income" | "expense">("expense");
	const [percent, setPercent] = useState("10");
	const [amount, setAmount] = useState("");
	const [from, setFrom] = useState(thisMonth);
	const [problem, setProblem] = useState<string | null>(null);

	const locale = i18n.resolvedLanguage === "en" ? "en" : "pt-BR";
	const currency = currentSpace?.baseCurrency ?? "BRL";
	const money = (amount: number) =>
		new Intl.NumberFormat(locale, {
			style: "currency",
			currency,
			maximumFractionDigits: 0,
		}).format(amount / 100);

	const monthName = (value: string) =>
		new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
			new Date(`${value}-01T00:00:00Z`),
		);
	const shortMonth = (value: string) =>
		new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
			new Date(`${value}-01T00:00:00Z`),
		);

	const ahead = useQuery({
		queryKey: ["projection", spaceId, thisMonth, months],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.projections.monthsAhead({ spaceId, from: thisMonth, months }) ?? null,
	});

	const scenarios = useQuery({
		queryKey: ["scenarios", spaceId],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.scenarios.list(spaceId) ?? [],
	});

	const save = useMutation({
		mutationFn: async () => {
			if (!session) throw new Error("no session");

			const adjustment: SavedAdjustment = {
				kind,
				percent: percent.trim() === "" ? 0 : Math.round(Number(percent.replace(",", ".")) * 100),
				amount: amount.trim() === "" ? 0 : Math.round(Number(amount.replace(",", ".")) * 100),
				from,
			};

			return session.scenarios.create({
				spaceId,
				name: name.trim(),
				adjustments: [adjustment],
			});
		},
		onSuccess: async (scenario) => {
			setOpen(false);
			setName("");
			setProblem(null);
			await queries.invalidateQueries({ queryKey: ["scenarios", spaceId] });
			setApplied(scenario.id);
		},
		onError: (error: unknown) => setProblem(error instanceof Error ? error.message : String(error)),
	});

	const remove = useMutation({
		mutationFn: async (id: string) => {
			if (!session) throw new Error("no session");
			await session.scenarios.remove(id);
		},
		onSuccess: async () => {
			setApplied(null);
			await queries.invalidateQueries({ queryKey: ["scenarios", spaceId] });
		},
	});

	if (!currentSpace) return null;

	const base: ProjectedMonth[] = ahead.data?.months ?? [];
	const chosen = (scenarios.data ?? []).find((scenario) => scenario.id === applied) ?? null;

	const shown = chosen
		? applyScenario(
				base,
				{
					name: chosen.name,
					adjustments: chosen.adjustments as unknown as Adjustment[],
				},
				ahead.data?.opening ?? 0,
			)
		: base;

	const last = shown[shown.length - 1];
	const short = firstShortfall(shown);

	return (
		<div className="space-y-8">
			<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
				<InsightTitle
					level="h1"
					detail={
						base.length === 0
							? t("projection.nothingDetail")
							: t("projection.detail", {
									month: monthName(shown[0]?.month ?? thisMonth),
									income: new Intl.NumberFormat(locale, {
										style: "currency",
										currency,
									}).format((shown[0]?.income ?? 0) / 100),
									expense: new Intl.NumberFormat(locale, {
										style: "currency",
										currency,
									}).format((shown[0]?.expense ?? 0) / 100),
								})
					}
				>
					{base.length === 0
						? t("projection.nothingHeadline")
						: short
							? t("projection.headlineShort", { month: monthName(short) })
							: t("projection.headlineLasts", {
									month: monthName(last?.month ?? thisMonth),
									amount: new Intl.NumberFormat(locale, {
										style: "currency",
										currency,
									}).format((last?.balance ?? 0) / 100),
								})}
				</InsightTitle>

				<div className="flex flex-wrap items-end gap-3 print:hidden">
					<Select
						label={t("projection.horizon")}
						value={String(months)}
						onChange={(event) => setMonths(Number(event.target.value))}
						options={HORIZONS.map((value) => ({
							value: String(value),
							label: t("projection.monthsCount", { count: value }),
						}))}
					/>
					<Button size="small" variant="secondary" onClick={() => window.print()}>
						{t("reports.print")}
					</Button>
				</div>
			</div>

			{ahead.isPending ? <Skeleton lines={3} /> : null}

			{!ahead.isPending && base.length === 0 ? (
				<EmptyState
					icon="calendar"
					title={t("projection.emptyTitle")}
					description={t("projection.emptyBody")}
				/>
			) : null}

			{base.length === 0 ? null : (
				<>
					<section className="space-y-3">
						<LineChart
							labels={shown.map((month) => shortMonth(month.month))}
							series={[
								{
									key: "balance",
									label: t("projection.balance"),
									tone: short ? "seal" : "cedar",
									points: shown.map((month) => month.balance),
								},
								...(chosen
									? [
											{
												key: "base",
												label: t("projection.asItIs"),
												tone: "graphite" as const,
												dotted: true,
												points: base.map((month) => month.balance),
											},
										]
									: []),
							]}
							description={t("projection.chartDescription", { count: shown.length })}
							format={(value) =>
								new Intl.NumberFormat(locale, {
									style: "currency",
									currency,
									maximumFractionDigits: 0,
								}).format(value / 100)
							}
						/>
						<p className="text-xs text-graphite">
							{chosen
								? t("projection.chartLegendWith", { name: chosen.name })
								: t("projection.chartLegend")}
						</p>
					</section>

					<section className="space-y-3">
						<SectionTitle
							action={
								<Button size="small" variant="secondary" onClick={() => setOpen(true)}>
									{t("projection.addScenario")}
								</Button>
							}
						>
							{t("projection.scenarios")}
						</SectionTitle>

						<p className="max-w-[60ch] text-sm text-graphite">{t("projection.scenariosBody")}</p>

						<div className="flex flex-wrap gap-2">
							<Button
								size="small"
								variant={applied === null ? "primary" : "quiet"}
								onClick={() => setApplied(null)}
							>
								{t("projection.asItIs")}
							</Button>
							{(scenarios.data ?? []).map((scenario) => (
								<span key={scenario.id} className="flex items-center gap-1">
									<Button
										size="small"
										variant={applied === scenario.id ? "primary" : "quiet"}
										onClick={() => setApplied(scenario.id)}
									>
										{scenario.name}
									</Button>
									<Button
										size="small"
										variant="quiet"
										aria-label={t("projection.removeScenario", { name: scenario.name })}
										onClick={() => remove.mutate(scenario.id)}
									>
										×
									</Button>
								</span>
							))}
						</div>
					</section>

					<section className="space-y-3">
						<SectionTitle>{t("projection.monthByMonth")}</SectionTitle>
						<p className="max-w-[60ch] text-sm text-graphite">{t("projection.madeOf")}</p>

						<Table caption={t("projection.caption")}>
							<TableHead>
								<TableRow>
									<TableHeader>{t("reports.month")}</TableHeader>
									<TableHeader numeric={true}>{t("reports.income")}</TableHeader>
									<TableHeader numeric={true}>{t("reports.expense")}</TableHeader>
									<TableHeader numeric={true}>{t("reports.left")}</TableHeader>
									<TableHeader numeric={true}>{t("projection.balance")}</TableHeader>
									<TableHeader className="hidden sm:table-cell">
										{t("projection.madeOfShort")}
									</TableHeader>
								</TableRow>
							</TableHead>
							<TableBody>
								{shown.map((month) => (
									<TableRow key={month.month}>
										<TableCell className="whitespace-nowrap">{monthName(month.month)}</TableCell>
										<TableCell numeric={true}>
											<Value amount={month.income} currency={currency} tone="neutral" />
										</TableCell>
										<TableCell numeric={true}>
											<Value amount={month.expense} currency={currency} tone="neutral" />
										</TableCell>
										<TableCell numeric={true}>
											<Value amount={month.left} currency={currency} tone="auto" />
										</TableCell>
										<TableCell numeric={true}>
											<Value
												amount={month.balance}
												currency={currency}
												tone={month.balance < 0 ? "negative" : "neutral"}
											/>
										</TableCell>
										<TableCell className="hidden text-xs text-graphite sm:table-cell">
											{t("projection.parts", {
												written: money(month.expenseFrom.written),
												recurring: money(month.expenseFrom.recurring),
												habitual: money(month.expenseFrom.habitual),
											})}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</section>

					{ahead.data && ahead.data.history.length < 3 ? (
						<Callout tone="attention" title={t("projection.thinHistoryTitle")}>
							{t("projection.thinHistoryBody", { count: ahead.data.history.length })}
						</Callout>
					) : null}
				</>
			)}

			<Dialog
				open={isOpen}
				onOpenChange={setOpen}
				title={t("projection.addScenario")}
				description={t("projection.scenarioDescription")}
				closeLabel={t("actions.cancel")}
				footer={
					<>
						<Button variant="quiet" onClick={() => setOpen(false)}>
							{t("actions.cancel")}
						</Button>
						<Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
							{t("actions.save")}
						</Button>
					</>
				}
			>
				<form
					className="space-y-4"
					onSubmit={(event: FormEvent) => {
						event.preventDefault();
						save.mutate();
					}}
				>
					<Field
						label={t("projection.scenarioName")}
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder={t("projection.scenarioNamePlaceholder")}
						required={true}
					/>
					<Select
						label={t("projection.changeWhat")}
						value={kind}
						onChange={(event) => setKind(event.target.value as "income" | "expense")}
						options={[
							{ value: "expense", label: t("reports.expense") },
							{ value: "income", label: t("reports.income") },
						]}
					/>
					<Field
						label={t("projection.changePercent")}
						value={percent}
						onChange={(event) => setPercent(event.target.value)}
						hint={t("projection.changePercentHint")}
						numeric={true}
					/>
					<Field
						label={t("projection.changeAmount")}
						value={amount}
						onChange={(event) => setAmount(event.target.value)}
						hint={t("projection.changeAmountHint")}
						numeric={true}
					/>
					<Field
						label={t("projection.changeFrom")}
						type="month"
						value={from}
						onChange={(event) => setFrom(event.target.value)}
						min={thisMonth}
						max={addMonthsToMonth(thisMonth, 36)}
					/>
					{problem ? <Callout tone="problem">{problem}</Callout> : null}
				</form>
			</Dialog>
		</div>
	);
}
