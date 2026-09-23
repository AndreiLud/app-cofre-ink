# Cofre Ink

**[English](#in_english) · [Português](#em_portugues)**

Personal finance for one person, a couple, a family or a group of friends. You clone it,
you run it, and the database is yours: inside your browser, on a server of your own, or
on a cloud you pay for. No account with anybody, no telemetry, and nothing leaves the
device without you pressing something.

| | |
| --- | --- |
| Site | [cofre.ink](https://cofre.ink) |
| Application | [app.cofre.ink](https://app.cofre.ink) |
| Repository | [`AndreiLud/app-cofre-ink`](https://github.com/AndreiLud/app-cofre-ink) |

![The overview, with the balance, what the figures found and where the money is](docs/imagens/painel.png)

<a id="in_english"></a>

## In English

### What it does

**Records.** Accounts, cards with a real invoice cycle, instalments, transfers, planned
and settled. A whole record written on one line: `mercado 42,90 ontem nubank 3x`.

**Sorting.** Categories two levels deep, spending priority, and rules that sort by
themselves and learn from a correction.

**Repeating.** Series that write their own records, and a calendar of what falls due.

**Planning.** Limits per category or per priority, a save first rule, goals with a date,
and a projection of the next months built from three things kept apart: what is already
written, what repeats, and what an ordinary month looks like.

**Sharing.** A space has members with roles. An expense splits evenly, by share or by
amount, and a settle up says who owes whom, once.

**Reading a statement.** CSV, OFX, QIF, XLSX and JSON, plus a PDF reader written by hand
for card invoices and receipts. The account is guessed and the guess says why. Columns
are remembered per file shape. Nothing is written before you have seen it.

**Saying something back.** Findings over your own records, each one carrying the figures
it was made from: a category well above its usual month, a budget being spent faster
than the month is passing, what repeats every month and what it comes to in a year, a
subscription that quietly went up, the same charge twice, a reserve measured in months
of ordinary spending. Nothing about what to buy or where to put money.

**Leaving.** Export everything as JSON or as a spreadsheet, restore it anywhere, keep a
copy in a file, a WebDAV folder or an online database, and mirror the records into a
Google spreadsheet. Two devices agree by exchanging a change log, over a server or
through a file somebody carries.

**Offline.** The whole interface is kept by a service worker, so it opens on a train.

### The three ways to run it

1. **In the browser alone.** The database is a SQLite file in your own browser, through
   the origin private file system. No account, no server, nothing over the network. The
   published address at app.cofre.ink is this: everybody who opens it gets an empty
   Cofre Ink inside their own browser, and the person who published it can read none of
   it.
2. **With a server of your own.** One container that carries the API and the interface,
   with accounts, shared spaces and invitations. SQLite in a file or a PostgreSQL you
   point it at.
3. **With a cloud you pay for.** The browser mode, keeping a copy in a file, a WebDAV
   folder, an online database or a spreadsheet you own.

### Stack and architecture

| layer | what it is |
| --- | --- |
| Interface | React 19, Vite 8, TanStack Router and Query, Tailwind 4, i18next, a service worker written by hand |
| Server | Hono, Zod, Better Auth, Node with no build step, reading the TypeScript directly |
| Storage | one repository layer over four adapters: SQLite as WebAssembly, `node:sqlite`, PGlite and PostgreSQL |
| Rules | plain TypeScript with no framework import |
| Tooling | pnpm workspaces, Turborepo, Biome, Vitest, Playwright, fast check |

The shape of it is one idea: **the screens never touch a database.** They talk to a
session, and a session is either the repository layer running in the browser or the same
repository layer running on a server, reached over HTTP. No screen knows which. That is
what lets the same product be a folder of static files and a server with accounts, and
it is why every permission check lives in one place rather than in every route.

The same conformance suite runs against all four adapters, including who is allowed to
see what, which is how an adapter is declared finished.

### Prerequisites

1. **Node 22 or newer.** On Node 22 the SQLite that ships with Node is behind a flag,
   which the scripts already pass. Node 24 needs nothing.
2. **pnpm 12 or newer.** The repository names the exact version it was built with in
   `packageManager`, so `corepack enable` is enough.
3. **Docker**, only for the server mode as a container.

### Running it locally

```bash
pnpm install
pnpm dev
```

That is the browser mode at `http://localhost:5174`, with the API also running at
`http://localhost:4321` for whoever wants to try the other mode. There is no password in
browser mode, so whoever opens your browser sees your data.

For the server, as a container:

```bash
cp .env.example .env    # then fill COFRE_SECRET
docker compose up -d
```

It answers on `http://localhost:4321` and serves the interface itself, so there is one
thing to run rather than two.

### Environment

Only the server needs any of this. The browser mode reads nothing from an environment.
Copy `.env.example`, which is commented line by line, and fill it in. No real value is
committed to this repository, and `.env` is ignored by Git.

| variable | required | what it is |
| --- | --- | --- |
| `COFRE_SECRET` | yes | signs the session cookies. At least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` |
| `COFRE_PORT` | no | where the API listens. Defaults to 4321 |
| `COFRE_DATABASE` | no | a path ending in `.db` for SQLite, or a `postgres://` address. Defaults to `./data/cofre.db` |
| `COFRE_WEB_ORIGIN` | no | where the interface is served from. The API accepts requests from here and builds invitation links with it |
| `COFRE_PUBLIC_URL` | no | the address this server answers on, as seen from outside |
| `COFRE_STATIC_DIR` | no | where the built interface sits, when the same process serves it. The container sets it |
| `COFRE_CLIENT_IP_HEADER` | no | the header a reverse proxy sets with the address of the real caller. Without it everybody behind the proxy counts as one caller for the limit on sign in attempts |
| `COFRE_PROOF_BITS` | no | how much work a caller does before this server reads a password. Defaults to 18. Zero turns it off |
| `COFRE_TURNSTILE_SITE_KEY` | no | a Cloudflare Turnstile widget on top of that work. Both keys or neither, and the server refuses to start with one of the two |
| `COFRE_TURNSTILE_SECRET` | no | the half of that pair that never leaves the server |
| `NODE_ENV` | no | `production` on a server |

One thing worth reading twice: if you use the interface published at app.cofre.ink with
a server of your own, put that address in `COFRE_WEB_ORIGIN` and serve your server over
https. Those are two different sites as a browser counts them, and the session cookie is
only written to travel between them when both of those are true.

### Scripts

| command | what it does |
| --- | --- |
| `pnpm dev` | the interface and the server, both watching |
| `pnpm build` | builds every package and the interface, and writes the service worker |
| `pnpm test` | the unit and property suites |
| `pnpm test:e2e` | the flows, in a real browser |
| `pnpm lint` | Biome, lint and format |
| `pnpm typecheck` | TypeScript across every package |
| `pnpm check` | lint, types, the writing rule and the two languages, which is what CI runs |
| `pnpm check:writing` | the writing rule on its own |
| `pnpm check:translations` | that the two languages hold the same keys |
| `pnpm --filter @cofre/web icons` | redraws every icon from the mark |

### Tests

```bash
pnpm test        # 1399 across six packages
pnpm test:e2e    # 90 flows in a real browser
```

The heaviest part is the storage layer, where 960 of those run the same conformance
suite against all four adapters, permissions included. The property tests use fast
check. The flows use Playwright, including two browsers that share nothing carrying a
space to each other through a file, and one that cuts the connection and reloads.

### Building and deploying

**The browser mode is a folder of static files.** `pnpm build` writes
`apps/web/dist`, and any host that can serve files will serve it. A `_redirects` file is
already in there for Netlify and Cloudflare Pages, and a `404.html` for hosts that read
that instead. The one thing worth adding by hand is a header, because a page cannot
refuse to be framed from inside itself:

```
X-Frame-Options: DENY
```

**The server mode is one container.** `docker compose up -d` builds it and runs it, with
the data in a named volume that survives an update of the image. For PostgreSQL instead
of SQLite, uncomment the database service in `compose.yaml` and point `COFRE_DATABASE`
at it.

### What is in each folder

```
apps/
  web/          the interface: screens, router, service worker, both languages
  server/       the API: routes, authentication, configuration, scheduled tidying
packages/
  core/         business rules in plain TypeScript: money, dates, the logical clock,
                the reading of one line of text, the findings over a household
  db/           the schema described once, generated for SQLite and for PostgreSQL,
                plus the migrations
  storage/      the repository layer, the four adapters, the one permission model,
                and the conformance suite every adapter has to pass
  importers/    readers for CSV, OFX, QIF, XLSX, JSON and PDF, and the pipeline that
                turns a statement into records somebody can review
  cloud/        where a copy can live: a file, WebDAV, an online database, a
                spreadsheet, and the public indices from the Banco Central
  ui/           design tokens, components, and charts drawn as SVG by hand
docs/
  adr/          every decision that is expensive to reverse, with what was rejected
  imagens/      the pictures used by this file
scripts/        the writing rule, the translations check, the icons, the service
                worker, the fallback page, the Git hooks
```

### Decisions

Every decision that is expensive to reverse is written down in
[docs/adr](docs/adr), with the options that were rejected and why. Thirty three of them,
from the monorepo to the way a projection is built. A few that shape everything else:

1. **Money is always an integer number of minor units.** Never a floating point number.
2. **Every row carries a space, and the permission check is in the repository layer.**
   No screen and no route reads data without going through it.
3. **Business rules live in `packages/core`**, in plain TypeScript with no framework
   import, which is why they are the most heavily tested part of this.
4. **Nothing leaves the device without an explicit action**, and the interface says so
   when it is about to.
5. **No hyphen as punctuation** in anything written for a person, checked in CI.

### Licence and contact

MIT. See [LICENSE](LICENSE).

Questions, bugs and ideas go to
[the issues](https://github.com/AndreiLud/app-cofre-ink/issues).

<a id="em_portugues"></a>

## Em português

Finanças pessoais para uma pessoa, um casal, uma família ou um grupo de amigos. Você
clona, você roda, e o banco de dados é seu: dentro do seu navegador, num servidor seu ou
numa nuvem que você paga. Sem conta com ninguém, sem telemetria, e nada sai do aparelho
sem você mandar.

| | |
| --- | --- |
| Site | [cofre.ink](https://cofre.ink) |
| Aplicativo | [app.cofre.ink](https://app.cofre.ink) |
| Repositório | [`AndreiLud/app-cofre-ink`](https://github.com/AndreiLud/app-cofre-ink) |

### O que ele faz

**Lançamentos.** Contas, cartões com ciclo de fatura de verdade, compras parceladas,
transferências, previsto e realizado. Um lançamento inteiro escrito numa linha só:
`mercado 42,90 ontem nubank 3x`.

**Organização.** Categorias em dois níveis, prioridade do gasto, e regras que
categorizam sozinhas e aprendem quando você corrige.

**O que se repete.** Séries que escrevem os próprios lançamentos, e um calendário do que
vence.

**Planejamento.** Limites por categoria ou por prioridade, a regra de guardar primeiro,
metas com data, e uma projeção dos próximos meses feita de três coisas separadas: o que
já está escrito, o que se repete, e como é um mês comum.

**Divisão.** Um espaço tem membros com papéis. Uma despesa se divide igual, por cota ou
por valor, e o acerto de contas diz quem deve para quem, uma vez só.

**Ler um extrato.** CSV, OFX, QIF, XLSX e JSON, mais um leitor de PDF escrito à mão para
faturas de cartão e comprovantes. A conta é adivinhada e a tela diz por quê. As colunas
ficam guardadas por formato de arquivo. Nada é gravado antes de você ver.

**Dizer alguma coisa de volta.** Achados sobre os seus próprios lançamentos, cada um com
as contas que o produziram dentro da frase: uma categoria bem acima do mês de sempre, um
limite indo mais rápido que o mês, o que se repete todo mês e quanto dá num ano, uma
assinatura que subiu de preço, a mesma cobrança duas vezes, a reserva medida em meses de
despesa comum. Nada sobre o que comprar ou onde colocar dinheiro.

**Ir embora.** Exporte tudo em JSON ou em planilha, restaure em qualquer instalação,
guarde uma cópia num arquivo, numa pasta WebDAV ou num banco de dados online, e espelhe
os lançamentos numa planilha do Google. Dois aparelhos combinam trocando um histórico de
alterações, por um servidor ou por um arquivo que você carrega.

**Sem internet.** A interface inteira fica guardada por um service worker, então ele
abre no metrô.

### As três formas de rodar

1. **Só no navegador.** O banco é um arquivo SQLite dentro do seu próprio navegador, no
   sistema de arquivos privado da origem. Sem conta, sem servidor, nada pela rede. O
   endereço publicado em app.cofre.ink é isto: cada pessoa que abre recebe um Cofre Ink
   vazio dentro do navegador dela, e quem publicou não lê nada.
2. **Com um servidor seu.** Um container que carrega a API e a interface, com contas,
   espaços compartilhados e convites. SQLite num arquivo ou um PostgreSQL que você
   aponta.
3. **Com uma nuvem que você paga.** O modo navegador, guardando uma cópia num arquivo,
   numa pasta WebDAV, num banco de dados online ou numa planilha sua.

### Stack e arquitetura

| camada | o que é |
| --- | --- |
| Interface | React 19, Vite 8, TanStack Router e Query, Tailwind 4, i18next, um service worker escrito à mão |
| Servidor | Hono, Zod, Better Auth, Node sem etapa de build, lendo o TypeScript direto |
| Armazenamento | uma camada de repositórios sobre quatro adaptadores: SQLite em WebAssembly, `node:sqlite`, PGlite e PostgreSQL |
| Regras | TypeScript puro, sem nenhum import de framework |
| Ferramentas | workspaces do pnpm, Turborepo, Biome, Vitest, Playwright, fast check |

O formato disto é uma ideia só: **as telas nunca tocam um banco de dados.** Elas falam
com uma sessão, e uma sessão é ou a camada de repositórios rodando no navegador, ou a
mesma camada rodando num servidor, alcançada por HTTP. Nenhuma tela sabe qual das duas
é. É isso que permite o mesmo produto ser uma pasta de arquivos estáticos e um servidor
com contas, e é por isso que toda checagem de permissão vive num lugar só em vez de
viver em cada rota.

A mesma suíte de conformidade roda contra os quatro adaptadores, permissões inclusive, e
é assim que um adaptador é considerado pronto.

### Pré requisitos

1. **Node 22 ou mais novo.** No Node 22 o SQLite que vem com o Node fica atrás de uma
   flag, que os scripts já passam. O Node 24 não precisa de nada.
2. **pnpm 12 ou mais novo.** O repositório declara a versão exata em `packageManager`,
   então `corepack enable` basta.
3. **Docker**, só para o modo servidor em container.

### Como rodar localmente

```bash
pnpm install
pnpm dev
```

Isso é o modo navegador em `http://localhost:5174`, com a API também de pé em
`http://localhost:4321` para quem quiser experimentar o outro modo. No modo navegador
não existe senha, então quem abrir o seu navegador vê os seus dados.

Para o servidor, em container:

```bash
cp .env.example .env    # depois preencha COFRE_SECRET
docker compose up -d
```

Ele responde em `http://localhost:4321` e serve a própria interface, então é uma coisa
para rodar em vez de duas.

### Variáveis de ambiente

Só o servidor precisa de alguma delas. O modo navegador não lê ambiente nenhum. Copie o
`.env.example`, que é comentado linha por linha, e preencha. Nenhum valor real está
neste repositório, e o `.env` é ignorado pelo Git.

| variável | obrigatória | o que é |
| --- | --- | --- |
| `COFRE_SECRET` | sim | assina os cookies de sessão. No mínimo 32 caracteres. Gere um com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` |
| `COFRE_PORT` | não | onde a API escuta. Padrão 4321 |
| `COFRE_DATABASE` | não | um caminho terminado em `.db` para SQLite, ou um endereço `postgres://`. Padrão `./data/cofre.db` |
| `COFRE_WEB_ORIGIN` | não | de onde a interface é servida. A API aceita requisições daqui e monta os links de convite com isto |
| `COFRE_PUBLIC_URL` | não | o endereço em que este servidor responde, visto de fora |
| `COFRE_STATIC_DIR` | não | onde está a interface compilada, quando o mesmo processo a serve. O container define isto |
| `COFRE_CLIENT_IP_HEADER` | não | o cabeçalho que o proxy reverso preenche com o endereço de quem chamou. Sem ele, todo mundo atrás do proxy conta como um só no limite de tentativas de login |
| `COFRE_PROOF_BITS` | não | quanto trabalho quem chama faz antes de este servidor ler uma senha. Padrão 18. Zero desliga |
| `COFRE_TURNSTILE_SITE_KEY` | não | um widget Turnstile da Cloudflare em cima desse trabalho. As duas chaves ou nenhuma: o servidor se recusa a subir com uma só |
| `COFRE_TURNSTILE_SECRET` | não | a metade do par que nunca sai do servidor |
| `NODE_ENV` | não | `production` num servidor |

Uma linha que vale ler duas vezes: se você usar a interface publicada em app.cofre.ink
com um servidor seu, ponha esse endereço em `COFRE_WEB_ORIGIN` e sirva o seu servidor em
https. Para o navegador, os dois são sites diferentes, e o cookie de sessão só é escrito
para viajar entre eles quando essas duas coisas são verdade.

### Scripts

| comando | o que faz |
| --- | --- |
| `pnpm dev` | a interface e o servidor, os dois observando |
| `pnpm build` | compila todos os pacotes e a interface, e escreve o service worker |
| `pnpm test` | as suítes de unidade e de propriedade |
| `pnpm test:e2e` | os fluxos, num navegador de verdade |
| `pnpm lint` | Biome, lint e formatação |
| `pnpm typecheck` | TypeScript em todos os pacotes |
| `pnpm check` | lint, tipos, a regra de escrita e os dois idiomas, que é o que a CI roda |
| `pnpm check:writing` | a regra de escrita sozinha |
| `pnpm check:translations` | que os dois idiomas têm as mesmas chaves |
| `pnpm --filter @cofre/web icons` | redesenha todos os ícones a partir da marca |

### Testes

```bash
pnpm test        # 1399 em seis pacotes
pnpm test:e2e    # 90 fluxos num navegador de verdade
```

A parte mais pesada é a camada de armazenamento, onde 960 deles rodam a mesma suíte de
conformidade contra os quatro adaptadores, permissões inclusive. Os testes de
propriedade usam fast check. Os fluxos usam Playwright, incluindo dois navegadores que
não compartilham nada levando um espaço de um para o outro por um arquivo, e um que
corta a conexão e recarrega a página.

### Build e publicação

**O modo navegador é uma pasta de arquivos estáticos.** O `pnpm build` escreve
`apps/web/dist`, e qualquer hospedagem que sirva arquivos serve isso. O `_redirects` já
está lá dentro para Netlify e Cloudflare Pages, e um `404.html` para as hospedagens que
leem isso. A única coisa que vale adicionar à mão é um cabeçalho, porque uma página não
consegue se recusar a ser enquadrada de dentro de si mesma:

```
X-Frame-Options: DENY
```

**O modo servidor é um container.** O `docker compose up -d` constrói e sobe, com os
dados num volume nomeado que sobrevive a uma atualização da imagem. Para PostgreSQL em
vez de SQLite, descomente o serviço de banco no `compose.yaml` e aponte o
`COFRE_DATABASE` para ele.

### O que existe em cada pasta

```
apps/
  web/          a interface: telas, rotas, service worker, os dois idiomas
  server/       a API: rotas, autenticação, configuração, a faxina agendada
packages/
  core/         regras de negócio em TypeScript puro: dinheiro, datas, o relógio
                lógico, a leitura de uma linha de texto, os achados sobre uma casa
  db/           o schema descrito uma vez, gerado para SQLite e para PostgreSQL,
                mais as migrações
  storage/      a camada de repositórios, os quatro adaptadores, o modelo único de
                permissão, e a suíte de conformidade que todo adaptador tem que passar
  importers/    leitores de CSV, OFX, QIF, XLSX, JSON e PDF, e o caminho que
                transforma um extrato em lançamentos para alguém revisar
  cloud/        onde uma cópia pode viver: um arquivo, WebDAV, um banco de dados
                online, uma planilha, e os índices públicos do Banco Central
  ui/           tokens de design, componentes, e gráficos desenhados em SVG à mão
docs/
  adr/          toda decisão cara de desfazer, com o que foi recusado
  imagens/      as imagens usadas por este arquivo
scripts/        a regra de escrita, a checagem de traduções, os ícones, o service
                worker, a página de fallback, os ganchos do Git
```

### Decisões

Toda decisão cara de desfazer está escrita em [docs/adr](docs/adr), com as alternativas
recusadas e o motivo. São trinta e três, do monorepo até o jeito de montar uma projeção.
Algumas que mandam em todo o resto:

1. **Dinheiro é sempre um número inteiro de centavos.** Nunca um número de ponto
   flutuante.
2. **Toda linha carrega um espaço, e a checagem de permissão fica na camada de
   repositórios.** Nenhuma tela e nenhuma rota lê dados sem passar por ela.
3. **As regras de negócio vivem em `packages/core`**, em TypeScript puro, e por isso são
   a parte mais testada do projeto.
4. **Nada sai do aparelho sem uma ação explícita**, e a tela avisa quando vai sair.
5. **Nenhum hífen como pontuação** em nada escrito para pessoas, verificado na
   integração contínua.

### Licença e contato

MIT. Veja [LICENSE](LICENSE).

Dúvidas, problemas e ideias vão para
[as issues](https://github.com/AndreiLud/app-cofre-ink/issues).
