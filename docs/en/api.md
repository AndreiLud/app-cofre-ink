# API

Only the server has one. Browser mode calls the same repository layer directly, in a
worker, and makes no requests at all.

Everything is JSON. Every body is validated by Zod at the edge. The permission check is
never here: it is in the repository layer, which is why a route is three lines.

## Before you are signed in

| method | path | what it does |
| --- | --- | --- |
| `GET` | `/health` | answers `{"ok": true}`. What the container healthcheck asks |
| `GET` | `/api/setup` | whether this server has anybody on it yet, the public Turnstile key if one is configured, and the `version` it runs, which a page reads before it writes anything. A server of 1.x does not say one |
| `GET` | `/api/challenge` | a proof of work challenge. Anybody may ask for one |
| `GET` | `/api/invitations/:token` | what an invitation offers, for somebody who does not have an account yet |
| `GET` `POST` | `/api/auth/*` | sign up, sign in, sign out and the rest, handled by Better Auth |

Everything else requires a session and answers `401 {"error": "signedOut"}` without
one.

## Spaces and people

| method | path | what it does |
| --- | --- | --- |
| `GET` | `/api/me` | who you are and which spaces you can read |
| `GET` | `/api/peers` | everybody you share a space with |
| `GET` | `/api/spaces/:id/people` | everybody in one space, which is who a division is between |
| `GET` `POST` | `/api/spaces` | list, create |
| `PATCH` `DELETE` | `/api/spaces/:id` | rename or recolour, remove |
| `POST` | `/api/spaces/:id/adopt` | take a space that arrived from a device and has nobody in it |
| `POST` | `/api/spaces/:id/empty` | the rows of one space, gone, with the space and its members left standing |
| `DELETE` | `/api/spaces/:id/data` | empty a space, and remove it if it is shared |
| `POST` | `/api/erase` | every space this account owns |
| `GET` | `/api/spaces/:id/members` | who is in it |
| `PATCH` `DELETE` | `/api/spaces/:id/members/:userId` | change a role or a declared income, remove |
| `POST` | `/api/spaces/:id/leave` | leave a space you are in |
| `GET` `POST` | `/api/spaces/:id/invitations` | list, create |
| `DELETE` | `/api/spaces/:id/invitations/:invitationId` | revoke |
| `POST` | `/api/invitations/:token/accept` | join |

## Money

| method | path | what it does |
| --- | --- | --- |
| `GET` `POST` | `/api/spaces/:id/accounts` | list, create. `?archived=true` includes archived |
| `PATCH` `DELETE` | `/api/accounts/:id` | edit, remove. The name, where it is, the opening balance, the allowance of a benefit card, and the closing day, the due day and the limit of a credit card |
| `POST` | `/api/accounts/:id/archive` and `/unarchive` | put away, bring back |
| `GET` | `/api/accounts/:id/benefit` | what is left on a benefit card, worked out and not stored. Needs `today`. Nothing for an account with no allowance on it, and nothing for somebody who only sees their own records |
| `GET` | `/api/accounts/:id/records` | how many records are charged to it, which is what goes nowhere if it is deleted. Counts what the asker can see |
| `GET` `POST` | `/api/spaces/:id/cards` | list, create |
| `PATCH` `DELETE` | `/api/cards/:id` | edit, remove. The kind cannot be changed |
| `POST` | `/api/cards/:id/archive` and `/unarchive` | put away, bring back |
| `GET` `POST` | `/api/spaces/:id/transactions` | list with filters, create |
| `GET` | `/api/spaces/:id/transactions/summary` | what the list adds up to with the same filters, every record they reach and not only one page |
| `GET` | `/api/spaces/:id/balances` | the balance of every account. Needs `today`, because a record counts once it is a fact and its day has come |
| `PATCH` | `/api/transactions` | the same change over a selection, up to 500 |
| `POST` | `/api/transactions/remove` | remove a selection |
| `POST` | `/api/transactions/settle` | a selection of planned records becomes settled, all of them or none. Needs `today` in the body. Each record keeps the day it was promised for, and only one dated ahead comes back to today |
| `PATCH` `DELETE` | `/api/transactions/:id` | edit, remove |
| `PATCH` | `/api/transactions/:id/onwards` | the same change on this part of an instalment plan and every part after it. Never the parts behind, and never the day. Answers how many parts it changed |
| `POST` | `/api/transactions/:id/settle` | planned becomes settled |
| `POST` | `/api/transactions/:id/reconcile` | mark as matching a statement |
| `POST` | `/api/transactions/:id/invoice/move` | one invoice earlier or later, with every part of an instalment plan. All of them or none |
| `POST` | `/api/transactions/:id/refund` | a purchase on a benefit card taken back, written as the purchase the other way round, so it returns to the card and leaves its category. `amount`, `happenedOn` and `description` |
| `POST` | `/api/transactions/:id/toTransfer` | a record that was money moving between two accounts of the same person becomes a move. `otherAccountId`, `invoiceMonth` when the other end is a card, and `mergeWith` when the other end was written too, which is then taken out |
| `DELETE` | `/api/installments/:groupId` | the whole instalment set |

