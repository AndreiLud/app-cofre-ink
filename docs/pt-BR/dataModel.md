# Modelo de dados

## Quatro regras que valem em tudo

1. **Dinheiro é um número inteiro de centavos.** Nunca um número de ponto flutuante. Um
   valor carrega uma moeda, e um lançamento em outra moeda guarda a taxa usada na
   época. O padrão é BRL.
2. **Toda linha que pertence a alguém carrega `space_id`, não nulo.** A checagem de
   permissão fica na camada de repositórios, nunca numa tela e nunca numa rota.
3. **Uma data que significa um dia do calendário é texto no formato ISO**,
   `2026-09-23`. Um instante é um inteiro de milissegundos em UTC. Os dois nunca se
   misturam, porque um dia do calendário não tem fuso e um instante não tem outra coisa.
4. **Identificadores são UUID versão 7.** Eles ordenam pela hora em que foram feitos,
   então um índice na chave primária é um índice por idade, e dois aparelhos criando
   linhas separados nunca colidem.

Toda tabela e toda coluna é snake_case em inglês: `spaces`, `transactions`, `space_id`.

## As tabelas

### Pessoas e espaços

| tabela | o que guarda |
| --- | --- |
| `users` | uma linha por pessoa. No modo servidor é mantida em passo com as tabelas de autenticação. No modo navegador é local e não pertence a ninguém além daquele navegador |
| `spaces` | um espaço é a caixa onde todo o resto vive. `kind` é `personal` ou `shared`. Um espaço pessoal não pode ser compartilhado, e existe um por pessoa |
| `space_members` | quem está num espaço e como. `role` é owner, admin, editor, viewer ou logger. `state` é invited, active ou removed |
| `space_invitations` | um token, o papel que ele concede, opcionalmente o endereço a que se destinava, e quando deixa de funcionar |

### Dinheiro

| tabela | o que guarda |
| --- | --- |
| `accounts` | corrente, poupança, dinheiro, crédito, benefício ou investimento. Uma conta de crédito carrega o dia de fechamento, o de vencimento e o limite. Uma conta de benefício carrega qual pote é: refeição, transporte, cultura ou mobilidade, e o que cai nela: `quota_amount`, `quota_day` e `quota_carries`, que dizem o valor mensal, o dia do mês em que ele cai e se o que sobra passa para o período seguinte |
| `cards` | um cartão é um jeito de alcançar uma conta e não uma conta. Crédito, débito, múltiplo, benefício ou pré pago. Um múltiplo aponta para duas contas, uma de cada lado |
| `transactions` | receita, despesa ou transferência. O valor é sempre positivo e a direção vem do tipo. Previsto ou realizado. Parcelas compartilham um grupo, para que o conjunto possa ser desfeito de uma vez. O `invoice_month` diz em qual fatura do cartão ele caiu, calculado a partir do dia de fechamento da conta, e o `invoice_month_by_hand` diz que uma pessoa escolheu, em vez de ter sido calculado, o que vale para o pagamento de uma fatura e para uma compra movida porque o banco fechou um dia antes ou depois |
| `categories` | dois níveis, com `parent_id` para o segundo. Cada uma carrega uma prioridade de gasto: essencial, importante, desejável ou supérflua |
| `categorization_rules` | o texto a casar, e o que definir quando casar. Ordenadas, e cada uma pode ser desligada sem ser apagada |
| `recurrences` | uma série que escreve os próprios lançamentos. Semanal, mensal ou anual, com início, fim opcional e dia do mês opcional |

### Plano e divisão

| tabela | o que guarda |
| --- | --- |
| `budgets` | um limite, sobre o espaço inteiro, sobre uma prioridade ou sobre uma categoria, para um mês ou para todo mês |
| `goals` | um nome, um valor, uma conta que o guarda, e opcionalmente uma data |
| `savings_rules` | a promessa de separar uma porcentagem ou um valor fixo antes de qualquer coisa |
| `expense_splits` | quem deve qual parte de uma despesa, dividida igual, por cota ou por renda |
| `settlements` | um pagamento de uma pessoa para outra, que fecha parte do que as divisões abriram |

### Investimentos e os meses à frente

| tabela | o que guarda |
| --- | --- |
| `holdings` | o que alguém tem, como um produto do catálogo de `packages/core` (caixinha, CDB, ação), dentro de uma conta de investimento. A quantidade, escalada por dez à oitava para que um fundo possa ter frações de cota, e o custo são a abertura; os campos próprios do produto (emissor, vencimento, indexador, taxa, liquidez, dia do aniversário) são colunas opcionais |
| `holding_moves` | dinheiro que entrou numa aplicação, saiu dela ou foi pago por ela, num dia, com as unidades quando há unidades e o lançamento que levou o dinheiro de uma conta ou para ela, gravado junto |
| `holding_prices` | um preço ou um valor digitado para uma aplicação num dia. Digitado à mão, de propósito: sem cotação automática, sem contar a ninguém de fora o que a pessoa tem. O valor digitado sempre vence a estimativa |
| `index_rates` | CDI, Selic e IPCA por mês, buscados na API pública do Banco Central e guardados para funcionar sem internet |
| `index_days` | o CDI e a Selic diários e o rendimento mensal da poupança, da mesma API, que estimam o valor de caixinha, poupança, CDB, LCI, LCA e Tesouro Selic. Como `index_rates`, não tem `space_id`, não é replicada e não vai para o backup |
| `scenarios` | um conjunto salvo de ajustes sobre uma projeção |

### Trabalho

