# Samples

Real card invoices and bank statements, kept here while the statement reader is taught an
institution. **Nothing in this folder is ever committed**: git ignores everything in it except
this file, and `scripts/checkRepository.mjs` refuses a statement or a backup anywhere in the
repository. The layouts the tests read are invented, written in code by `buildPdf` in
`packages/importers`, so the repository never needs a real document.

Even so, take out the name, the CPF and the account number before a file goes in. A folder that
is ignored today is a folder somebody copies tomorrow.

## How a sample is laid out

One folder per institution, named in lowercase letters: `nubank`, `itau`, `inter`, `c6`. Each
document is a PDF with a JSON file of the same name beside it, saying what the document holds,
which is what a test compares the reading against:

```json
{
  "kind": "invoice",
  "institution": "nubank",
  "digits": ["1234"],
  "dueOn": "2026-10-10",
  "total": 13000,
  "entries": [
    { "day": "2026-09-12", "description": "Padaria", "amount": -1840 },
    { "day": "2026-09-14", "description": "Estorno Loja X", "amount": 5000 }
  ],
  "sum": -13000
}
```

`kind` is `invoice` or `statement`. `digits` are the last four digits of every card the document
names. `entries` are the lines as the bank meant them, in cents, money out negative. `total` is
what the document prints as its total, and `sum` is what the entries add up to, so a test can
tell a line that was misread from a total that does not add up.

## What only real samples can decide

The invented layouts settle everything the code can reason about. Three things only a real
document can settle, and they wait for samples:

1. Whether a plus sign on an invoice means a purchase or a credit, at each bank.
2. Columns side by side, where a value under "Débito" and one under "Crédito" sit on the same
   line.
3. The hints per institution of phase 7: the words and positions each bank uses for its total,
   its due day and its sections.

The test that reads this folder is `packages/importers/src/samples.test.ts`. It finds the folder
from its own path, and with nothing here but this file it is skipped and says so.

# Amostras

Faturas de cartão e extratos de verdade, guardados aqui enquanto o leitor aprende uma
instituição. **Nada desta pasta entra em commit**: o git ignora tudo nela menos este arquivo, e o
`scripts/checkRepository.mjs` recusa um extrato ou um backup em qualquer lugar do repositório. Os
layouts que os testes leem são inventados, escritos em código pelo `buildPdf` em
`packages/importers`, então o repositório nunca precisa de um documento real.

Mesmo assim, tire o nome, o CPF e o número da conta antes de um arquivo entrar aqui. Uma pasta
ignorada hoje é uma pasta que alguém copia amanhã.

## Como uma amostra fica

Uma pasta por instituição, com o nome em letras minúsculas: `nubank`, `itau`, `inter`, `c6`. Cada
documento é um PDF com um JSON do mesmo nome ao lado, dizendo o que o documento traz, que é o que
um teste compara com a leitura. O formato é o do exemplo acima.

`kind` é `invoice` (fatura) ou `statement` (extrato). `digits` são os quatro últimos dígitos de
cada cartão que o documento cita. `entries` são as linhas como o banco quis dizer, em centavos,
com saída negativa. `total` é o que o documento imprime como total, e `sum` é o que as linhas
somam, para um teste separar uma linha mal lida de um total que não fecha.

## O que só amostras de verdade decidem

Os layouts inventados resolvem tudo o que o código consegue pensar. Três coisas só um documento
real resolve, e elas esperam as amostras:

1. Se um sinal de mais numa fatura quer dizer compra ou crédito, em cada banco.
2. Colunas lado a lado, em que um valor sob "Débito" e outro sob "Crédito" ficam na mesma linha.
3. As dicas por instituição da fase 7: as palavras e as posições que cada banco usa para o
   total, o vencimento e as seções.

O teste que lê esta pasta é o `packages/importers/src/samples.test.ts`. Ele acha a pasta pelo
próprio caminho e, só com este arquivo aqui, é pulado e diz isso.