A record in parts is created with `installments`, a whole number from one, and the amount of
the whole purchase. More than 48 parts, parts on money coming in, parts on a benefit card and
parts below one cent are refused with 409 and the code of the rule: `tooManyInstallments`,
`onlyExpensesGoInInstallments`, `benefitIsNotInInstallments`, `partBelowOneCent`. A plan
begun before is written from `firstInstallment` (one when it is left out), with `happenedOn`
the day of that part; `invoiceMonth`, when given, is the invoice of that part, and each part
after it is on the next invoice. A `firstInstallment` beyond the plan is refused with
`firstInstallmentOutsidePlan`. Plans written before 2.0.0 with more than 48 parts are read,
changed and restored as they are.

The filters on the list are query parameters: `accountId`, `cardId`, `kind`, `status`,
`from`, `to`, `invoiceMonth`, `search`, `categoryIds` as a comma separated list,
`withoutCategory`, `externalIds`, `order` as `oldestFirst`, `limit` and `offset`. The order
belongs in the query and not after it, because the limit is applied by the database: a
caller that takes the newest twenty and sorts them the other way round is showing the twenty
furthest away.

## The cards

An invoice is the whole of what a card will charge, whoever made the purchases, so every
route here closes to somebody who only ever sees the records they wrote.

| method | path | what it does |
| --- | --- | --- |
| `GET` | `/api/accounts/:id/invoices` | every invoice of one card, oldest first, each with what it charged, what was paid and what is left. Needs `today` |
| `GET` | `/api/accounts/:id/invoices/:month` | one invoice, whether or not anything is on it. Needs `today` |
| `GET` | `/api/spaces/:id/invoices` | where every card of a space stands: the open invoice, the one that closed and is not paid, what the instalments will charge later, and the headroom. Needs `today` |
| `POST` | `/api/accounts/:id/invoices/pay` | pays one, as a transfer into the card marked with the invoice it pays. The amount is what somebody typed, so part of an invoice can be paid |
| `POST` | `/api/accounts/:id/invoices/paidUntil` | writes one payment for every invoice up to a month, each dated on the day it fell due, for a card that was already in use before any of this |
| `POST` | `/api/accounts/:id/invoices/closedOn` | says which day an invoice really closed, and moves every purchase in the days between onto the invoice it belongs to. All of them or none |
| `POST` | `/api/accounts/:id/invoices/payWithCard` | pays the invoice of `month` with another card, `cardAccountId`, in `parts` on that card's invoices from the one open on `happenedOn`. `charged` is what the other card charges in all, and what it charges over the invoice is written as a cost |
| `POST` | `/api/accounts/:id/invoices/split` | splits the invoice of `month` with the bank: an `entry` paid from `entryFromAccountId`, or a payment already written named by `useAsEntry`, then `parts` on the card's invoices after it, and a `tax` charged apart |
| `POST` | `/api/accounts/:id/invoices/undoPlan` | takes a payment with another card or a split of the invoice of `month` back, all of it, while no invoice of its parts has been paid |

A part of a payment with another card is a transfer out of that card, and it touches two
invoices: the one it pays, in `invoice_month`, and the one of the card it leaves, where it is a
purchase, in `origin_invoice_month`. Only these two routes write the second, once. A transfer
written before 2.0.0 has none and is read as it always was.

## Sorting, repeating, planning