| tabela | o que guarda |
| --- | --- |
| `saved_filters` | o atalho de uma pessoa para dentro da lista de lançamentos. Privado de quem salvou, mesmo dentro de um espaço compartilhado |
| `changes` | o histórico de alterações. Uma entrada por escrita, com o relógio lógico, o aparelho e o autor. É isto que a sincronização troca e o que a faxina compacta |

### Autenticação

`auth_users`, `auth_sessions`, `auth_accounts` e `auth_verifications` pertencem ao
Better Auth e existem só num servidor. São nomeadas em snake_case como todo o resto,
por um mapeamento explícito de campos, para que o schema se leia como um schema só.

## O que cada papel pode

O modelo inteiro é uma tabela de dados em `packages/storage/src/actor.ts`, para que uma
pessoa possa ler e um teste possa percorrer. A suíte de conformidade falha se um método
de repositório citar uma permissão que não esteja ali.

<!-- roleTable: written by scripts/roleTable.mjs, do not edit by hand -->
| o que | Dono | Administrador | Editor | Leitor | Registrador |
| --- | --- | --- | --- | --- | --- |
| `space.read` | sim | sim | sim | sim | sim |
| `space.update` | sim | sim | não | não | não |
| `space.delete` | sim | não | não | não | não |
| `space.leave` | não | sim | sim | sim | sim |
| `member.read` | sim | sim | sim | sim | sim |
| `member.invite` | sim | sim | não | não | não |
| `member.changeRole` | sim | sim | não | não | não |
| `member.remove` | sim | sim | não | não | não |
| `account.read` | sim | sim | sim | sim | sim |
| `account.create` | sim | sim | sim | não | não |
| `account.update` | sim | sim | sim | não | não |
| `account.archive` | sim | sim | sim | não | não |
| `account.delete` | sim | sim | não | não | não |
| `transaction.read` | sim | sim | sim | sim | sim |
| `transaction.create` | sim | sim | sim | não | sim |
| `transaction.update` | sim | sim | sim | não | sim |
| `transaction.delete` | sim | sim | sim | não | sim |
| `transaction.reconcile` | sim | sim | sim | não | não |
| `category.read` | sim | sim | sim | sim | sim |
| `category.write` | sim | sim | sim | não | não |
| `rule.read` | sim | sim | sim | sim | sim |
| `rule.write` | sim | sim | sim | não | não |
| `recurrence.read` | sim | sim | sim | sim | sim |
| `recurrence.write` | sim | sim | sim | não | não |
| `plan.read` | sim | sim | sim | sim | sim |
| `plan.write` | sim | sim | sim | não | não |
| `sharing.read` | sim | sim | sim | sim | sim |
| `sharing.write` | sim | sim | sim | não | não |
| `filter.read` | sim | sim | sim | sim | sim |
| `filter.write` | sim | sim | sim | sim | sim |
| `activity.read` | sim | sim | sim | sim | não |
| `backup.export` | sim | sim | não | não | não |
| `backup.restore` | sim | sim | não | não | não |
| `investment.read` | sim | sim | sim | sim | sim |
| `investment.write` | sim | sim | sim | não | não |
<!-- /roleTable -->

**O Registrador é o papel para uma criança, ou para quem ajuda na casa.** Ele escreve
lançamentos e vê os lançamentos que escreveu, e mais nada. Isso é aplicado na camada de
repositórios filtrando em vez de recusando, para que nada na tela sugira que há mais
para ver: toda consulta que lê os lançamentos estreita para os dele, o que significa que
os saldos, a projeção, a poupança e as metas dele são leituras do que ele mesmo passou pelo
espaço, e não do dinheiro da casa. Onde um número é do espaço e não de uma pessoa, como o
saldo de abertura de uma conta ou o que uma conta que se repete vai cobrar, ele conta como
nada para ele em vez de entrar na mistura. O diagnóstico é a única leitura que fecha para
ele em vez de estreitar, porque cada limite por trás do veredito dele foi escrito para uma
casa, e um terço de uma casa se lê como uma casa em apuros.

Quatro coisas ficam fora dessa regra de propósito.

1. Ele lê quem deve a quem, porque ele entra nessa conta: ele registra o que gastou e a
   divisão é entre todos.
2. O `activity.read` é a única permissão da matriz que exclui ele, porque o registro do que
   aconteceu no espaço é um registro do que as outras pessoas fizeram.
3. Uma série é uma promessa da casa, e não um lançamento, então a lista delas e o calendário
   que elas preenchem são os mesmos para todo mundo que pode ver. Estreitar isso deixaria um
   mês com cara de vazio. Ele lê essa lista e não escreve nela.
4. Um investimento é dinheiro que a casa tem, e não dinheiro que se moveu, então não há nada
   nele para atribuir a uma pessoa. O único número daquela tela feito de lançamentos, quanto
   tempo o dinheiro duraria sem entrada nenhuma, fecha para ele.

Quatro leituras fecham para ele em vez de estreitar, porque um número desse tipo estreitado
não é o da casa nem o dele: a fatura de um cartão, que é tudo o que o cartão vai cobrar de
quem quer que tenha usado ele; o que resta num cartão de benefício, que é feito de cada
almoço que passou nele; o valor mensal de um cartão de benefício, que conta como nada para
ele como todo número que é do espaço; e o diagnóstico, porque cada limite por trás do veredito
dele foi escrito para uma casa. Quantos lançamentos estão numa conta estreita, como toda
contagem.

Duas respostas diferentes de propósito: quem não é membro de um espaço ouve que o
espaço não existe, porque confirmar que existe já diz alguma coisa sobre o dinheiro dos
outros. Quem é membro ouve, com todas as letras, que o papel dele não permite aquilo.
