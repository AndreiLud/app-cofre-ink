// What a step of the plan is called, and what it says, wherever the plan is read.

import type { PlanStep } from "@cofre/core";

type Translate = (key: string, values?: Record<string, unknown>) => string;

/** The name of a step: what it is about when it is about one thing, or what it does. */
export function stepTitle(t: Translate, step: PlanStep): string {
	return step.subject ?? t(`step.${step.code}`);
}

/**
 * What a step costs, how long it takes and when it lands.
 *
 * One wording for the check up and for the month on paper. The paper had its own, built from
 * a group of keys that never existed, so every step of the plan printed as a key such as
 * `plan.buildReserve` in the file somebody hands to another person.
 *
 * A step with no months is a step with nothing funding it. Saying "at nothing a month,
 * nought months" is arithmetic that has stopped meaning anything.
 */
export function stepSaid(t: Translate, step: PlanStep, money: (amount: number) => string): string {
	const undated = step.months === 0 && step.code !== "coverDues" && step.code !== "freeUpMonthly";
	if (undated) return t("step.said.undated", { amount: money(step.amount) });

	return t(`step.said.${step.code}`, {
		count: step.months,
		amount: money(step.amount),
		everyMonth: money(step.everyMonth),
	});
}
