# API

Só o servidor tem uma. O modo navegador chama a mesma camada de repositórios direto,
dentro de um worker, e não faz requisição nenhuma.

Tudo é JSON. Todo corpo é validado por Zod na borda. A checagem de permissão nunca está
aqui: ela está na camada de repositórios, e é por isso que uma rota tem três linhas.

## Antes de você entrar

| método | caminho | o que faz |
| --- | --- | --- |
| `GET` | `/health` | responde `{"ok": true}`. É o que o healthcheck do container pergunta |
| `GET` | `/api/setup` | se este servidor já tem alguém, e a chave pública do Turnstile se houver uma configurada |
| `GET` | `/api/challenge` | um desafio de prova de trabalho. Qualquer um pode pedir |
| `GET` | `/api/invitations/:token` | o que um convite oferece, para quem ainda não tem conta |
| `GET` `POST` | `/api/auth/*` | cadastrar, entrar, sair e o resto, tratado pelo Better Auth |

Todo o resto exige sessão e responde `401 {"error": "signedOut"}` sem uma.

## Espaços e pessoas

| método | caminho | o que faz |
| --- | --- | --- |
| `GET` | `/api/me` | quem você é e quais espaços você pode ler |
| `GET` | `/api/peers` | todo mundo com quem você divide algum espaço |
| `GET` | `/api/spaces/:id/people` | todo mundo de um espaço, que é entre quem uma divisão acontece |
| `GET` `POST` | `/api/spaces` | listar, criar |
| `PATCH` `DELETE` | `/api/spaces/:id` | renomear ou recolorir, remover |
| `POST` | `/api/spaces/:id/adopt` | adotar um espaço que chegou de um aparelho e não tem ninguém |
| `POST` | `/api/spaces/:id/empty` | as linhas de um espaço, apagadas, com o espaço e os membros de pé |
| `DELETE` | `/api/spaces/:id/data` | esvaziar um espaço, e removê lo se for compartilhado |
| `POST` | `/api/erase` | todo espaço que esta conta possui |
| `GET` | `/api/spaces/:id/members` | quem está nele |
| `PATCH` `DELETE` | `/api/spaces/:id/members/:userId` | mudar papel ou renda declarada, remover |
| `POST` | `/api/spaces/:id/leave` | sair de um espaço |
| `GET` `POST` | `/api/spaces/:id/invitations` | listar, criar |
| `DELETE` | `/api/spaces/:id/invitations/:invitationId` | revogar |
| `POST` | `/api/invitations/:token/accept` | entrar |

## Dinheiro

| método | caminho | o que faz |
| --- | --- | --- |
| `GET` `POST` | `/api/spaces/:id/accounts` | listar, criar. `?archived=true` inclui arquivadas |
| `PATCH` `DELETE` | `/api/accounts/:id` | editar, remover. O nome, onde ela fica, o saldo de abertura, o valor mensal de um cartão de benefício, e o dia de fechamento, o de vencimento e o limite de um cartão de crédito |
| `POST` | `/api/accounts/:id/archive` e `/unarchive` | guardar, trazer de volta |
| `GET` | `/api/accounts/:id/benefit` | quanto resta num cartão de benefício, calculado e não guardado. Precisa de `today`. Nada para uma conta sem valor mensal, e nada para quem só vê os próprios lançamentos |
| `GET` | `/api/accounts/:id/records` | quantos lançamentos estão nela, que é o que fica sem lugar se ela for apagada. Conta o que quem pergunta pode ver |
| `GET` `POST` | `/api/spaces/:id/cards` | listar, criar |
| `PATCH` `DELETE` | `/api/cards/:id` | editar, remover. O tipo não pode mudar |
| `POST` | `/api/cards/:id/archive` e `/unarchive` | guardar, trazer de volta |
| `GET` `POST` | `/api/spaces/:id/transactions` | listar com filtros, criar |
| `GET` | `/api/spaces/:id/balances` | o saldo de cada conta. Precisa de `today`, porque um lançamento conta quando é fato e o dia dele chegou |
| `PATCH` | `/api/transactions` | a mesma mudança sobre uma seleção, até 500 |
| `POST` | `/api/transactions/remove` | remover uma seleção |
| `PATCH` `DELETE` | `/api/transactions/:id` | editar, remover |
| `PATCH` | `/api/transactions/:id/onwards` | a mesma mudança nesta parcela e em todas as seguintes. Nunca nas anteriores, e nunca no dia. Responde quantas parcelas mudou |
| `POST` | `/api/transactions/:id/settle` | previsto vira realizado |
| `POST` | `/api/transactions/:id/reconcile` | marcar como batendo com o extrato |
| `POST` | `/api/transactions/:id/invoice/move` | uma fatura antes ou depois, com todas as parcelas do plano. Todas ou nenhuma |
| `DELETE` | `/api/installments/:groupId` | o conjunto inteiro de parcelas |

