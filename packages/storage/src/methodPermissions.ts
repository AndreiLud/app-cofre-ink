// Which permission each repository call asserts.
//
// A control on a screen used to name a permission by hand: a button called one method and
// was drawn behind a permission somebody wrote beside it. Seventeen of them agreed with the
// call behind them and one did not, and nothing could tell, because the two permissions it
// named hold the same four roles today. It would have begun lying the day they parted, in a
// release about something else, with no test to notice.
//
// So a control names the call, and the permission is read from here. The table is not
// trusted either: every entry in it is proved against the running repositories by the
// permission probes in the conformance suite, on every adapter, which already assert that a
// method refuses exactly the roles its permission refuses. The assertion that ties the two
// together is in `conformance/index.ts`, and it is what stops this file from drifting into
// a second opinion about the matrix.
//
// A gate that is not one call stays with `may` and the permission, because naming a method
// there would be a worse fiction than naming a permission.

import type { Permission } from "./actor.ts";

export const METHOD_PERMISSIONS = {
	"spaces.get": "space.read",
	"spaces.update": "space.update",
	"spaces.remove": "space.delete",
	"members.leave": "space.leave",
	"members.list": "member.read",
	"members.invite": "member.invite",
	"members.changeRole": "member.changeRole",
	"members.remove": "member.remove",
	"accounts.list": "account.read",
	"accounts.create": "account.create",
	"accounts.update": "account.update",
	"accounts.archive": "account.archive",
	"accounts.remove": "account.delete",
	"cards.list": "account.read",
	"cards.create": "account.create",
	"cards.remove": "account.delete",
	"transactions.list": "transaction.read",
	"transactions.create": "transaction.create",
	"transactions.update": "transaction.update",
	"transactions.updateMany": "transaction.update",
	"transactions.updateFrom": "transaction.update",
	"transactions.settle": "transaction.update",
	"transactions.settleMany": "transaction.update",
	"transactions.remove": "transaction.delete",
	"transactions.removeMany": "transaction.delete",
	"transactions.removeGroup": "transaction.delete",
	"transactions.reconcile": "transaction.reconcile",
	"transactions.refund": "transaction.create",
	"transactions.toTransfer": "transaction.update",
	"invoices.pay": "transaction.create",
	"invoices.markPaidUntil": "transaction.create",
	"invoices.move": "transaction.update",
	"invoices.closedOn": "transaction.update",
	"invoices.payWithCard": "transaction.create",
	"invoices.split": "transaction.create",
	"invoices.undoPlan": "transaction.delete",
	"imports.existing": "transaction.read",
	"imports.create": "transaction.create",
	"imports.undo": "transaction.delete",
	"categories.list": "category.read",
	"categories.create": "category.write",
	"rules.list": "rule.read",
	"rules.create": "rule.write",
	"rules.applyToExisting": "rule.write",
	"recurrences.list": "recurrence.read",
	"recurrences.create": "recurrence.write",
	"recurrences.materialize": "recurrence.write",
	"budgets.list": "plan.read",
	"budgets.create": "plan.write",
	"sharing.balances": "sharing.read",
	"sharing.split": "sharing.write",
	"savedFilters.list": "filter.read",
	"savedFilters.create": "filter.write",
	"changes.list": "activity.read",
	"backup.exportSpace": "backup.export",
	"backup.restore": "backup.restore",
	"investments.list": "investment.read",
	"investments.create": "investment.write",
	"repairs.run": "space.update",
} as const satisfies Record<string, Permission>;

/** One call of one repository, named the way a screen names what its button does. */
export type RepositoryMethod = keyof typeof METHOD_PERMISSIONS;
