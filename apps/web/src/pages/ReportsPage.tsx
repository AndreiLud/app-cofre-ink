// What the money did.
//
// Every picture on this screen opens with a sentence that states the finding, never
// with the name of an axis, and every picture has a table beside it holding the same
// numbers. The drawing is for the shape, the table is for the answer, and somebody
// reading with a screen reader gets the answer rather than a description of a drawing.

import { addMonthsToMonth, balanceFlow, monthOf, todayIn } from "@cofre/core";
import {
	BarList,
	Button,
	ColumnChart,
	EmptyState,
	FlowChart,
	HeatMap,
	InsightTitle,
	Panel,
	Segmented,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@cofre/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Value } from "../components/Value.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

const PRIORITY_TONE: Record<string, "ink" | "cedar" | "seal" | "ochre" | "amber"> = {
	essential: "ink",
	important: "cedar",
	desirable: "amber",
	superfluous: "seal",
};

function daysInMonth(month: string): number {
	const [year, index] = month.split("-").map(Number);
	return new Date(Date.UTC(year ?? 2026, index ?? 1, 0)).getUTCDate();
}

function firstWeekdayOf(month: string): number {
	const [year, index] = month.split("-").map(Number);
	return new Date(Date.UTC(year ?? 2026, (index ?? 1) - 1, 1)).getUTCDay();
}

