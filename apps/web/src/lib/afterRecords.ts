// What has to be read again after a record changes.
//
// A record is read by more screens than the one that wrote it: the balances, the invoices,
// the savings rule, the goals, the limits, the reports, the check up and the months ahead.
// Every place that wrote records kept a list of its own, and none of them had all of these:
// the form refreshed four, the quick entry three, so moving money to the savings account
// left the overview saying the rule still asked for it until the cache aged, and in the
// browser tests, whose clock never moves, it never aged at all.

import type { QueryClient } from "@tanstack/react-query";

/** Every reading made from records, by the first part of its query key. */
export const READ_FROM_RECORDS = [
	"transactions",
	"balances",
	"advice",
	"reading",
	"invoices",
	"savings",
	"goals",
	"budgets",
	"reports",
	"projection",
	"benefit",
	"accountRecords",
	"sharing",
	"splits",
] as const;

export function afterRecordsChange(queries: QueryClient): void {
	for (const key of READ_FROM_RECORDS) void queries.invalidateQueries({ queryKey: [key] });
}
