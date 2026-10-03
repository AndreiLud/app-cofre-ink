// What the figures have to say, in a sentence somebody can act on.
//
// The arithmetic is in `packages/core` and carries no words. This turns a finding into
// one line: what was found, the numbers it was found from, and what to do about it. The
// numbers are always in the sentence, because a line that says "you are spending too
// much" and nothing else is a line nobody believes.

import type { Finding } from "@cofre/storage";
import { useTranslation } from "react-i18next";

const EDGE: Record<Finding["weight"], string> = {
	problem: "border-seal",
	attention: "border-ochre",
	good: "border-line",
};

/** Plural forms are driven by this one number, when a finding has one. */
const COUNTED: Partial<Record<Finding["code"], string>> = {
	chargedTwice: "days",
	invoiceOverBalance: "days",
	duesOverBalance: "count",
	goalStalled: "days",
	subscriptionLoad: "count",
};

/** The figures that are not money: a share, a count, a number of days, a yes or a no. */
const NOT_MONEY = new Set([
	"percent",
	"count",
	"days",
	"months",
	"late",
	"subjectIsInvoice",
	"namingIsLate",
]);

/**
 * The sentence, which for what falls due is two: what falls due, and the money against it.
 *
 * The money is what the accounts hold and never "Você tem", which on the overview counts what
 * is invested too. An invoice is called "a fatura do cartão" and its card; the figures carry
 * only numbers, so a finding says that its subject is an invoice and the name is made here.
 */
export function findingLine(
	finding: Finding,
	money: (value: number) => string,
	t: (key: string, values?: Record<string, unknown>) => string,
	language: string,
): string {
	const values: Record<string, unknown> = { subject: finding.subject ?? "" };

	for (const [name, amount] of Object.entries(finding.amounts)) {
		// A percentage and a count of days are numbers. Everything else is money, which
		// is the only reason this file knows about currency at all.
		values[name] = NOT_MONEY.has(name) ? amount : money(amount);
	}

	if (finding.code === "invoiceOverBalance" || finding.code === "duesOverBalance") {
		const held = finding.amounts.money ?? 0;
		const end =
			held < 0
				? t("finding.endNegative", { money: money(-held), short: values.short })
				: t("finding.end", { money: values.money, short: values.short });
		if (finding.code === "invoiceOverBalance") {
			const start =
				finding.amounts.late === 1
					? t("finding.invoiceOverBalanceLate", values)
					: t("finding.invoiceOverBalance", { ...values, count: finding.amounts.days ?? 0 });
			return `${start} ${end}`;
		}
		const named =
			finding.amounts.subjectIsInvoice === 1
				? t("finding.theInvoiceOf", { card: finding.subject ?? "" })
				: (finding.subject ?? "");
		const start = t(
			finding.amounts.namingIsLate === 1
				? "finding.duesOverBalanceLate"
				: "finding.duesOverBalance",
			{ ...values, subject: named, count: finding.amounts.count ?? 0 },
		);
		return `${start} ${end}`;
	}

	// The holdings that come out the same day, named after the reserve and never in it.
	const aside =
		typeof finding.amounts.availableAnyDay === "number"
			? ` ${t("finding.availableAnyDay", { amount: values.availableAnyDay })}`
			: "";
	if (finding.code === "thinReserve") {
		const key =
			(finding.amounts.cards ?? 0) > 0 ? "finding.thinReserve" : "finding.thinReserveNoCards";
		return `${t(key, withCovers(values, finding, language))}${aside}`;
	}
	if (finding.code === "cardsOverAccounts") {
		return `${t("finding.cardsOverAccounts", values)}${aside}`;
	}

	// Inflation is the one figure here kept in hundredths of a per cent, because a year
	// of it rounded to a whole number stops being the number that was published.
	if (typeof finding.amounts.inflation === "number") {
		values.inflation = new Intl.NumberFormat(language === "en" ? "en" : "pt-BR", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(finding.amounts.inflation / 100);
	}

	Object.assign(values, withCovers(values, finding, language));

	const counted = COUNTED[finding.code];
	if (counted) values.count = finding.amounts[counted] ?? 0;

	// Money standing still costs something, and how much depends on a number nobody may
	// have fetched yet. The sentence that names it exists only when it can be filled in.
	const knowsInflation = finding.code === "idleCash" && typeof finding.amounts.losing === "number";

	return t(knowsInflation ? "finding.idleCashLosing" : `finding.${finding.code}`, values);
}

/**
 * Months of cover are kept in tenths so that nothing carries a fraction until it reaches a
 * screen, which is here.
 */
function withCovers(
	values: Record<string, unknown>,
	finding: Finding,
	language: string,
): Record<string, unknown> {
	if (typeof finding.amounts.covers !== "number") return values;
	return {
		...values,
		covers: new Intl.NumberFormat(language === "en" ? "en" : "pt-BR", {
			maximumFractionDigits: 1,
		}).format(finding.amounts.covers / 10),
	};
}

export function Findings({
	findings,
	money,
	limit,
}: {
	findings: readonly Finding[];
	money: (value: number) => string;
	limit: number;
}) {
	const { t, i18n } = useTranslation();
	if (findings.length === 0) return null;

	return (
		<ul className="space-y-2">
			{/* By position: two findings can share a code and a subject, two invoices of one card. */}
			{findings.slice(0, limit).map((finding, index) => (
				<li
					// biome-ignore lint/suspicious/noArrayIndexKey: the list is drawn in one order and never reordered in place
					key={index}
					className={`border-l-2 pl-3 text-sm ${EDGE[finding.weight]} ${
						finding.weight === "good" ? "text-quiet" : "text-ink"
					}`}
				>
					{findingLine(finding, money, t, i18n.resolvedLanguage ?? "pt")}
				</li>
			))}
		</ul>
	);
}