Os filtros da listagem são parâmetros de consulta: `accountId`, `cardId`, `kind`,
`status`, `from`, `to`, `invoiceMonth`, `search`, `categoryIds` como lista separada por
vírgula, `withoutCategory`, `externalIds`, `order` como `oldestFirst`, `limit` e `offset`. A
ordem fica na consulta e não depois dela, porque o limite é aplicado pelo banco: quem pega os
vinte mais novos e ordena ao contrário está mostrando os vinte mais distantes.

## Os cartões

Uma fatura é tudo o que um cartão vai cobrar, de quem quer que tenha comprado, então toda
rota daqui fecha para quem só vê os lançamentos que escreveu.

| método | caminho | o que faz |
| --- | --- | --- |
| `GET` | `/api/accounts/:id/invoices` | cada fatura de um cartão, da mais antiga para a mais nova, com o que ela cobrou, o que foi pago e o que falta. Precisa de `today` |
| `GET` | `/api/accounts/:id/invoices/:month` | uma fatura, tenha algo nela ou não. Precisa de `today` |
| `GET` | `/api/spaces/:id/invoices` | onde cada cartão do espaço está: a fatura aberta, a que fechou e não foi paga, o que as parcelas vão cobrar depois, e o limite que sobra. Precisa de `today` |
| `POST` | `/api/accounts/:id/invoices/pay` | paga uma, como transferência para o cartão marcada com a fatura que ela paga. O valor é o que a pessoa escreveu, então dá para pagar parte da fatura |
| `POST` | `/api/accounts/:id/invoices/paidUntil` | escreve um pagamento para cada fatura até um mês, cada um no dia em que ela venceu, para um cartão que já era usado antes de tudo isso |
| `POST` | `/api/accounts/:id/invoices/closedOn` | diz em que dia a fatura fechou de verdade, e move cada compra dos dias entre uma data e outra para a fatura à qual ela pertence. Todas ou nenhuma |

## Organizar, repetir, planejar

| método | caminho | o que faz |
| --- | --- | --- |
| `GET` `POST` | `/api/spaces/:id/categories` | listar, criar |
| `POST` | `/api/spaces/:id/categories/defaults` | o conjunto inicial, escrito uma vez e só num espaço que não tem nenhuma |
| `PATCH` `DELETE` | `/api/categories/:id` | editar, remover. O tipo não pode mudar |
| `POST` | `/api/categories/:id/archive` e `/unarchive` | guardar, trazer de volta |
| `GET` `POST` | `/api/spaces/:id/rules` | listar, criar |
| `POST` | `/api/spaces/:id/rules/apply` | rodar as regras sobre o que ninguém categorizou |
| `PATCH` `DELETE` | `/api/rules/:id` | editar, remover |
| `GET` `POST` | `/api/spaces/:id/recurrences` | listar, criar |
| `POST` | `/api/spaces/:id/recurrences/materialize` | escrever os lançamentos previstos que as séries devem |
| `PATCH` `DELETE` | `/api/recurrences/:id` | editar, remover. `?keepPlanned=true` deixa o que já foi escrito |
| `GET` `POST` | `/api/spaces/:id/budgets` | listar, criar |
| `GET` | `/api/spaces/:id/budgets/progress` | como cada limite está indo. Precisa de `month` |
| `PATCH` `DELETE` | `/api/budgets/:id` | editar, remover |
| `GET` `POST` | `/api/spaces/:id/goals` | listar, criar |
| `GET` | `/api/spaces/:id/goals/progress` | como cada meta está indo. Precisa de `today` |
| `PATCH` `DELETE` | `/api/goals/:id` | editar, remover |
| `POST` | `/api/goals/:id/achieved` | alcançada |
| `GET` `POST` `DELETE` | `/api/spaces/:id/savings` | a regra de guardar primeiro |
| `GET` | `/api/spaces/:id/savings/progress` | se ela foi cumprida no mês |
| `POST` | `/api/spaces/:id/transfer` | passa o espaço para outro membro. Só o dono, que passa a administrador |
| `GET` `POST` | `/api/spaces/:id/filters` | filtros salvos, privados de quem salvou |
| `PATCH` `DELETE` | `/api/filters/:id` | editar, remover |

## Divisão

| método | caminho | o que faz |
| --- | --- | --- |
| `GET` `POST` `DELETE` | `/api/transactions/:id/splits` | como uma despesa é dividida. Uma parte vai pelo identificador, em `shares`, e nunca pela posição |
| `GET` | `/api/spaces/:id/sharing/balances` | quem deve o quê, no total |
| `GET` | `/api/spaces/:id/sharing/suggested` | o menor número de pagamentos que fecha |
| `GET` `POST` | `/api/spaces/:id/sharing/settlements` | pagamentos já registrados, registrar um |
| `DELETE` | `/api/settlements/:id` | esquecer um pagamento |