export function ReportsPage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace, spaces } = useCofre();

	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");
	const [month, setMonth] = useState(monthOf(today));
	const [across, setAcross] = useState<"space" | "everything">("space");

	const locale = i18n.resolvedLanguage === "en" ? "en" : "pt-BR";
	const currency = currentSpace?.baseCurrency ?? "BRL";
	const money = (amount: number) =>
		new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / 100);

	const spaceId = across === "space" ? currentSpace?.id : undefined;
	const range = {
		spaceId,
		from: `${month}-01`,
		to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}`,
	};
	const key = [across, spaceId ?? "all", month];

	const enabled = Boolean(session && currentSpace);

	const totals = useQuery({
		queryKey: ["reports", "totals", ...key],
		enabled,
		queryFn: () => session?.reports.totals(range) ?? { income: 0, expense: 0, left: 0 },
	});
	const byCategory = useQuery({
		queryKey: ["reports", "byCategory", ...key],
		enabled,
		queryFn: () => session?.reports.byCategory(range) ?? [],
	});
	const incomeByCategory = useQuery({
		queryKey: ["reports", "incomeByCategory", ...key],
		enabled,
		queryFn: () => session?.reports.incomeByCategory(range) ?? [],
	});
	const byPriority = useQuery({
		queryKey: ["reports", "byPriority", ...key],
		enabled,
		queryFn: () => session?.reports.byPriority(range) ?? [],
	});
	const byDay = useQuery({
		queryKey: ["reports", "byDay", ...key],
		enabled,
		queryFn: () => session?.reports.byDay(range) ?? [],
	});
	const byMonth = useQuery({
		queryKey: ["reports", "byMonth", across, spaceId ?? "all", month],
		enabled,
		queryFn: () =>
			session?.reports.byMonth({
				spaceId,
				from: `${addMonthsToMonth(month, -11)}-01`,
				to: range.to,
			}) ?? [],
	});

	if (!currentSpace) return null;

	const monthName = (value: string) =>
		new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(
			new Date(`${value}-01T00:00:00Z`),
		);
	const shortMonth = (value: string) =>
		new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
			new Date(`${value}-01T00:00:00Z`),
		);

	// The repository hands these back biggest first, which is the order both the
	// drawing and the table want.
	const spending = byCategory.data ?? [];
	const income = incomeByCategory.data ?? [];
	const nothing = spending.length === 0 && income.length === 0;

	// The two sides of the picture, balanced so that nothing is quietly lost.
	const flow = balanceFlow(
		income.map((one) => ({
			key: one.categoryId ?? "noCategoryIncome",
			label: one.name ?? t("reports.noCategory"),
			amount: one.total,
		})),
		spending.map((one) => ({
			key: one.categoryId ?? "noCategory",
			label: one.name ?? t("reports.noCategory"),
			amount: one.total,
		})),
	);

	const named = (item: { key: string; label: string; amount: number }) => ({
		...item,
		label:
			item.key === "leftOver"
				? t("reports.leftOver")
				: item.key === "fromReserves"
					? t("reports.fromReserves")
					: item.label,
	});

	const period = totals.data ?? { income: 0, expense: 0, left: 0 };
	const biggest = spending[0];

	return (
		<div className="space-y-10">
			{/* On paper the header of the application is gone, so the page says for itself
			    which space and which month it is about. */}
			<p className="hidden text-sm text-quiet print:block">
				{t("reports.printedFor", {
					space: across === "space" ? currentSpace.name : t("reports.everySpace"),
					month: monthName(month),
					year: month.slice(0, 4),
				})}
			</p>

			<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
				<InsightTitle
					level="h1"
					detail={
						nothing
							? t("reports.nothingDetail")
							: t("reports.detail", {
									income: money(period.income),
									expense: money(period.expense),
								})
					}
				>
					{nothing
						? t("reports.nothingHeadline", { month: monthName(month) })
						: period.left >= 0
							? t("reports.headlineLeft", { month: monthName(month), amount: money(period.left) })
							: t("reports.headlineShort", {
									month: monthName(month),
									amount: money(Math.abs(period.left)),
								})}
				</InsightTitle>

				<div className="flex flex-wrap items-end gap-3 print:hidden">
					<label className="flex flex-col gap-1.5 text-sm">
						<span className="font-medium text-ink">{t("reports.month")}</span>
						{/* The same shape every other control in the product has: sunken, with
						    the strong edge. It used to be shorter, lighter and drawn with the
						    line that separates table rows, which is the one thing the design
						    says never to enclose a control with. */}
						<input
							type="month"
							value={month}
							onChange={(event) => setMonth(event.target.value)}
							className="h-11 rounded-sm border border-lineStrong bg-sunken px-3 text-base text-ink transition-colors duration-150 focus:border-accent focus:bg-panel"
						/>
					</label>
					{spaces.length > 1 ? (
						<Segmented
							label={t("reports.across")}
							value={across}
							onChange={setAcross}
							options={[
								{ value: "space", label: t("reports.thisSpace") },
								{ value: "everything", label: t("reports.everySpace") },
							]}
						/>
					) : null}
					<Button size="small" variant="secondary" onClick={() => window.print()}>
						{t("reports.print")}
					</Button>
				</div>
			</div>

			{totals.isPending ? <Skeleton lines={3} /> : null}

			{!totals.isPending && nothing ? (
				<EmptyState
					icon="wallet"
					title={t("reports.emptyTitle")}
					description={t("reports.emptyBody")}
				/>
			) : null}

			{nothing ? null : (
				<>
					<Panel title={t("reports.flowTitle")}>
						<div className="hidden md:block">
							<FlowChart
								sources={flow.sources.map(named)}
								destinations={flow.destinations.map(named)}
								description={t("reports.flowDescription", {
									income: money(period.income),
									expense: money(period.expense),
								})}
								format={money}
							/>
						</div>

						{/* On a narrow screen the ribbons are unreadable, so the same two sides
						    are two lists, which is what the drawing was standing in for. */}
						<div className="grid gap-6 md:hidden">
							<div className="space-y-2">
								<p className="text-sm font-medium text-ink">{t("reports.cameIn")}</p>
								<BarList
									items={flow.sources.map(named).map((one) => ({
										key: one.key,
										label: one.label,
										value: money(one.amount),
										amount: one.amount,
										tone: "cedar" as const,
									}))}
								/>
							</div>
							<div className="space-y-2">
								<p className="text-sm font-medium text-ink">{t("reports.wentOut")}</p>
								<BarList
									items={flow.destinations.map(named).map((one) => ({
										key: one.key,
										label: one.label,
										value: money(one.amount),
										amount: one.amount,
										tone: one.key === "leftOver" ? ("cedar" as const) : ("seal" as const),
									}))}
								/>
							</div>
						</div>
					</Panel>

					<Panel title={t("reports.categoryTitle")}>
						{biggest ? (
							<p className="text-sm text-quiet">
								{t("reports.biggest", {
									name: biggest.name ?? t("reports.noCategory"),
									amount: money(biggest.total),
									share: Math.round((biggest.total / Math.max(1, period.expense)) * 100),
								})}
							</p>
						) : null}

						<Table caption={t("reports.categoryCaption", { month: monthName(month) })}>
							<TableHead>
								<TableRow>
									<TableHeader>{t("reports.category")}</TableHeader>
									<TableHeader>{t("reports.inside")}</TableHeader>
									<TableHeader numeric={true}>{t("reports.amount")}</TableHeader>
									<TableHeader numeric={true}>{t("reports.share")}</TableHeader>
								</TableRow>
							</TableHead>
							<TableBody>
								{spending.map((one) => (
									<TableRow key={one.categoryId ?? "none"}>
										<TableCell>{one.name ?? t("reports.noCategory")}</TableCell>
										<TableCell className="text-quiet">{one.parentName ?? ""}</TableCell>
										<TableCell numeric={true}>
											<Value amount={one.total} currency={currency} tone="neutral" />
										</TableCell>
										<TableCell numeric={true} className="text-quiet">
											{Math.round((one.total / Math.max(1, period.expense)) * 100)}%
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</Panel>

					<Panel title={t("reports.priorityTitle")}>
						<BarList
							items={(byPriority.data ?? []).map((one) => ({
								key: one.priority ?? "none",
								label: one.priority ? t(`priority.${one.priority}`) : t("reports.noPriority"),
								value: money(one.total),
								amount: one.total,
								tone: PRIORITY_TONE[one.priority ?? ""] ?? "ochre",
							}))}
						/>
						<p className="text-sm text-quiet">
							{t("reports.priorityDetail", {
								share: Math.round(
									((byPriority.data ?? [])
										.filter((one) => one.priority === "superfluous" || one.priority === "desirable")
										.reduce((sum, one) => sum + one.total, 0) /
										Math.max(1, period.expense)) *
										100,
								),
							})}
						</p>
					</Panel>

					<Panel title={t("reports.daysTitle")}>
						<HeatMap
							days={(byDay.data ?? []).map((one) => ({
								day: Number(one.day.slice(8)),
								amount: one.total,
							}))}
							daysInMonth={daysInMonth(month)}
							firstWeekday={firstWeekdayOf(month)}
							description={t("reports.daysDescription", { month: monthName(month) })}
							format={money}
						/>
					</Panel>

					<Panel title={t("reports.monthsTitle")}>
						<ColumnChart
							groups={(byMonth.data ?? []).map((one) => ({
								key: one.month,
								label: shortMonth(one.month),
								income: one.income,
								expense: one.expense,
							}))}
							description={t("reports.monthsDescription")}
						/>
						<p className="flex flex-wrap gap-4 text-xs text-quiet">
							<span className="flex items-center gap-2">
								<span className="inline-block size-3 bg-cedar" />
								{t("reports.income")}
							</span>
							<span className="flex items-center gap-2">
								<span className="inline-block size-3 bg-seal" />
								{t("reports.expense")}
							</span>
						</p>

						<Table caption={t("reports.monthsCaption")}>
							<TableHead>
								<TableRow>
									<TableHeader>{t("reports.month")}</TableHeader>
									<TableHeader numeric={true}>{t("reports.income")}</TableHeader>
									<TableHeader numeric={true}>{t("reports.expense")}</TableHeader>
									<TableHeader numeric={true}>{t("reports.left")}</TableHeader>
								</TableRow>
							</TableHead>
							<TableBody>
								{[...(byMonth.data ?? [])].reverse().map((one) => (
									<TableRow key={one.month}>
										<TableCell>{monthName(one.month)}</TableCell>
										<TableCell numeric={true}>
											<Value amount={one.income} currency={currency} tone="neutral" />
										</TableCell>
										<TableCell numeric={true}>
											<Value amount={one.expense} currency={currency} tone="neutral" />
										</TableCell>
										<TableCell numeric={true}>
											<Value amount={one.income - one.expense} currency={currency} tone="auto" />
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</Panel>
				</>
			)}
		</div>
	);
}