| method | path | what it does |
| --- | --- | --- |
| `GET` `POST` | `/api/spaces/:id/categories` | list, create |
| `POST` | `/api/spaces/:id/categories/defaults` | the starting set, written once and only into a space with none |
| `PATCH` `DELETE` | `/api/categories/:id` | edit, remove. The kind cannot be changed |
| `POST` | `/api/categories/:id/archive` and `/unarchive` | put away, bring back |
| `GET` `POST` | `/api/spaces/:id/rules` | list, create |
| `POST` | `/api/spaces/:id/rules/apply` | run the rules over records nobody has sorted |
| `PATCH` `DELETE` | `/api/rules/:id` | edit, remove |
| `GET` `POST` | `/api/spaces/:id/recurrences` | list, one line for each series however many times it was changed, create |
| `POST` | `/api/spaces/:id/recurrences/startWith` | a record and the series it starts, in one write: the record is the first of the series, and the series writes the next ones |
| `POST` | `/api/spaces/:id/recurrences/materialize` | write the records the series owe, up to the horizon. Each one once, under an identifier made from the series and the day, so a second call writes nothing |
| `PATCH` | `/api/recurrences/:id` | edit, pause with `paused`. A change goes on as a new link of the series from the next time, and what was already written stays as it is |
| `GET` | `/api/recurrences/:id/removal` | what deleting a series would take back, for the question asked before it |
| `DELETE` | `/api/recurrences/:id` | remove the series, and the records it wrote ahead that nobody touched. `?keepPlanned=true` leaves them |
| `GET` `POST` | `/api/spaces/:id/budgets` | list, create |
| `GET` | `/api/spaces/:id/budgets/progress` | how each limit is going. Needs `month` |
| `PATCH` `DELETE` | `/api/budgets/:id` | edit, remove |
| `GET` `POST` | `/api/spaces/:id/goals` | list, create |
| `GET` | `/api/spaces/:id/goals/progress` | how each goal is going. Needs `today` |
| `PATCH` `DELETE` | `/api/goals/:id` | edit, remove |
| `POST` | `/api/goals/:id/achieved` | reached |
| `GET` `POST` `DELETE` | `/api/spaces/:id/savings` | the save first rule |
| `GET` | `/api/spaces/:id/savings/progress` | whether it was kept this month |
| `POST` | `/api/spaces/:id/transfer` | hands the space to another member. Only the owner, who becomes an administrator |
| `GET` `POST` | `/api/spaces/:id/filters` | saved filters, which are private to whoever saved them |
| `PATCH` `DELETE` | `/api/filters/:id` | edit, remove |

## Sharing

| method | path | what it does |
| --- | --- | --- |
| `GET` `POST` `DELETE` | `/api/transactions/:id/splits` | how one expense is divided. A share is given by identifier, in `shares`, and never by position. On a part of an instalment plan, writing and removing apply to every part of it |
| `GET` | `/api/spaces/:id/sharing/balances` | who owes what, in total, counting each division from the day of its record |
| `GET` | `/api/spaces/:id/sharing/suggested` | the fewest payments that close it |
| `GET` `POST` | `/api/spaces/:id/sharing/settlements` | payments already recorded, record one |
| `DELETE` | `/api/settlements/:id` | forget a payment |

## Reading the figures back

| method | path | what it does |
| --- | --- | --- |
| `GET` | `/api/reports` | one route for every report. `kind` is one of totals, byCategory, incomeByCategory, byPriority, byMonth, byDay. Needs `from` and `to` |
| `GET` | `/api/spaces/:id/advice` | the findings, heaviest first. Needs `today` |
| `GET` | `/api/spaces/:id/reading` | the verdict and the four vital signs. Needs `today` |
| `GET` | `/api/spaces/:id/projection` | the months ahead. Needs `from` as a month and `today` as a day, which is what the opening balance is counted up to and what decides which invoices are still owed |
| `GET` `POST` | `/api/spaces/:id/scenarios` | saved adjustments to a projection |
| `PATCH` `DELETE` | `/api/scenarios/:id` | edit, remove |

Six reports go through one route on purpose: six routes that differed by a word would
be six places to forget the same permission check.

## Investments and indices

| method | path | what it does |
| --- | --- | --- |
| `GET` `POST` | `/api/spaces/:id/holdings` | list, create |
| `GET` | `/api/spaces/:id/holdings/total` | what it all comes to |
| `PATCH` `DELETE` | `/api/holdings/:id` | edit, remove |
| `POST` | `/api/holdings/:id/price` | type in a price, for a day |
| `GET` | `/api/holdings/:id/prices` | the prices typed in so far |
| `GET` `POST` | `/api/holdings/:id/moves` | the movements, put one in: `kind` is `in`, `out` or `income`, with `onDay`, `amount`, the `accountId` at the other end, and for a sale `arrived`, what reached the account after tax |
| `GET` | `/api/holdings/:id/goingBack` | what deleting a holding, or one movement with `moveId`, gives back to each account |
| `DELETE` | `/api/holdingMoves/:id` | remove one movement, and the record that moved its money |
| `GET` | `/api/indices` | CDI, Selic or IPCA, per month |
| `GET` | `/api/indices/latest` | the most recent of each |
| `POST` | `/api/indices/refresh` | ask the Banco Central for the months this installation does not have |