## Ler os números de volta

| método | caminho | o que faz |
| --- | --- | --- |
| `GET` | `/api/reports` | uma rota para todo relatório. `kind` é totals, byCategory, incomeByCategory, byPriority, byMonth ou byDay. Precisa de `from` e `to` |
| `GET` | `/api/spaces/:id/advice` | os achados, do mais pesado ao mais leve. Precisa de `today` |
| `GET` | `/api/spaces/:id/reading` | o veredito e os quatro sinais vitais. Precisa de `today` |
| `GET` | `/api/spaces/:id/projection` | os meses à frente. Precisa de `from` como mês e de `today` como dia, que é até onde o saldo de abertura é contado e o que decide quais faturas ainda estão em aberto |
| `GET` `POST` | `/api/spaces/:id/scenarios` | ajustes salvos sobre uma projeção |
| `PATCH` `DELETE` | `/api/scenarios/:id` | editar, remover |

Seis relatórios passam por uma rota só de propósito: seis rotas que diferissem por uma
palavra seriam seis lugares para esquecer a mesma checagem de permissão.

## Investimentos e índices

| método | caminho | o que faz |
| --- | --- | --- |
| `GET` `POST` | `/api/spaces/:id/holdings` | listar, criar |
| `GET` | `/api/spaces/:id/holdings/total` | quanto dá tudo |
| `PATCH` `DELETE` | `/api/holdings/:id` | editar, remover |
| `POST` | `/api/holdings/:id/price` | digitar um preço, para um dia |
| `GET` | `/api/holdings/:id/prices` | os preços digitados até agora |
| `GET` | `/api/indices` | CDI, Selic ou IPCA, por mês |
| `GET` | `/api/indices/latest` | o mais recente de cada |
| `POST` | `/api/indices/refresh` | pedir ao Banco Central os meses que esta instalação não tem |

A atualização é feita pelo servidor e não pelo navegador: uma busca serve todo mundo
daquele servidor, e um navegador nunca precisa ter permissão de chamar o endereço de
outra pessoa. Os nomes das séries vêm de uma lista fixa, então não há nada para onde
quem chama possa apontar.

## Arquivos para dentro e para fora

| método | caminho | o que faz |
| --- | --- | --- |
| `GET` | `/api/spaces/:id/imports/existing` | o que o espaço já tem em volta dos dias que um arquivo cobre, para achar repetição |
| `POST` | `/api/spaces/:id/imports` | gravar lançamentos revisados, até 3000 por vez |
| `GET` | `/api/backup/spaces` | de quais espaços esta pessoa pode tirar cópia |
| `GET` | `/api/spaces/:id/backup` e `/api/backup` | um espaço, ou tudo. `?spaces=a,b` para os que foram marcados |
| `GET` | `/api/spaces/:id/records` | só os lançamentos, para uma planilha |
| `POST` | `/api/backup/restore` | restaurar. O corpo é o arquivo, e um `only` opcional diz quais espaços dele trazer. Quem está logado vira dono do que restaurou |
| `GET` | `/api/spaces/:id/changes` | o histórico depois de um carimbo |
| `POST` | `/api/spaces/:id/sync` | uma ida e volta: empurra o que este aparelho escreveu, puxa o que ele não viu |

## O que volta quando algo está errado

| status | corpo | quando |
| --- | --- | --- |
| `400` | `{"error": "invalidInput", "issues": [...]}` | o Zod recusou o corpo ou a consulta |
| `400` | `{"error": "proofRequired"}` | o portão na frente do login não foi respondido |
| `400` | `{"error": "captchaRequired"}` | o Turnstile está ligado e a resposta não foi aceita |
| `401` | `{"error": "signedOut"}` | sem sessão |
| `403` | `{"error": "notAllowed", "permission": "..."}` | um membro cujo papel não permite |
| `403` | `{"error": "profileBelongsToAnAccount"}` | um aparelho tentou escrever em nome de alguém que tem conta ali |
| `404` | `{"error": "notFound", "entity": "..."}` | não existe, ou é um espaço do qual você não é membro |
| `409` | `{"error": "<a regra>", "message": "..."}` | uma regra do modelo recusou |
| `413` | `{"error": "refused", "status": 413}` | um corpo acima de 25MB |
| `500` | `{"error": "unexpected"}` | qualquer outra coisa. O detalhe vai para o log e não para quem chamou |

A diferença entre `403` e `404` é deliberada. Quem não está num espaço ouve que ele não
existe.
