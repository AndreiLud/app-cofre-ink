# Architecture decision records

One file per decision that is expensive to reverse. Each record states the context,
the decision, the options that were rejected and why, the consequences and the
follow up items. A record is never edited to change its meaning: it is superseded by a
new one.

| record | subject | status |
| --- | --- | --- |
| [0001](0001_monorepo_and_stack.md) | monorepo, stack and the reasoning behind each tool | accepted |
| [0002](0002_storage_adapters.md) | repository layer, the four storage adapters and SQLite in the browser | accepted |
| [0003](0003_sync_strategy.md) | offline sync for shared spaces, change log and clocks | accepted |
| [0004](0004_money_time_and_identifiers.md) | integer cents, calendar dates, instants, UUID version 7 | accepted |
| [0005](0005_spaces_and_permissions.md) | spaces, roles, scoping and the permission matrix | accepted |
| [0006](0006_visual_direction.md) | visual direction, tokens, typography and motion | accepted |
| [0007](0007_language_and_writing_rule.md) | language per artifact and the writing rule | accepted |
| [0008](0008_storage_implementation.md) | how the storage layer is actually built, replacing two tool choices in 0002 | accepted |
| [0009](0009_authentication_and_identity.md) | authentication on the server, identity mirroring and invitations | accepted |
| [0010](0010_shape_of_a_transaction.md) | transfers, signs, invoices and installments | accepted |
| [0011](0011_reading_one_line_of_text.md) | reading a record from one line somebody typed | accepted |
| [0012](0012_rules_and_recurrences.md) | categories, rules that sort, and what repeats | accepted |
| [0013](0013_budget_goals_and_splitting.md) | limits, goals, saving first and dividing an expense | accepted |
| [0014](0014_charts_and_sizes.md) | charts drawn by hand, and screens that survive a resize | accepted |
| [0015](0015_import_export_and_sync.md) | reading files in, taking everything out, and meeting a server | accepted |
