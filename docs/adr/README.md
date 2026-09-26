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
| [0006](0006_visual_direction.md) | visual direction, tokens, typography and motion | superseded by 0023 |
| [0007](0007_language_and_writing_rule.md) | language per artifact and the writing rule | the default language replaced by 0034 |
| [0008](0008_storage_implementation.md) | how the storage layer is actually built, replacing two tool choices in 0002 | accepted |
| [0009](0009_authentication_and_identity.md) | authentication on the server, identity mirroring and invitations | accepted |
| [0010](0010_shape_of_a_transaction.md) | transfers, signs, invoices and installments | accepted |
| [0011](0011_reading_one_line_of_text.md) | reading a record from one line somebody typed | accepted |
| [0012](0012_rules_and_recurrences.md) | categories, rules that sort, and what repeats | accepted |
| [0013](0013_budget_goals_and_splitting.md) | limits, goals, saving first and dividing an expense | accepted |
| [0014](0014_charts_and_sizes.md) | charts drawn by hand, and screens that survive a resize | accepted |
| [0015](0015_import_export_and_sync.md) | reading files in, taking everything out, and meeting a server | accepted |
| [0016](0016_reading_a_document.md) | reading a card invoice and a receipt out of a PDF | accepted |
| [0017](0017_where_a_copy_lives.md) | where a copy of a space can live, and what each place costs | accepted |
| [0018](0018_making_the_history_smaller.md) | folding the change log up to a watermark, and packing what travels | accepted |
| [0019](0019_the_months_ahead.md) | projections, scenarios, compound interest and what is put aside | accepted |
| [0020](0020_an_application_in_a_window.md) | installed on a telephone, wrapped for a desktop, served from anywhere | partly superseded by 0021 |
| [0021](0021_a_web_application_that_tidies_itself.md) | no shell, and housekeeping that nobody is asked about | accepted |
| [0022](0022_reading_the_figures_back.md) | findings over a household's own records, and five ways in | accepted |
| [0023](0023_surfaces_weight_and_one_colour.md) | three surfaces, two weights of line, and one interactive colour | accepted |
| [0024](0024_the_plastic_and_the_money.md) | cards, the accounts they reach, and which pot a voucher is | accepted |
| [0025](0025_taking_the_data_away.md) | erasing a space, erasing everything, and what neither can reach | accepted |
| [0026](0026_a_copy_that_is_a_database.md) | a copy that is a database, and a screen ordered by how often | accepted |
| [0027](0027_a_cost_before_a_password.md) | a cost before a password, and no captcha from anybody else | accepted |
| [0028](0028_the_front_door.md) | the front door of an address anybody can open | accepted |
| [0029](0029_four_signs_and_a_verdict.md) | four signs, and a word for the state of the money | accepted |
| [0030](0030_a_plan_with_a_month_on_it.md) | a plan with a month on it, and a target they have already hit | accepted |
| [0031](0031_whether_it_is_getting_better.md) | whether it is getting better, and the months already spent | accepted |
| [0032](0032_the_year_ahead_and_the_one_income.md) | the year ahead, the one income, and what standing still costs | accepted |
| [0033](0033_the_name_and_the_drop.md) | the name, the drop, and the one place the name lives | accepted |
| [0034](0034_which_language_opens.md) | which language opens, and who is allowed to say | accepted |
