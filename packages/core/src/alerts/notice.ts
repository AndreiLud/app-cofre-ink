// What needs attention today.
//
// Nothing here is stored. A notice is worked out from what is already true, which
// means it cannot go stale, cannot be marked as read and then be wrong, and cannot
// pile up into a list nobody opens. When the reason disappears, so does the notice.
//
// The wording lives in the interface. This decides what is worth saying and how loud.

import { type CalendarDate, daysBetween } from "../time/calendar.ts";

export type NoticeLevel = "calm" | "attention" | "urgent";

export type Notice = {
	/** Names the message in the interface, so no text lives in this package. */
	kind:
		| "budgetOver"
		| "budgetTight"
		| "billDueToday"
		| "billDueSoon"
		| "billLate"
		| "invoiceClosing"
		| "savingsBehind"
		| "goalReached";
	level: NoticeLevel;
	/** Fills the sentence: a name, an amount, a number of days. */
	values: Record<string, string | number>;
	/** Sorted by this, highest first, so the list never needs a scroll to matter. */
	weight: number;
};

export type BudgetState = {
	name: string;
	spent: number;
	limit: number;
	state: "comfortable" | "tight" | "over";
};

export type UpcomingBill = {
	description: string;
	amount: number;
	happenedOn: CalendarDate;
};

export type NoticeInput = {
	today: CalendarDate;
	budgets?: readonly BudgetState[];
	bills?: readonly UpcomingBill[];
	/** The closing day of each card that has one, as a calendar date. */
	invoicesClosing?: readonly { name: string; closesOn: CalendarDate }[];
	savings?: { expected: number; put: number } | null;
	goals?: readonly { name: string; saved: number; target: number; achievedAt: number | null }[];
};

export function noticesFor(input: NoticeInput): Notice[] {
	const notices: Notice[] = [];

	for (const budget of input.budgets ?? []) {
		if (budget.state === "over") {
			notices.push({
				kind: "budgetOver",
				level: "urgent",
				values: { name: budget.name, over: budget.spent - budget.limit },
				weight: 100 + Math.round(((budget.spent - budget.limit) / Math.max(budget.limit, 1)) * 10),
			});
		} else if (budget.state === "tight") {
			notices.push({
				kind: "budgetTight",
				level: "attention",
				values: { name: budget.name, left: budget.limit - budget.spent },
				weight: 60,
			});
		}
	}

	for (const bill of input.bills ?? []) {
		const days = daysBetween(input.today, bill.happenedOn);
		if (days < 0) {
			notices.push({
				kind: "billLate",
				level: "urgent",
				values: { description: bill.description, days: Math.abs(days), amount: bill.amount },
				weight: 120 + Math.min(Math.abs(days), 30),
			});
		} else if (days === 0) {
			notices.push({
				kind: "billDueToday",
				level: "urgent",
				values: { description: bill.description, amount: bill.amount },
				weight: 110,
			});
		} else if (days <= 3) {
			notices.push({
				kind: "billDueSoon",
				level: "attention",
				values: { description: bill.description, days, amount: bill.amount },
				weight: 90 - days,
			});
		}
	}

	for (const invoice of input.invoicesClosing ?? []) {
		const days = daysBetween(input.today, invoice.closesOn);
		if (days >= 0 && days <= 2) {
			notices.push({
				kind: "invoiceClosing",
				level: "calm",
				values: { name: invoice.name, days },
				weight: 40,
			});
		}
	}

	if (input.savings && input.savings.expected > 0 && input.savings.put < input.savings.expected) {
		notices.push({
			kind: "savingsBehind",
			level: "attention",
			values: { missing: input.savings.expected - input.savings.put },
			weight: 70,
		});
	}

	for (const goal of input.goals ?? []) {
		if (goal.achievedAt === null && goal.saved >= goal.target) {
			notices.push({
				kind: "goalReached",
				level: "calm",
				values: { name: goal.name, target: goal.target },
				weight: 50,
			});
		}
	}

	return notices.sort((left, right) => right.weight - left.weight);
}
