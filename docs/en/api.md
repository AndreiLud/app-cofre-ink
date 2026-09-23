# API

Only the server has one. Browser mode calls the same repository layer directly, in a
worker, and makes no requests at all.

Everything is JSON. Every body is validated by Zod at the edge. The permission check is
never here: it is in the repository layer, which is why a route is three lines.

## Before you are signed in

| method | path | what it does |
| --- | --- | --- |
| `GET` | `/health` | answers `{"ok": true}`. What the container healthcheck asks |
| `GET` | `/api/setup` | whether this server has anybody on it yet, and the public Turnstile key if one is configured |
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
| `GET` `POST` | `/api/spaces` | list, create |
| `PATCH` `DELETE` | `/api/spaces/:id` | rename or recolour, remove |
| `POST` | `/api/spaces/:id/adopt` | take a space that arrived from a device and has nobody in it |
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
| `PATCH` `DELETE` | `/api/accounts/:id` | edit, remove |
| `POST` | `/api/accounts/:id/archive` and `/unarchive` | put away, bring back |
| `GET` `POST` | `/api/spaces/:id/cards` | list, create |
| `PATCH` `DELETE` | `/api/cards/:id` | edit, remove. The kind cannot be changed |
| `POST` | `/api/cards/:id/archive` and `/unarchive` | put away, bring back |
| `GET` `POST` | `/api/spaces/:id/transactions` | list with filters, create |
| `GET` | `/api/spaces/:id/balances` | the balance of every account |
| `PATCH` | `/api/transactions` | the same change over a selection, up to 500 |
| `POST` | `/api/transactions/remove` | remove a selection |
| `PATCH` `DELETE` | `/api/transactions/:id` | edit, remove |
| `POST` | `/api/transactions/:id/settle` | planned becomes settled |
| `POST` | `/api/transactions/:id/reconcile` | mark as matching a statement |
| `DELETE` | `/api/installments/:groupId` | the whole instalment set |

The filters on the list are query parameters: `accountId`, `cardId`, `kind`, `status`,
`from`, `to`, `invoiceMonth`, `search`, `categoryIds` as a comma separated list,
`withoutCategory`, `limit`.

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
| `GET` `POST` | `/api/spaces/:id/recurrences` | list, create |
| `POST` | `/api/spaces/:id/recurrences/materialize` | write the planned records the series owe |
| `PATCH` `DELETE` | `/api/recurrences/:id` | edit, remove. `?keepPlanned=true` leaves what it already wrote |
| `GET` `POST` | `/api/spaces/:id/budgets` | list, create |
| `GET` | `/api/spaces/:id/budgets/progress` | how each limit is going. Needs `month` |
| `PATCH` `DELETE` | `/api/budgets/:id` | edit, remove |
| `GET` `POST` | `/api/spaces/:id/goals` | list, create |
| `GET` | `/api/spaces/:id/goals/progress` | how each goal is going. Needs `today` |
| `PATCH` `DELETE` | `/api/goals/:id` | edit, remove |
| `POST` | `/api/goals/:id/achieved` | reached |
| `GET` `POST` `DELETE` | `/api/spaces/:id/savings` | the save first rule |
| `GET` | `/api/spaces/:id/savings/progress` | whether it was kept this month |
| `GET` `POST` | `/api/spaces/:id/filters` | saved filters, which are private to whoever saved them |
| `PATCH` `DELETE` | `/api/filters/:id` | edit, remove |

## Sharing

| method | path | what it does |
| --- | --- | --- |
| `GET` `POST` `DELETE` | `/api/transactions/:id/splits` | how one expense is divided |
| `GET` | `/api/spaces/:id/sharing/balances` | who owes what, in total |
| `GET` | `/api/spaces/:id/sharing/suggested` | the fewest payments that close it |
| `GET` `POST` | `/api/spaces/:id/sharing/settlements` | payments already recorded, record one |
| `DELETE` | `/api/settlements/:id` | forget a payment |

## Reading the figures back

| method | path | what it does |
| --- | --- | --- |
| `GET` | `/api/reports` | one route for every report. `kind` is one of totals, byCategory, incomeByCategory, byPriority, byMonth, byDay. Needs `from` and `to` |
| `GET` | `/api/spaces/:id/advice` | the findings, heaviest first. Needs `today` |
| `GET` | `/api/spaces/:id/reading` | the verdict and the four vital signs. Needs `today` |
| `GET` | `/api/spaces/:id/projection` | the months ahead. Needs `from` as a month |
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
| `GET` | `/api/indices` | CDI, Selic or IPCA, per month |
| `GET` | `/api/indices/latest` | the most recent of each |
| `POST` | `/api/indices/refresh` | ask the Banco Central for the months this installation does not have |

The refresh is done by the server rather than by the browser: one fetch serves everybody
on that server, and a browser never has to be allowed to call somebody else's address.
The series names come from a fixed list, so there is nothing a caller can point it at.

## Files in and out

| method | path | what it does |
| --- | --- | --- |
| `GET` | `/api/spaces/:id/imports/existing` | what the space already has around the days a file covers, to spot a repeat |
| `POST` | `/api/spaces/:id/imports` | write reviewed records, up to 3000 at a time |
| `GET` | `/api/spaces/:id/backup` and `/api/backup` | a space, or everything |
| `GET` | `/api/spaces/:id/records` | the records alone, for a spreadsheet |
| `POST` | `/api/backup/restore` | restore. Whoever is signed in becomes the owner of what they restore |
| `GET` | `/api/spaces/:id/changes` | the change log after a stamp |
| `POST` | `/api/spaces/:id/sync` | one round trip: push what this device wrote, pull what it has not seen |

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
| `413` | `{"error": "refused", "status": 413}` | a body over 25MB |
| `500` | `{"error": "unexpected"}` | anything else. The detail goes to the log and not to the caller |

The difference between `403` and `404` is deliberate. Somebody who is not in a space is
told it does not exist.
