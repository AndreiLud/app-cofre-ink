// What shape the money is in, what to do about it, and where the month goes.
//
// The overview shows the few heaviest things the figures said, because somebody looking
// at their balance wants their balance. This is the long version, in the order somebody
// would ask for it: what state am I in, what do I do, why, and where would the money
// come from.
//
// The plan is the point of the screen. A household told their reserve is thin already
// knew; what they do not know is how many months it takes, what it costs each one, and
// what has to wait while it happens. Every figure here is a division between two numbers
// that are on another screen too, and the screen says so at the bottom, along with the
// thing it will not do: there is no recommendation here about where to put money.

import { todayIn } from "@cofre/core";
import type { Finding, PlanStep, VitalSign } from "@cofre/storage";
import { Button, Callout, EmptyState, InsightTitle, Panel, Skeleton } from "@cofre/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { findingLine } from "../components/Findings.tsx";
import { ROUTES } from "../router.tsx";
import { useCofre } from "../storage/CofreProvider.tsx";

// How a sign is drawn. The state is always a word as well as a colour, so that the
// table reads the same to somebody who does not see the difference between these three.
const EDGE: Record<VitalSign["state"], string> = {
	good: "border-cedar",
	fair: "border-ochre",
	poor: "border-seal",
	unknown: "border-line",
};

const INK: Record<VitalSign["state"], string> = {
	good: "text-cedar",
	fair: "text-ochre",
	poor: "text-seal",
	unknown: "text-quiet",
};

/** The screen where each finding is actually dealt with. */
const WHERE: Partial<Record<Finding["code"], { to: string; label: string }>> = {
	spentMoreThanEarned: { to: ROUTES.transactions, label: "nav.allRecords" },
	categoryAboveUsual: { to: ROUTES.transactions, label: "nav.allRecords" },
	budgetPassed: { to: ROUTES.budget, label: "nav.budget" },
	budgetPace: { to: ROUTES.budget, label: "nav.budget" },
	subscriptionLoad: { to: ROUTES.transactions, label: "nav.allRecords" },
	subscriptionRose: { to: ROUTES.transactions, label: "nav.allRecords" },
	chargedTwice: { to: ROUTES.transactions, label: "nav.allRecords" },
	invoiceOverBalance: { to: ROUTES.invoices, label: "nav.invoices" },
	duesOverBalance: { to: ROUTES.calendar, label: "nav.calendar" },
	goalStalled: { to: ROUTES.budget, label: "nav.budget" },
};

/**
 * Two findings the plan above says better, with an order and a month on them.
 *
 * They stay on the overview, which has neither. Saying the same thing three times on one
 * screen is how a screen stops being read.
 */
const SAID_BY_THE_PLAN = new Set<Finding["code"]>(["thinReserve", "lowSavingRate"]);

/** Which of the four is worth putting a plural form on, and the number that drives it. */
const COUNTED: Partial<Record<VitalSign["code"], string>> = {
	committed: "count",
	repeatingLoad: "count",
};

