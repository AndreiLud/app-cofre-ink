# ADR 0007: Language policy and the writing rule

**Status:** Accepted
**Date:** 21 September 2026
**Deciders:** Andrei Ludescher (owner), Claude (implementation)

## Context

The repository serves two audiences at once. It is a working application for a
Brazilian user and their family, and it is a portfolio piece that an international
reader may open. Those two audiences want different languages in different places.

Separately, the owner set a writing rule for the whole project: no hyphen, en dash or
em dash as punctuation, as a list marker or as a word joiner in any text written for
people. That rule needs a definition precise enough to be checked by a program, and a
program that checks it.

## Decision

### Language by artifact

| artifact | language |
| --- | --- |
| code, identifiers, types, functions | English |
| database tables and columns | English, snake_case |
| API routes and payload fields | English |
| commit messages, pull requests, changelog | English |
| architecture decision records, `CLAUDE.md` | English |
| `README.md` | English |
| `LEIAME.md`, `docs/produto.md` | Portuguese |
| interface copy | Portuguese and English, through i18n, Portuguese as the default |
| code comments | English, matching the code around them |

Two deliberate exceptions, because the owner asked for them: the setup wizard keeps
the command name `configurar`, with `setup` as an alias, and the product vocabulary in
the Portuguese interface stays Portuguese even where the code says `space`.

Domain vocabulary, so translations stay consistent:

| code | Portuguese interface |
| --- | --- |
| space | espaço |
| account | conta |
| transaction | lançamento |
| category | categoria |
| priority | prioridade |
| budget | orçamento |
| goal | meta |
| recurrence | recorrência |
| settlement | acerto de contas |
| statement | fatura ou extrato, by context |

### The writing rule, stated precisely

Forbidden characters in prose: hyphen minus, hyphen, non breaking hyphen, figure dash,
en dash, em dash, horizontal bar and minus sign.

Where the rule applies: every Markdown file in the repository, the interface
translation files, commit messages, pull request descriptions, the changelog, code
comments, error messages and any text rendered to a person.

Where the rule yields, because syntax requires it:

1. Inside fenced code blocks and inline code spans in Markdown.
2. Command line flags, third party package names and configuration keys defined by a
   tool, always written inside code formatting.
3. Markdown table delimiter rows, thematic breaks and the front matter fence.
4. Link destinations and URLs.
5. Framework namespaced token names, as recorded in registry 0006.

Naming: files, folders and routes use camelCase or underscore, never the hyphen.

Style, beyond the character itself: no empty slogans, no decorative emoji, no words
such as revolutionary or powerful, no three adjectives in a row. Lists are numbered or
become prose.

### Enforcement

`scripts/checkWriting.mjs` implements the rule with no dependencies. It runs in three
places:

1. Before every commit, on the staged files, through a hook.
2. On the commit message itself, through a second hook, with the `--commitMsg` flag.
3. In CI, over the whole repository, as a required check.

The script understands the exceptions above, reports file, line, column and the
offending line, and exits with a failing status.

## Options considered

### Code in English, interface bilingual

Chosen. It is what an international reader expects from a repository, it keeps the
schema readable for contributors, and i18n makes the interface language a runtime
choice instead of a code decision.

### Domain in Portuguese

The owner's first draft of the brief used `espaco_id`. It reads naturally for the
product's main audience and matches the vocabulary of the screens. Rejected because it
halves the repository's reach as a portfolio piece and forces every contributor to
learn a second vocabulary before reading a query.

### Mixed by layer

Portuguese domain, English infrastructure. Rejected: it puts a translation boundary in
the middle of the codebase, exactly where the interesting logic lives.

## Consequences

Easier:

1. A stranger can read the schema and the core package without translating anything.
2. The interface can add a language without touching the data model.
3. The writing rule is a program, not a matter of taste, so it never becomes an
   argument.

Harder:

1. Every screen needs a translation key from the first component. Adding copy directly
   in a component is a lint failure by convention and by review.
2. Writing English prose without the dash needs care, since the em dash is common in
   technical writing. Rewriting is usually shorter anyway.
3. The checker needs maintenance as new file types appear, for example the changelog
   generator in phase 10.

## Action items

1. [x] Write `scripts/checkWriting.mjs`.
2. [ ] Wire it into a pre commit hook and a commit message hook in phase 1.
3. [ ] Add it as a required job in GitHub Actions.
4. [ ] Add the vocabulary table above to the translation review checklist.