The refresh is done by the server rather than by the browser: one fetch serves everybody
on that server, and a browser never has to be allowed to call somebody else's address.
The series names come from a fixed list, so there is nothing a caller can point it at.

## Files in and out

| method | path | what it does |
| --- | --- | --- |
| `GET` | `/api/spaces/:id/imports/existing` | what the space already has around the days a file covers, to spot a repeat, newest first, with the kind, the other end of a move, the card, the invoice, the series and the part of a plan of each. `invoiceMonth` brings the plans of the account around that invoice |
| `POST` | `/api/spaces/:id/imports` | write reviewed records, up to 3000 at a time, all of them or none. `invoiceMonth` makes the file an invoice of that month; `removes` takes out records it replaces. Each record may say its `cardId`, `nature`, `installment` (`number` from 1 to `count`, `count` from 2), `paymentFrom`, `reverses`, `paysCard` and `paysInvoice`. Over 48 parts is 409 `tooManyInstallments`; a month that is not one is 400 |
| `POST` | `/api/imports/undo` | take an import back by the ids it answered with, in one call, all of them or none |
| `GET` | `/api/backup/spaces` | which spaces this person may take a copy of |
| `GET` | `/api/backup/restorable` | which spaces a file may be written back into, which is the other permission |
| `GET` | `/api/spaces/:id/backup` and `/api/backup` | a space, or everything. `?spaces=a,b` for the ones that were ticked |
| `GET` | `/api/spaces/:id/records` | the records alone, for a spreadsheet |
| `POST` | `/api/backup/restore` | restore. The body is the file, and an optional `only` names the spaces of it to bring back. Whoever is signed in becomes the owner of what they restore |
| `GET` | `/api/spaces/:id/changes` | the change log after a stamp |
| `POST` | `/api/spaces/:id/sync` | one round trip: push what this device wrote, pull what it has not seen. The body says the `version` of the device, and one of another major version, or one that does not say, is refused with 409 `serverOtherVersion` before anything is read |

## This copy, and the versions published

| method | path | what it does |
| --- | --- | --- |
| `GET` | `/api/about` | the version, how this copy was installed (`compose`, `dockerRun`, `built` or `source`), the image, which database, where the SQLite file is, with any password taken out, and whether that file is on a named volume. Asks nobody anything |
| `POST` | `/api/updates/check` | asks GitHub which versions were published after this one, only when called. An answer is kept an hour and a failure five minutes, and calls that arrive together share one request. In test mode nothing is asked |

The second route is the only one that talks to a third party, and only because somebody pressed
a button: the server never asks on a schedule (registry 0061).

## What comes back when something is wrong

| status | body | when |
| --- | --- | --- |
| `400` | `{"error": "invalidInput", "issues": [...]}` | Zod refused the body or the query |
| `400` | `{"error": "proofRequired"}` | the gate in front of sign in was not answered |
| `400` | `{"error": "captchaRequired"}` | Turnstile is on and the answer was not accepted |
| `401` | `{"error": "signedOut"}` | no session |
| `403` | `{"error": "notAllowed", "permission": "..."}` | a member whose role does not allow it |
| `403` | `{"error": "profileBelongsToAnAccount"}` | a device tried to write in the name of somebody who has an account here |
| `404` | `{"error": "notFound", "entity": "..."}` | not there, or a space you are not a member of |
| `409` | `{"error": "<the rule>", "message": "..."}` | a rule of the model refused it |
| `409` | `{"error": "serverOtherVersion"}` | a device of another major version tried to exchange changes |
| `413` | `{"error": "refused", "status": 413}` | a body over 25MB |
| `502` | `{"error": "githubRefused"}`, `githubUnreachable` or `githubUnreadable` | GitHub refused the question (usually its limit an hour), nothing answered (usually a server with no internet), or the answer could not be read |
| `500` | `{"error": "unexpected"}` | anything else. The detail goes to the log and not to the caller |

The difference between `403` and `404` is deliberate. Somebody who is not in a space is
told it does not exist.
