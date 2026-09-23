// What shape the money is in, read out of the records and nothing else.
//
// The overview shows the three heaviest things it found, because somebody looking at
// their balance wants their balance. This is the long version: one sentence for the
// state of things, the four signs it comes from with the line drawn where it is drawn,
// what to do first, and then everything the figures had to say.
//
// Every number on this screen is a division between two figures that are on another
// screen too, and the screen says so at the bottom along with the thing it will not do:
// there is no recommendation here about where to put money. Reading arithmetic out loud
// is a different job from advising somebody on investments, and this one only does the
// first.

import { todayIn } from "@cofre/core";
import type { Finding, VitalSign } from "@cofre/storage";
import { Button, EmptyState, InsightTitle, Panel, Skeleton } from "@cofre/ui";
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
	thinReserve: { to: ROUTES.budget, label: "nav.budget" },
	lowSavingRate: { to: ROUTES.budget, label: "nav.budget" },
	invoiceOverBalance: { to: ROUTES.invoices, label: "nav.invoices" },
	duesOverBalance: { to: ROUTES.calendar, label: "nav.calendar" },
	goalStalled: { to: ROUTES.budget, label: "nav.budget" },
};

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

	const reading = useQuery({
		queryKey: ["reading", spaceId, today],
		enabled: Boolean(session && spaceId !== ""),
		queryFn: () => session?.advice.reading({ spaceId, today }) ?? null,
	});

	const found = reading.data?.findings ?? [];
	const first = found.filter((finding) => finding.weight !== "good").slice(0, 3);
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

					{first.length > 0 ? (
						<Panel
							title={t("advisor.firstTitle")}
							description={t("advisor.firstBody", { count: first.length })}
						>
							<ol className="space-y-4">
								{first.map((finding, index) => {
									const where = WHERE[finding.code];
									return (
										<li
											key={`${finding.code}${finding.subject ?? ""}`}
											className="flex gap-3 border-b border-line pb-4 last:border-0 last:pb-0"
										>
											<span className="font-mono text-sm text-quiet">{index + 1}</span>
											<div className="min-w-0 space-y-2">
												<p className="text-sm leading-relaxed text-ink">
													{findingLine(finding, money, t, i18n.resolvedLanguage ?? "pt")}
												</p>
												{where ? (
													<Link to={where.to}>
														<Button size="small" variant="secondary">
															{t("advisor.goTo", { screen: t(where.label) })}
														</Button>
													</Link>
												) : null}
											</div>
										</li>
									);
								})}
							</ol>
						</Panel>
					) : null}

					{found.length > 0 ? (
						<Panel title={t("advisor.allTitle")} description={t("advisor.allBody")}>
							<ul className="space-y-3">
								{found.map((finding) => (
									<li
										key={`${finding.code}${finding.subject ?? ""}`}
										className={`border-l-2 pl-3 text-sm leading-relaxed ${
											finding.weight === "problem"
												? "border-seal text-ink"
												: finding.weight === "attention"
													? "border-ochre text-ink"
													: "border-line text-quiet"
										}`}
									>
										{findingLine(finding, money, t, i18n.resolvedLanguage ?? "pt")}
									</li>
								))}
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
						<p className="max-w-[70ch] text-sm leading-relaxed text-quiet">
							{t("advisor.notAdvice")}
						</p>
					</section>
				</>
			) : null}
		</div>
	);
}
