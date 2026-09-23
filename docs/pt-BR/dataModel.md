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
| `accounts` | corrente, poupança, dinheiro, crédito, benefício ou investimento. Uma conta de crédito carrega o dia de fechamento, o de vencimento e o limite. Uma conta de benefício carrega qual pote é: refeição, transporte, cultura ou mobilidade |
| `cards` | um cartão é um jeito de alcançar uma conta e não uma conta. Crédito, débito, múltiplo, benefício ou pré pago. Um múltiplo aponta para duas contas, uma de cada lado |
| `transactions` | receita, despesa ou transferência. O valor é sempre positivo e a direção vem do tipo. Previsto ou realizado. Parcelas compartilham um grupo, para que o conjunto possa ser desfeito de uma vez |
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
| `holdings` | o que alguém tem, com a quantidade escalada por dez à oitava, para que um fundo possa ter frações de cota |
| `holding_prices` | o preço de uma posição num dia. Digitado à mão, de propósito: sem cotação automática, sem contar a ninguém de fora o que a pessoa tem |
| `index_rates` | CDI, Selic e IPCA por mês, buscados na API pública do Banco Central e guardados para funcionar sem internet |
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

| | owner | admin | editor | viewer | logger |
| --- | --- | --- | --- | --- | --- |
| ler o espaço | sim | sim | sim | sim | sim |
| mudar o espaço | sim | sim | não | não | não |
| apagar o espaço | sim | não | não | não | não |
| convidar e remover pessoas | sim | sim | não | não | não |
| criar e editar contas | sim | sim | sim | não | não |
| escrever lançamentos | sim | sim | sim | não | sim |
| conciliar um lançamento | sim | sim | sim | não | não |
| editar categorias, regras, séries | sim | sim | sim | não | não |
| definir limites e metas | sim | sim | sim | não | não |
| acertar contas | sim | sim | sim | não | não |
| exportar um backup | sim | sim | não | não | não |

**O logger é o papel para uma criança, ou para quem ajuda na casa.** Ele escreve
lançamentos e vê os lançamentos que escreveu, e mais nada. Isso é aplicado na camada de
repositórios filtrando em vez de recusando, para que nada na tela sugira que há mais
para ver.

Duas respostas diferentes de propósito: quem não é membro de um espaço ouve que o
espaço não existe, porque confirmar que existe já diz alguma coisa sobre o dinheiro dos
outros. Quem é membro ouve, com todas as letras, que o papel dele não permite aquilo.
