# Prova de conceito: SQLite no navegador com OPFS

Registro do experimento que sustenta o modo navegador e a demo pública. A decisão
está no registro 0002, aqui ficam as evidências.

## A pergunta

O GitHub Pages não deixa definir cabeçalhos de resposta. Sem os dois cabeçalhos de
isolamento de origem, a página não tem `SharedArrayBuffer`, e o backend clássico de
OPFS do SQLite depende dele. A pergunta era se o outro backend, o pool de
identificadores de acesso síncrono, funciona nessas condições.

## Como foi testado

Uma página estática servida por `scripts/spikeServer.mjs`, que entrega arquivos
comuns, define o tipo correto para `.wasm` e não envia nenhum cabeçalho de
isolamento. É o mesmo comportamento do GitHub Pages. O código do experimento está em
`spike/opfsSqlite`, e roda dentro de um worker dedicado, como o aplicativo vai rodar.

Para repetir:

```
pnpm run spike:opfs
```

A página abre o banco, cria o esquema, registra uma linha na tabela `runs` a cada
abertura, insere cinco mil lançamentos numa transação, agrega tudo por mês e mostra
os tempos.

## Resultado

Ambiente, idêntico nas duas execuções:

| medida | valor |
| --- | --- |
| versão do SQLite | 3.53.4 |
| isolamento de origem | não |
| SharedArrayBuffer | ausente |
| OPFS | disponível |
| acesso síncrono a arquivo | disponível |
| backend do pool | presente |

Tempos, em milissegundos:

| medida | banco vazio | banco com cinco mil linhas |
| --- | --- | --- |
| carregar o wasm | 45,9 | 68,5 |
| instalar o backend | 32,3 | 25,3 |
| abrir o banco | 6,0 | 8,8 |
| inserir cinco mil linhas | 195,2 | 752,1 |
| agregar por mês | 8,9 | 63,5 |
| tamanho do arquivo | 992 kB | 1904 kB |

Persistência: na segunda abertura a tabela `runs` marcou duas execuções e as cinco mil
linhas da primeira estavam lá, virando dez mil no total.

## Leitura dos números

1. A resposta é sim. O banco persiste sem isolamento de origem, então a demo no
   GitHub Pages é viável e o modo navegador está de pé.
2. Dez mil lançamentos são cerca de cinco anos da vida financeira de uma pessoa.
   Agregar esse volume inteiro leva 63 ms, dentro de um worker, sem travar a tela.
3. A inserção ficou quase quatro vezes mais lenta na segunda rodada porque o índice
   cresceu e o arquivo precisou crescer junto. Não é um problema de uso real, onde se
   insere um lançamento por vez, mas é um número a vigiar na importação de extratos,
   que insere em lote. A importação vai usar transações grandes e criar os índices
   depois da carga.
4. O arquivo ocupa cerca de 190 bytes por lançamento. Um histórico longo cabe
   folgadamente na cota de armazenamento de um navegador.

## O que ainda não foi verificado

1. O teste rodou em navegador baseado em Chromium. Firefox e Safari suportam as APIs
   necessárias, mas a verificação nesses dois vai acontecer quando a demo subir, na
   Fase 9, e o aplicativo faz checagem de capacidade em tempo de execução para cair
   no plano B se algo faltar.
2. Navegador em janela anônima e com armazenamento bloqueado pelo usuário ainda
   precisam de teste. A tela de onboarding vai avisar que apagar os dados do site
   apaga o banco, e vai oferecer exportação.