export function AdvisorPage() {
	const { t, i18n } = useTranslation();
	const { session, currentSpace } = useCofre();

	const spaceId = currentSpace?.id ?? "";
	const today = todayIn(currentSpace?.timezone ?? "America/Sao_Paulo");
	const locale = i18n.resolvedLanguage === "en" ? "en" : "pt-BR";
	const currency = currentSpace?.baseCurrency ?? "BRL";

	const money = (amount: number) =>
		new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / 100);

	const monthName = (month: string) =>
		new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
			new Date(`${month}-01T00:00:00Z`),
		);

	const reading = useQuery({
		queryKey: ["reading", spaceId, today],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.advice.reading({ spaceId, today }) ?? null,
	});

	const found = (reading.data?.findings ?? []).filter(
		(finding) => !SAID_BY_THE_PLAN.has(finding.code),
	);
	const steps = reading.data?.plan.steps ?? [];
	const levers = reading.data?.levers.levers ?? [];
	const months = reading.data?.monthsRead ?? 0;

	/** The reading itself: a share in whole per cent, or months with one decimal. */
	const shownValue = (sign: VitalSign) => {
		if (sign.state === "unknown") return t("advisor.noReading");
		if (sign.code === "reserve") {
			const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
				sign.value / 10,
			);
			return t("advisor.monthsCovered", { count: Math.round(sign.value / 10), value });
		}
		return t("advisor.percent", { value: sign.value });
	};

	/** The sentence under it, with every figure it was made from. */
	const saidAbout = (sign: VitalSign) => {
		// A sign nobody can read yet carries zeros, and "you earn nothing and spend
		// nothing" is a worse thing to say than why it cannot be read.
		if (sign.state === "unknown") return t("advisor.needMonths");

		const values: Record<string, unknown> = {};
		for (const [name, amount] of Object.entries(sign.amounts)) {
			values[name] = name === "count" || name === "days" ? amount : money(amount);
		}

		const counted = COUNTED[sign.code];
		if (counted) {
			values.count = sign.amounts[counted] ?? 0;
			if (values.count === 0) return t(`advisor.said.${sign.code}None`, values);
		}
		return t(`advisor.said.${sign.code}`, values);
	};

	/** What a step costs, how long it takes and when it lands. */
	const saidAboutStep = (step: PlanStep) => {
		// A step with no months is a step with nothing funding it. Saying "at nothing a
		// month, nought months" is arithmetic that has stopped meaning anything.
		const undated = step.months === 0 && step.code !== "coverDues" && step.code !== "freeUpMonthly";
		if (undated) return t("step.said.undated", { amount: money(step.amount) });

		return t(`step.said.${step.code}`, {
			count: step.months,
			amount: money(step.amount),
			everyMonth: money(step.everyMonth),
		});
	};

	return (
		<div className="space-y-8">
			<InsightTitle
				level="h1"
				detail={
					reading.isPending ? undefined : t(`advisor.detail.${reading.data?.verdict ?? "tooSoon"}`)
				}
			>
				{reading.isPending
					? t("advisor.reading")
					: t(`advisor.verdict.${reading.data?.verdict ?? "tooSoon"}`)}
			</InsightTitle>

			{reading.isPending ? <Skeleton lines={5} /> : null}

			{reading.data ? (
				<>
					{steps.length > 0 ? (
						<Panel
							title={t("advisor.planTitle")}
							description={
								reading.data.plan.stuck
									? t("advisor.planStuckBody")
									: t("advisor.planBody", { surplus: money(reading.data.plan.surplus) })
							}
						>
							{/* Every date below is made of one number. If that number is not
							    there, saying "eighteen months" would be arithmetic over a
							    thing that does not exist. */}
							{reading.data.plan.stuck ? (
								<Callout tone="attention" className="mb-4" title={t("advisor.stuckTitle")}>
									{t("advisor.stuckBody")}
								</Callout>
							) : null}

							<ol className="divide-y divide-line">
								{steps.map((step, index) => (
									<li
										key={`${step.code}${step.subject ?? ""}`}
										className="flex gap-3 py-4 first:pt-0 last:pb-0"
									>
										<span className="font-mono text-sm text-quiet">{index + 1}</span>
										<div className="min-w-0 flex-1 space-y-1">
											<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
												<h3 className="font-medium text-ink">
													{step.subject ?? t(`step.${step.code}`)}
												</h3>
												{step.finishesOn ? (
													<span className="text-sm text-quiet">
														{t("advisor.until", { month: monthName(step.finishesOn) })}
													</span>
												) : null}
											</div>
											<p className="text-sm leading-relaxed text-quiet">{saidAboutStep(step)}</p>
											{step.late ? <p className="text-sm text-seal">{t("advisor.late")}</p> : null}
										</div>
									</li>
								))}
							</ol>

							{reading.data.plan.doneOn ? (
								<p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-ink">
									{t("advisor.planDone", { month: monthName(reading.data.plan.doneOn) })}
								</p>
							) : null}
						</Panel>
					) : null}

					<Panel title={t("advisor.signsTitle")} description={t("advisor.signsBody")}>
						<div className="grid gap-4 sm:grid-cols-2">
							{reading.data.signs.map((sign) => (
								<section key={sign.code} className={`border-l-2 pl-4 ${EDGE[sign.state]}`}>
									<div className="flex flex-wrap items-baseline justify-between gap-2">
										<h3 className="font-medium text-ink">{t(`sign.${sign.code}`)}</h3>
										<span className={`text-xs ${INK[sign.state]}`}>
											{t(`signState.${sign.state}`)}
										</span>
									</div>
									<p className="mt-1 font-mono text-2xl text-ink">{shownValue(sign)}</p>
									<p className="text-xs text-quiet">{t(`signTarget.${sign.code}`)}</p>
									<p className="mt-2 text-sm leading-relaxed text-quiet">{saidAbout(sign)}</p>
								</section>
							))}
						</div>
					</Panel>

					{levers.length > 0 ? (
						<Panel
							title={t("advisor.leversTitle")}
							description={t("advisor.leversBody", { count: levers.length })}
						>
							<ul className="divide-y divide-line">
								{levers.map((lever) => (
									<li key={lever.name} className="py-3 first:pt-0 last:pb-0">
										<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
											<span className="font-medium text-ink">{lever.name}</span>
											<span className="font-mono text-sm text-ink">
												{money(lever.usual)}
												<span className="ml-2 text-quiet">
													{t("advisor.ofIncome", { value: lever.shareOfIncome })}
												</span>
											</span>
										</div>
										<p className="mt-1 text-sm leading-relaxed text-quiet">
											{lever.frees > 0
												? t("advisor.cheapestMonth", {
														best: money(lever.best),
														frees: money(lever.frees),
													})
												: t("advisor.sameEveryMonth")}
										</p>
									</li>
								))}
							</ul>

							{reading.data.levers.frees > 0 ? (
								<p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-ink">
									{t("advisor.leversTotal", { frees: money(reading.data.levers.frees) })}
								</p>
							) : null}
						</Panel>
					) : null}

					{found.length > 0 ? (
						<Panel title={t("advisor.allTitle")} description={t("advisor.allBody")}>
							<ul className="space-y-4">
								{found.map((finding) => {
									const where = WHERE[finding.code];
									return (
										<li
											key={`${finding.code}${finding.subject ?? ""}`}
											className={`border-l-2 pl-3 ${
												finding.weight === "problem"
													? "border-seal"
													: finding.weight === "attention"
														? "border-ochre"
														: "border-line"
											}`}
										>
											<p
												className={`text-sm leading-relaxed ${
													finding.weight === "good" ? "text-quiet" : "text-ink"
												}`}
											>
												{findingLine(finding, money, t, i18n.resolvedLanguage ?? "pt")}
											</p>
											{where ? (
												<Link to={where.to} className="mt-2 inline-block">
													<Button size="small" variant="secondary">
														{t("advisor.goTo", { screen: t(where.label) })}
													</Button>
												</Link>
											) : null}
										</li>
									);
								})}
							</ul>
						</Panel>
					) : (
						/* Finding nothing in three months of records is good news. Finding
						   nothing in a fortnight of them is not news at all, and saying
						   "nothing is out of place" to somebody who has written down two
						   things would be the screen believing its own silence. */
						<EmptyState
							icon="chart"
							title={t(
								reading.data.verdict === "tooSoon"
									? "advisor.nothingYetTitle"
									: "advisor.nothingTitle",
							)}
							description={t(
								reading.data.verdict === "tooSoon"
									? "advisor.nothingYetBody"
									: "advisor.nothingBody",
							)}
						/>
					)}

					{/* Said on the screen and not only in a document, because a number about
					    somebody's money that does not say where it came from is a number they
					    are being asked to take on faith. */}
					<section className="space-y-2 border-t border-line pt-5">
						<h2 className="font-medium text-ink text-sm">{t("advisor.howTitle")}</h2>
						<p className="max-w-[70ch] text-sm leading-relaxed text-quiet">
							{t("advisor.how", { count: months })}
						</p>
						{/* Only where there is a plan, because it explains the order of one. */}
						{steps.length > 0 ? (
							<p className="max-w-[70ch] text-sm leading-relaxed text-quiet">
								{t("advisor.assumes")}
							</p>
						) : null}
						<p className="max-w-[70ch] text-sm leading-relaxed text-quiet">
							{t("advisor.notAdvice")}
						</p>
					</section>
				</>
			) : null}
		</div>
	);
}
