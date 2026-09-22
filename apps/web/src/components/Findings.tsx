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
	good: "border-rule",
};

/** Plural forms are driven by this one number, when a finding has one. */
const COUNTED: Partial<Record<Finding["code"], string>> = {
	chargedTwice: "days",
	invoiceOverBalance: "days",
	duesOverBalance: "count",
	goalStalled: "days",
	subscriptionLoad: "count",
};

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
		values[name] =
			name === "percent" || name === "count" || name === "days" || name === "months"
				? amount
				: money(amount);
	}

	// Months of cover are kept in tenths so that nothing carries a fraction until it
	// reaches a screen, which is here.
	if (typeof finding.amounts.covers === "number") {
		values.covers = new Intl.NumberFormat(language === "en" ? "en" : "pt-BR", {
			maximumFractionDigits: 1,
		}).format(finding.amounts.covers / 10);
	}

	const counted = COUNTED[finding.code];
	if (counted) values.count = finding.amounts[counted] ?? 0;

	return t(`finding.${finding.code}`, values);
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
			{findings.slice(0, limit).map((finding) => (
				<li
					key={`${finding.code}${finding.subject ?? ""}`}
					className={`border-l-2 pl-3 text-sm ${EDGE[finding.weight]} ${
						finding.weight === "good" ? "text-graphite" : "text-ink"
					}`}
				>
					{findingLine(finding, money, t, i18n.resolvedLanguage ?? "pt")}
				</li>
			))}
		</ul>
	);
}
