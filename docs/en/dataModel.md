# Data model

## Four rules that hold everywhere

1. **Money is an integer number of minor units.** Never a floating point number. An
   amount carries a currency, and a record in another currency stores the rate that was
   used at the time. The default is BRL.
2. **Every row that belongs to somebody carries `space_id`, not null.** The permission
   check is in the repository layer, never in a screen and never in a route.
3. **A date that means a calendar day is text in the ISO form**, `2026-09-23`. An
   instant is an integer of milliseconds in UTC. The two are never mixed, because a
   calendar day has no timezone and an instant has nothing else.
4. **Identifiers are UUID version 7.** They sort by the time they were made, which
   means an index on the primary key is an index on age, and two devices making rows
   while apart never collide.

Every table and column is snake_case English: `spaces`, `transactions`, `space_id`.

## The tables

### People and spaces

| table | what it holds |
| --- | --- |
| `users` | one row per person. In server mode it is kept in step with the authentication tables. In browser mode it is local and belongs to nobody but that browser |
| `spaces` | a space is the box everything else lives in. `kind` is `personal` or `shared`. A personal space cannot be shared, and there is one per person |
| `space_members` | who is in a space and as what. `role` is one of owner, admin, editor, viewer, logger. `state` is invited, active or removed |
| `space_invitations` | a token, the role it grants, optionally the address it was meant for, and when it stops working |

### Money

| table | what it holds |
| --- | --- |
| `accounts` | checking, savings, cash, credit, voucher or investment. A credit account carries its closing day, its due day and its limit. A voucher account carries which pot it is: meal, transport, culture or mobility |
| `cards` | a card is a way to reach an account and not an account itself. Credit, debit, multiple, benefit or prepaid. A multiple card points at two accounts, one for each side |
| `transactions` | income, expense or transfer. The amount is always positive and the direction comes from the kind. Planned or settled. Instalments share a group so the set can be undone as one |
| `categories` | two levels, with `parent_id` for the second. Each carries a spending priority: essential, important, desirable or superfluous |
| `categorization_rules` | text to match, and what to set when it matches. Ordered, and each one can be turned off without being deleted |
| `recurrences` | a series that writes its own records. Weekly, monthly or yearly, with a start, an optional end and an optional day of the month |

### Plan and sharing

| table | what it holds |
| --- | --- |
| `budgets` | a limit, over the whole space, over a priority, or over one category, for a month or for every month |
| `goals` | a name, an amount, an account that holds it, and optionally a date |
| `savings_rules` | the promise to put a percentage or a fixed amount aside before anything else |
| `expense_splits` | who owes what share of one expense, split evenly, by share or by income |
| `settlements` | one payment from one person to another, which closes part of what the splits opened |

### Investments and the months ahead

| table | what it holds |
| --- | --- |
| `holdings` | what somebody owns, with a quantity scaled by ten to the eighth so a fund can have fractions of a unit |
| `holding_prices` | the price of a holding on a day. Typed in by hand, on purpose: no price feed, no third party told what somebody owns |
| `index_rates` | CDI, Selic and IPCA per month, fetched from the public API of the Banco Central and cached so they work offline |
| `scenarios` | a saved set of adjustments to a projection |

### Working

| table | what it holds |
| --- | --- |
| `saved_filters` | somebody's own shortcut into the list of records. Private to the person who saved it, even inside a shared space |
| `changes` | the change log. One entry per write, with the logical clock, the device and the actor. This is what sync exchanges and what housekeeping folds |

### Authentication

`auth_users`, `auth_sessions`, `auth_accounts` and `auth_verifications` belong to Better
Auth and exist only on a server. They are named in snake_case like everything else
through an explicit field mapping, so the schema reads as one schema.

## What a role can do

The whole model is one table of data in `packages/storage/src/actor.ts`, so it can be
read by a person and walked by a test. The conformance suite fails if a repository
method names a permission that is not in it.

<!-- roleTable: written by scripts/roleTable.mjs, do not edit by hand -->
| what | Owner | Administrator | Editor | Viewer | Logger |
| --- | --- | --- | --- | --- | --- |
| `space.read` | yes | yes | yes | yes | yes |
| `space.update` | yes | yes | no | no | no |
| `space.delete` | yes | no | no | no | no |
| `space.leave` | no | yes | yes | yes | yes |
| `member.read` | yes | yes | yes | yes | yes |
| `member.invite` | yes | yes | no | no | no |
| `member.changeRole` | yes | yes | no | no | no |
| `member.remove` | yes | yes | no | no | no |
| `account.read` | yes | yes | yes | yes | yes |
| `account.create` | yes | yes | yes | no | no |
| `account.update` | yes | yes | yes | no | no |
| `account.archive` | yes | yes | yes | no | no |
| `account.delete` | yes | yes | no | no | no |
| `transaction.read` | yes | yes | yes | yes | yes |
| `transaction.create` | yes | yes | yes | no | yes |
| `transaction.update` | yes | yes | yes | no | yes |
| `transaction.delete` | yes | yes | yes | no | yes |
| `transaction.reconcile` | yes | yes | yes | no | no |
| `category.read` | yes | yes | yes | yes | yes |
| `category.write` | yes | yes | yes | no | no |
| `rule.read` | yes | yes | yes | yes | yes |
| `rule.write` | yes | yes | yes | no | no |
| `recurrence.read` | yes | yes | yes | yes | yes |
| `recurrence.write` | yes | yes | yes | no | no |
| `plan.read` | yes | yes | yes | yes | yes |
| `plan.write` | yes | yes | yes | no | no |
| `sharing.read` | yes | yes | yes | yes | yes |
| `sharing.write` | yes | yes | yes | no | no |
| `filter.read` | yes | yes | yes | yes | yes |
| `filter.write` | yes | yes | yes | yes | yes |
| `activity.read` | yes | yes | yes | yes | no |
| `backup.export` | yes | yes | no | no | no |
| `backup.restore` | yes | yes | no | no | no |
| `investment.read` | yes | yes | yes | yes | yes |
| `investment.write` | yes | yes | yes | no | no |
<!-- /roleTable -->

**The logger is the role for a child, or for whoever helps with the house.** They write
records and they see the records they wrote, and nothing else. That is enforced in the
repository layer by filtering rather than by refusing, so nothing on screen suggests
there is more to see: every query that reads the records narrows to their own, which
means their balances, their projection, their savings, their goals and their diagnosis
are readings of what they themselves put through the space and not of the household's
money. Where a figure belongs to the space rather than to a person, such as the opening
balance of an account or what a recurring bill will owe, it counts as nothing for them
rather than being mixed in.

Two things sit outside that rule on purpose. They read who owes whom, because they are
part of that count: they record what they spent and the division is between everybody.
And `activity.read` is the one permission in the matrix that excludes them, because the
log of what happened in the space is a record of other people's doing.

Two different answers on purpose: somebody who is not a member of a space is told the
space does not exist, because confirming that it exists already says something about
other people's money. Somebody who is a member is told plainly that their role does not
allow it.
