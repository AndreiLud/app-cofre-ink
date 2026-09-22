# Cofre

Finanças pessoais para uma pessoa, um casal, uma família ou um grupo de amigos. Você
clona, você roda, e o banco de dados é seu: dentro do seu navegador, num servidor seu ou
numa nuvem que você paga. Sem conta com ninguém, sem telemetria, e nada sai do aparelho
sem você mandar.

A interface está em português e em inglês. O código e os registros de decisão estão em
inglês, e os documentos de produto, como este, em português.

![O painel, com o saldo, o que os números disseram e onde o dinheiro está](docs/imagens/painel.png)

## O que ele faz

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

**Dizer alguma coisa de volta.** Quinze achados sobre os seus próprios lançamentos, cada
um com as contas que o produziram dentro da frase: uma categoria bem acima do mês de
sempre, um limite indo mais rápido que o mês, o que se repete todo mês e quanto dá num
ano, uma assinatura que subiu de preço, a mesma cobrança duas vezes, a reserva medida em
meses de despesa comum. Nada sobre o que comprar ou onde colocar dinheiro.

**Ir embora.** Exporte tudo em JSON ou em planilha, restaure em qualquer instalação,
guarde uma cópia num arquivo, numa pasta WebDAV ou num banco de dados online, e espelhe os
lançamentos numa planilha do Google. Dois aparelhos combinam trocando um histórico de
alterações, por um servidor ou por um arquivo que você carrega.

**Sem internet.** A interface inteira fica guardada por um service worker, então ele
abre no metrô.

## Como rodar

Node 22 ou mais novo e pnpm 12 ou mais novo.

```bash
pnpm install
pnpm dev
```

Isso é o modo navegador: o banco é um arquivo SQLite dentro do seu navegador, não existe
conta e nada sai da máquina.

Para um servidor, com pessoas e espaços compartilhados:

```bash
cp .env.example .env    # depois preencha COFRE_SECRET
docker compose up -d
```

O guia completo é o [docs/instalar.md](docs/instalar.md): publicar o modo navegador em
qualquer hospedagem de arquivos, subir um servidor com SQLite ou PostgreSQL, fazer
backup, e onde ficam os dados em cada modo.

## Por dentro

```
apps/
  web/        React, Vite, TanStack Router e Query, Tailwind
  server/     Hono, Zod, Better Auth
packages/
  core/       regras de negócio, TypeScript puro, sem framework
  db/         o schema descrito uma vez, gerado para SQLite e PostgreSQL
  storage/    a camada de repositórios, quatro adaptadores, um modelo de permissão
  importers/  leitores de CSV, OFX, QIF, XLSX, JSON e PDF
  cloud/      onde uma cópia pode viver, e os índices públicos
  ui/         tokens, componentes e gráficos desenhados em SVG
```

Quatro adaptadores de armazenamento e uma suíte só. SQLite em WebAssembly no navegador,
`node:sqlite` no servidor, PGlite e um PostgreSQL de verdade. A mesma suíte roda contra
todos, inclusive as permissões, e é assim que um adaptador é considerado pronto.

## Decisões

Toda decisão cara de desfazer está escrita em `docs/adr`, com as alternativas recusadas
e o motivo. São vinte e duas, do monorepo até o jeito de montar uma projeção. Algumas
que mandam em todo o resto:

1. **Dinheiro é sempre um número inteiro de centavos.** Nunca um número de ponto
   flutuante.
2. **Toda linha carrega um espaço, e a checagem de permissão fica na camada de
   repositórios.** Nenhuma tela e nenhuma rota lê dados sem passar por ela.
3. **As regras de negócio vivem em `packages/core`**, em TypeScript puro, e por isso são
   a parte mais testada do projeto.
4. **Nada sai do aparelho sem uma ação explícita**, e a tela avisa quando vai sair.
5. **Nenhum hífen como pontuação** em nada escrito para pessoas, verificado na
   integração contínua.

## Testes

```bash
pnpm test        # 1190 nos pacotes
pnpm test:e2e    # 68 fluxos num navegador de verdade
pnpm check       # lint, tipos, a regra de escrita e os dois idiomas
```

Os testes de propriedade usam fast check. Os fluxos usam Playwright, incluindo dois
navegadores que não compartilham nada levando um espaço de um para o outro por um
arquivo, e um que corta a conexão e recarrega a página.

## Licença

MIT. Veja [LICENSE](LICENSE).
