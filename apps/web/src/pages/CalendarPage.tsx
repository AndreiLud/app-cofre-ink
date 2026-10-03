// The month as it will actually happen.
//
// A list answers "what did I spend". A calendar answers a different question: where the
// heavy days are, and whether the week the rent falls due is the week the card closes.
// Every record is here, what happened and what is still to come, and the ones still to
// come are set apart because their day has not arrived.

import { addMonthsToMonth, addUpInBase, monthOf, todayIn } from "@cofre/core";
import { hasHappened, type Transaction } from "@cofre/storage";
import { Button, InsightTitle, Skeleton } from "@cofre/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Value } from "../components/Value.tsx";
import { useMonthInAddress } from "../lib/monthAddress.ts";
import { ROUTES } from "../routes.ts";
import { useCofre } from "../storage/CofreProvider.tsx";

/** Monday first, which is how a month is read in Brazil and in most of Europe. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function daysOfMonth(month: string): string[] {
	const [year, index] = month.split("-").map(Number);
	const last = new Date(Date.UTC(year ?? 2026, index ?? 1, 0)).getUTCDate();
	return Array.from(
		{ length: last },
		(_unused, day) => `${month}-${String(day + 1).padStart(2, "0")}`,
	);
}

function weekdayOf(date: string): number {
	const [year, month, day] = date.split("-").map(Number);
	return new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

export function CalendarPage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace } = useCofre();

	const spaceId = currentSpace?.id ?? "";
	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");
	// The month is in the address, so a reload and the back button keep it.
	const asked = useSearch({ from: ROUTES.calendar });
	const navigate = useNavigate();
	const [month, setMonth] = useMonthInAddress(
		asked.mes ?? monthOf(today),
		(next) =>
			void navigate({
				to: ROUTES.calendar,
				search: { mes: next === monthOf(today) ? undefined : next },
			}),
	);

	// What the series owe is written by the shell, for every space, whichever screen is open:
	// storage/useSeriesWriter.ts. This screen used to be the only one that wrote it.

	const period = useMemo(() => {
		const days = daysOfMonth(month);
		return { from: days[0] ?? `${month}-01`, to: days[days.length - 1] ?? `${month}-28` };
	}, [month]);

	const records = useQuery({
		queryKey: ["transactions", spaceId, "calendar", month],
		enabled: Boolean(session && currentSpace),
		queryFn: () =>
			session?.transactions.list({ spaceId, from: period.from, to: period.to, limit: 500 }) ?? [],
	});

	if (!currentSpace) return null;

	const rows = records.data ?? [];
	const byDay = new Map<string, Transaction[]>();
	for (const row of rows) {
		byDay.set(row.happenedOn, [...(byDay.get(row.happenedOn) ?? []), row]);
	}

	const days = daysOfMonth(month);
	const first = days[0] ?? `${month}-01`;
	const blanks = WEEKDAY_ORDER.indexOf(weekdayOf(first));

	// Every one of these is labelled with the currency of the space, so every one of them
	// is added up in it. They read the amount as written, and a record in another currency
	// went into the month as though its minor units were the space's own.
	const spent = addUpInBase(rows.filter((row) => row.kind === "expense"));
	const earned = addUpInBase(rows.filter((row) => row.kind === "income"));
	// Still to come is whatever has not happened by today, by the same rule every balance
	// follows: a record dated ahead is written as a fact and waits for its day.
	const stillPlanned = addUpInBase(rows.filter((row) => !hasHappened(row, today)));

	const monthName = new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
		month: "long",
		year: month.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
		timeZone: "UTC",
	}).format(new Date(`${month}-01T00:00:00Z`));

	const weekdayName = new Intl.DateTimeFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
		weekday: "short",
		timeZone: "UTC",
	});

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<InsightTitle
					level="h1"
					detail={
						stillPlanned === 0
							? t("calendar.nothingPending")
							: t("calendar.stillToCome", {
									amount: new Intl.NumberFormat(i18n.resolvedLanguage === "en" ? "en" : "pt-BR", {
										style: "currency",
										currency: currentSpace.baseCurrency,
									}).format(Math.abs(stillPlanned) / 100),
								})
					}
				>
					{t("calendar.headline", { month: monthName })}
				</InsightTitle>

				<div className="flex items-center gap-1">
					<Button
						size="small"
						variant="secondary"
						onClick={() => setMonth(addMonthsToMonth(month, -1))}
						aria-label={t("calendar.previous")}
					>
						{t("invoice.previousShort")}
					</Button>
					<Button
						size="small"
						variant="secondary"
						onClick={() => setMonth(monthOf(today))}
						aria-label={t("calendar.thisMonth")}
					>
						{t("calendar.thisMonthShort")}
					</Button>
					<Button
						size="small"
						variant="secondary"
						onClick={() => setMonth(addMonthsToMonth(month, 1))}
						aria-label={t("calendar.next")}
					>
						{t("invoice.nextShort")}
					</Button>
				</div>
			</div>

			<div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
				<span className="text-quiet">
					{t("calendar.earned")}{" "}
					<Value amount={earned} currency={currentSpace.baseCurrency} tone="auto" />
				</span>
				<span className="text-quiet">
					{t("calendar.spent")}{" "}
					<Value amount={spent} currency={currentSpace.baseCurrency} tone="auto" />
				</span>
			</div>

			{records.isPending ? <Skeleton lines={6} /> : null}

			{!records.isPending ? (
				<div className="overflow-x-auto">
					{/* A month needs a width of its own to stay a month. Below it the grid
					    scrolls inside its box rather than pushing the whole page sideways. */}
					<div className="grid min-w-[34rem] grid-cols-7 gap-px border border-line bg-line">
						{WEEKDAY_ORDER.map((weekday) => (
							<div key={weekday} className="bg-canvas px-2 py-1 text-xs text-quiet">
								{weekdayName.format(new Date(Date.UTC(2026, 1, 1 + weekday)))}
							</div>
						))}

						{/* The days of the week before the first of the month, left empty. */}
						{Array.from({ length: blanks }, (_unused, index) => WEEKDAY_ORDER[index]).map(
							(weekday) => (
								<div key={`blank${weekday}`} className="min-h-24 bg-canvas" />
							),
						)}

						{days.map((day) => {
							const entries = byDay.get(day) ?? [];
							const total = addUpInBase(entries);
							return (
								<div
									key={day}
									className={`min-h-24 space-y-1 bg-canvas p-2 ${
										day === today ? "outline outline-2 outline-ink" : ""
									}`}
								>
									<p className={`font-mono text-xs ${day === today ? "text-ink" : "text-quiet"}`}>
										{day.slice(8)}
									</p>
									{entries.slice(0, 3).map((row) => (
										<p
											key={row.id}
											className={`truncate text-xs ${
												hasHappened(row, today) ? "text-ink" : "text-ochre"
											}`}
											title={row.description}
										>
											{row.description}
										</p>
									))}
									{entries.length > 3 ? (
										<p className="text-xs text-quiet">
											{t("calendar.andMore", { count: entries.length - 3 })}
										</p>
									) : null}
									{total !== 0 ? (
										<p className="pt-1 text-xs">
											<Value
												amount={total}
												currency={currentSpace.baseCurrency}
												tone="auto"
												withoutSymbol={true}
											/>
										</p>
									) : null}
								</div>
							);
						})}
					</div>
				</div>
			) : null}

			<p className="text-xs text-quiet">{t("calendar.plannedLegend")}</p>

			{/* The series have a screen of their own now; this is the way there from the month
			    they are drawn on. */}
			<p className="text-sm">
				<Link to={ROUTES.recurring} className="text-ink underline underline-offset-2">
					{t("recurrences.calendarLink")}
				</Link>
			</p>
		</div>
	);
}
