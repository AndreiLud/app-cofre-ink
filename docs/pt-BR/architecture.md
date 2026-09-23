# Arquitetura

## A única ideia

**Nenhuma tela toca um banco de dados.**

Uma tela pede a uma sessão o que precisa. Uma sessão é um objeto com repositórios
dentro: `session.transactions.list(...)`, `session.spaces.create(...)`. Existem duas
implementações desse objeto e as telas não distinguem uma da outra.

1. **A sessão local.** A camada de repositórios roda no navegador, sobre um SQLite
   compilado para WebAssembly, dentro de um worker dedicado, escrevendo no sistema de
   arquivos privado da origem.
2. **A sessão remota.** As mesmas chamadas viram requisições HTTP, e a mesma camada de
   repositórios roda num servidor, sobre SQLite ou PostgreSQL.

Todo o resto decorre disso. O produto pode ser uma pasta de arquivos estáticos sem
servidor nenhum, ou um servidor com contas e espaços compartilhados, sem duas versões
de nada. Uma checagem de permissão é escrita uma vez em vez de uma vez por rota. Um bug
numa regra é corrigido num lugar só, para os dois modos.

```
   telas (apps/web)
        |
        |  uma interface, duas implementações
        v
   +----------------------+          +------------------------+
   | sessão local         |          | sessão remota          |
   | packages/storage     |          | fetch para apps/server |
   | dentro de um worker  |          |                        |
   +----------+-----------+          +-----------+------------+
              |                                  |
              v                                  v
     SQLite WASM no OPFS                 packages/storage de novo,
                                         sobre node:sqlite ou PostgreSQL
```

## Os pacotes

| pacote | o que guarda | o que nunca pode fazer |
| --- | --- | --- |
| `@cofre/core` | dinheiro, datas, o relógio lógico, identificadores, a leitura de um lançamento numa linha de texto, os achados sobre uma casa | importar um framework, ou tocar um banco |
| `@cofre/db` | o schema descrito uma vez como dado, gerado em DDL para SQLite e para PostgreSQL, e as migrações | rodar consultas |
| `@cofre/storage` | a camada de repositórios, os quatro adaptadores, o modelo de permissão, o histórico de alterações, a suíte de conformidade | saber o que é HTTP ou o que é React |
| `@cofre/importers` | leitores de CSV, OFX, QIF, XLSX, JSON e PDF, e o caminho que transforma um arquivo em lançamentos para revisar | gravar qualquer coisa |
| `@cofre/cloud` | onde uma cópia pode viver, e os índices públicos do Banco Central | guardar uma credencial |
| `@cofre/ui` | tokens de design, componentes, gráficos desenhados em SVG | saber o que é um lançamento |
| `apps/web` | telas, rotas, o worker, os dois idiomas, o service worker | conter uma regra de negócio |
| `apps/server` | rotas, autenticação, configuração, a faxina agendada | conter uma checagem de permissão |

As duas últimas linhas são as que custam mais caro para manter verdadeiras e as que
valem mais. Uma regra de negócio que vaza para uma tela existe no modo navegador e não
existe no servidor. Uma checagem de permissão que vaza para uma rota protege aquela
rota e mais nenhuma.

## Quatro adaptadores, uma suíte

| adaptador | motor | usado por |
| --- | --- | --- |
| `sqliteWasm` | `@sqlite.org/sqlite-wasm` com o sistema de arquivos virtual em pool, dentro de um worker | modo navegador |
| `nodeSqlite` | `node:sqlite` | um servidor com um arquivo |
| `pglite` | PostgreSQL compilado para WebAssembly | testes, e um servidor sem PostgreSQL |
| `postgres` | um PostgreSQL de verdade | um servidor com um |

Todos implementam uma interface `Driver`, e `packages/storage/src/conformance` é uma
suíte que roda contra cada um deles, permissões inclusive. Um adaptador está pronto
quando passa naquela suíte, e não antes. É ali que estão 960 dos 1399 testes deste
repositório.

O PostgreSQL ainda carrega row level security em cima, então um erro no código da
aplicação é pego pelo banco em vez de por ninguém.

## O schema é dado

O `packages/db` descreve cada tabela como um objeto: colunas, tipos, restrições, se
carrega um espaço, se é replicada. Dois geradores transformam essa descrição no DDL do
SQLite e no do PostgreSQL. Nada é escrito duas vezes, e uma coluna que exista em um e
não no outro não é possível.

Doze migrações, aplicadas em ordem, registradas numa tabela.

## Escrever, e o histórico de alterações

Toda escrita passa por um escritor só. Ele faz quatro coisas numa transação:

1. Carimba a linha com um relógio lógico, um híbrido de hora e contador, para que dois
   aparelhos que escreveram separados possam ser ordenados sem confiar no relógio de
   nenhum dos dois.
2. Escreve a linha.
3. Escreve uma entrada em `changes` descrevendo a escrita: qual entidade, qual
   identificador, qual operação, qual conteúdo, qual aparelho, qual autor.
4. Confirma.

Esse histórico é do que a sincronização é feita, e é por isso que ela foi desenhada
desde a primeira fase mesmo com o motor chegando só na fase 6. Um aparelho que ficou
longe manda o que escreveu e pede o que perdeu.

O histórico é compactado uma vez por dia por uma rotina de faxina, para não crescer
para sempre. A parte já assentada vira uma entrada por linha.

## A interface

React 19 com TanStack Router para endereços e TanStack Query para o que está em
trânsito. Tailwind 4 para estilo, com os tokens no `@cofre/ui`. Os dois idiomas por
i18next, com o idioma fora de uso baixado só quando alguém pede.

O banco roda num worker dedicado, então uma consulta sobre dez mil linhas não impede a
página de pintar.

Um service worker escrito à mão, gerado na hora do build a partir do que o build
realmente produziu. Tudo com um código no nome é guardado para sempre, a página em si é
pedida pela rede com a cópia guardada como reserva, e nada mais é guardado.

## O servidor

Hono, sobre Node, lendo o TypeScript direto, sem etapa de build. Zod valida toda
entrada na borda. O Better Auth é dono da identidade. As rotas são finas de propósito:
cada uma descobre quem está pedindo, abre uma sessão na camada de repositórios como
aquela pessoa, e chama um método.

Na frente das duas rotas que valem a pena atacar existe um portão: um desafio de prova
de trabalho que custa cerca de um segundo a quem chama e custa um hash ao servidor.
