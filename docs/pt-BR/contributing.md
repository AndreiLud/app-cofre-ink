# Contribuir

## Preparar

```bash
git clone https://github.com/AndreiLud/app-cofre-ink
cd app-cofre-ink
pnpm install
pnpm dev
```

O `pnpm install` também instala os ganchos do Git. Eles rodam o Biome no que está
preparado, a regra de escrita e a checagem de traduções antes de todo commit, e a regra
de escrita de novo sobre a mensagem do commit.

## Antes de enviar

```bash
pnpm check      # lint, tipos, a regra de escrita, os dois idiomas
pnpm test       # as suítes de unidade e de propriedade
pnpm test:e2e   # os fluxos, num navegador de verdade
```

A CI roda tudo isso no Node 22 e no Node 24.

## As regras que não se negociam

### A regra de escrita

**Nenhum hífen, travessão ou traço como pontuação, como marcador de lista, ou para
juntar palavras**, em nada escrito para uma pessoa: documentos, texto de interface,
mensagens de erro, comentários de código, mensagens de commit, pull requests. Use
vírgula, dois pontos, ponto, parênteses, ou reescreva a frase. Listas são numeradas ou
viram prosa.

Dentro de um trecho de código, de um bloco cercado ou do destino de um link é
permitido, porque aquilo não é prosa. Um nome que identifica alguma coisa pode carregar:
o repositório se chama `app-cofre-ink`, e uma flag de linha de comando se escreve do
jeito que o comando espera.

O `node scripts/checkWriting.mjs` aplica isso, na CI e antes de todo commit. O motivo
está no [registro 0007](../adr/0007_language_and_writing_rule.md).

### Dinheiro é um número inteiro de centavos

Nunca um número de ponto flutuante, em lugar nenhum, por motivo nenhum. O
`packages/core` tem as primitivas.

### Toda linha carrega um espaço, e a checagem fica na camada de repositórios

Não numa tela, não numa rota. Se você está acrescentando um método de repositório, ele
nomeia a permissão que precisa, e essa permissão existe na matriz de
`packages/storage/src/actor.ts`. A suíte de conformidade falha se não existir.

### As regras de negócio vivem no `packages/core`

TypeScript puro, sem nenhum import de framework. Se uma regra está num componente, ela
existe no modo navegador e não existe no servidor.

### Nenhum segredo no repositório

O `.env.example` é completo e comentado, sem nenhum valor real. O `.env` é ignorado.

### Nenhuma telemetria

Nada sai do aparelho ou do servidor do dono sem uma ação explícita, e a interface avisa
quando vai sair.

## Convenções

1. **TypeScript estrito em tudo.** Nenhum `any` que sobreviva a uma revisão.
2. **Nomes de arquivo em camelCase**, componentes React em PascalCase, pastas em
   minúsculas.
3. **Tabelas e colunas em snake_case em inglês**: `spaces`, `space_id`.
4. **Uma data que significa um dia do calendário** é texto no formato ISO. Um instante é
   um inteiro de milissegundos em UTC.
5. **Commits seguem Conventional Commits, em inglês**, pequenos e frequentes:
   `feat: add recurring bills engine`.
6. **Todo gráfico vem com um título que diz o achado**, e uma tabela dizendo a mesma
   coisa.
7. **Acessibilidade é WCAG 2.2 AA.** Teclado primeiro, foco visível, movimento reduzido
   respeitado.
8. **Comentários dizem por quê, não o quê.** O código já diz o quê.

## Onde cada coisa vai

| você está acrescentando | vai em |
| --- | --- |
| um cálculo sem dependências | `packages/core` |
| uma tabela ou uma coluna | `packages/db`, com uma migração |
| um jeito de ler ou gravar dados | `packages/storage`, com uma permissão e um teste de conformidade |
| um leitor de formato de arquivo | `packages/importers` |
| um lugar onde uma cópia pode viver | `packages/cloud` |
| um componente ou um gráfico | `packages/ui` |
| uma tela | `apps/web/src/pages` |
| uma rota | `apps/server/src/app.ts`, três linhas, sem checagem de permissão |

## Acrescentar um método de repositório

1. Escreva no repositório certo em `packages/storage/src/repositories`.
2. Nomeie a permissão que ele precisa e acrescente à matriz em `actor.ts` se for nova.
3. Acrescente à suíte de conformidade, que o roda contra os quatro adaptadores.
4. Acrescente à sessão remota em `apps/web/src/storage/remoteSession.ts` e à rota em
   `apps/server/src/app.ts`, para que os dois modos tenham.

O passo 4 é o que as pessoas esquecem. Um método que existe só localmente é uma tela que
funciona no modo navegador e quebra num servidor.

## Acrescentar texto de interface

Toda string vive em `apps/web/src/locales/pt.json` e `en.json`. Os dois arquivos têm as
mesmas chaves, conferido pelo `pnpm check:translations`.

O nome do produto nunca é escrito. Diga `{{app}}` e ele é preenchido a partir de uma
constante só.

## Escrever um registro de decisão

Qualquer coisa cara de desfazer ganha um, em `docs/adr`, numerado em ordem. Ele diz o
que foi decidido, quais eram as opções, por que as outras foram recusadas, e quanto
custaria mudar depois. Se uma decisão é substituída, o registro antigo é emendado em vez
de apagado: um registro editado para parecer certo nunca foi um registro.

## Relatar alguma coisa

[As issues](https://github.com/AndreiLud/app-cofre-ink/issues). Para um defeito, o que
mais ajuda é dizer em qual dos três modos você estava, e o que a tela disse. Nunca cole
um backup ou um extrato: eles são o seu dinheiro, por inteiro.
